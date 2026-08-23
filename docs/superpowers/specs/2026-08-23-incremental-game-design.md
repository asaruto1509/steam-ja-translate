# Webダッシュボード: 積みゲー消化工場(インクリメンタルゲーム) 設計

## 背景

ルーレット機能に200種のユニークなスキルツリーを乗せる案を検討していたが、既存の調整可能な要素(配当率・ジャックポット増分・各種確率など)は25〜30個程度で、それを段階分けしても「効果の強弱違い」の域を出ず、ユーザーが明示的に拒否した「数値を盛るだけ」の構造になってしまうことが判明した。真にユニークな200効果を作るには15〜20個の新規メカニクスが必要という話をしたところ、ユーザーから「じゃあ新規で独立したインクリメンタルゲーム作れる?」と提案があった。

ルーレットに無理やり機能を積み増すのではなく、放置・育成系のインクリメンタルゲームを完全に別の新規サブシステムとして作ることで合意した。200スキルツリー案はここで終了し、この設計に置き換える。

## 決定事項

- **完全に別ゲーム**: ルーレットは一切変更しない。新規ページ`/incremental`として追加する。
- **テーマ**: 積みゲー会社経営。ユーザーが実際に所有する積みゲー(プレイ時間の少ないゲーム)が「従業員」となり、放置すると自動でDP(開発資金)を稼ぐ。
- **実データを使う**: 従業員のネタは既存の`backlogPool.fetchOwnedGames`/`filterBacklog`で取得できる実際の積みゲーリストを流用する。架空の名前は使わない。
- **通貨は一方通行の交換制**: ルーレットのクレジットを一定レートで新通貨DP(開発資金)に交換できる。DP→クレジットの逆交換は存在しない。DPがインクリメンタル側で指数的に増えても、ルーレットの数値バランス(スピンコスト・配当設計)には一切影響しない。ユーザーからの明示的な懸念(「インフレしすぎてしまう」)への対応。
- **ジャンルは古典的な放置ゲーム型(Cookie Clicker型)**: 手動クリック + 自動生成装置(従業員)の指数コスト購入 + オフライン進行 + プレステージ。この型を選んだ理由: 実装パターンが確立していてテストも書きやすく、プレステージがあるため将来のコンテンツ追加が容易(200スキルツリー案が抱えていた「深みを求められて破綻する」問題を避けられる)。
- **既存の実績・統計システムとは統合しない**: 実績(`ja_trans_achievements_v1`)・統計(`ja_trans_stats_v1`)はルーレット専用のまま変更しない。インクリメンタル側は独立した永続化キーを持つ。
- **隔離実装**: `web/views/layout.js`は既に肥大化している(1700行超、巨大な文字列連結script)ため、この新規ページの巨大化を避けるべく、クライアントJSは`layout.js`の共有scriptブロックに追加せず、`incrementalPage.js`自身が返すHTMLの中に専用の`<script>`タグとして完結させる。他のページのレンダリング方式(`renderLayout(bodyHtml, opts)`にトラステッドな文字列を渡す)と矛盾しない。

## アーキテクチャ

```
GET /incremental
  → incrementalPage.renderIncrementalPage(opts) をlayout.renderLayoutに埋め込んで返す
  → ページ自体は空のUIシェル(所持DP=0表示等はクライアントJSがlocalStorageから復元)

GET /api/incremental/roster
  → backlogPool.fetchOwnedGames(steamId64, apiKey) → filterBacklog
  → プロセス内メモリキャッシュ(TTL 1時間、既存server.jsのrealGameCacheと同じ手口。Steam APIのレート制限対策)
  → { roster: [{id, name, imageUrl}, ...] } を返す(最大12件。従業員tier数を12固定とし、rosterの件数もそれに合わせる)
  → 積みゲーが0件、またはSTEAM_API_KEY/STEAM_ID64未設定の場合はrosterが空配列。クライアント側は
    汎用の仮名("従業員A"等)にフォールバックする(積みゲーが少ない/ゼロのユーザーでもゲーム自体は遊べる)

クライアントJS(incrementalPage.js内に完結):
  ページロード時:
    1. localStorageから dp / owned[] / lastTick / lifetimeDp / prestigeMult を復元
    2. lastTickとの経過秒数からオフライン進行分のDPを一括加算(上限8時間ぶんにキャップ)、
       「おかえりなさい、+XX DP」トーストを表示
    3. fetch(/api/incremental/roster) してtier名をrosterの名前で上書き(取得失敗時は仮名のまま)
    4. setInterval(1秒毎)でティック: dp += Σ(tier[i].owned * tier[i].outputPerSec) * prestigeMult
  手動クリックボタン: dp += CLICK_BASE * prestigeMult (小さな即時収入)
  従業員購入ボタン(tierごと):
    cost = tier.baseCost * Math.pow(tier.growth, tier.owned)
    dp>=cost なら dp-=cost; tier.owned++; 購入毎にcostは指数的に上昇
  クレジット交換ボタン:
    ja_trans_roulette_credits_v1 を直接読み、ユーザー入力枚数 × 交換レートぶんクレジットを減算、
    DPを加算(ルーレット側のsetCreditsと同じ書式でlocalStorageに書き戻す)
  プレステージボタン(「新年度リセット」):
    確認ダイアログ → dp=0, owned=[0,0,...] にリセット
    prestigeMult = 1 + PRESTIGE_COEF * Math.sqrt(lifetimeDp / PRESTIGE_DIVISOR) を再計算して永続化
    lifetimeDpはリセットしない(永続倍率の計算根拠として残す)
```

## コンポーネント

### `web/lib/backlogPool.js`(既存、変更なし)

- `fetchOwnedGames`/`filterBacklog`をそのまま再利用する。ルーレット用に作られたものだが、汎用の「積みゲー取得」関数として問題なく転用できる。

### `web/server.js`(既存拡張)

- `GET /incremental` — ページシェルを返す。
- `GET /api/incremental/roster` — 上記アーキテクチャ節の通り。I/Oオーケストレーションとして無テスト(既存方針通り)。realGameCacheと同様のプロセス内キャッシュ変数を新設する。

### `web/views/incrementalPage.js`(新規)

- `renderIncrementalPage(opts)` — 純粋関数。UIシェル(DP残高表示・クリックボタン・従業員一覧・交換UI・プレステージボタン)のマークアップと、それを動かす専用`<script>`タグの両方を文字列で返す。TDDでテスト(既存の`roulettePage.test.js`/`layout.test.js`と同じ、レンダリング結果への文字列/正規表現アサーション方式)。

### `web/views/topPage.js`(既存拡張)

- 「🏭 積みゲー消化工場」へのリンクを追加する。

## データフロー

積みゲーリストはページロード時に1回`/api/incremental/roster`から取得するのみ(スピン系のような都度fetchはしない)。それ以外の状態(DP・従業員所持数・最終ティック時刻・プレステージ倍率)は全てクライアント側localStorageで完結し、サーバーとの通信は発生しない。この点は既存のルーレット/ショップの設計方針と同じ。

## 永続化キー(localStorage、すべて新規)

- `ja_trans_incremental_dp_v1` — 現在のDP残高
- `ja_trans_incremental_owned_v1` — 従業員tierごとの所持数(JSON配列)
- `ja_trans_incremental_lasttick_v1` — 最終ティック時刻(オフライン進行計算用)
- `ja_trans_incremental_lifetimedp_v1` — 累計獲得DP(プレステージ倍率の計算根拠、リセット対象外)
- `ja_trans_incremental_prestige_v1` — 現在のプレステージ倍率

既存の`RESET_KEYS`(ショップページの「データリセット」機能)には含めない。ルーレットのリセットボタンは「ルーレットのデータ」限定であり、インクリメンタル側は別ゲームとして別途リセット手段を持つべきという整理(インクリメンタルページ側に独自の「工場をリセット」的なデータ消去ボタンを置くかは実装時の追加検討事項とし、このリセット動線の欠如自体はスコープ外にしない — 最低限「プレステージ」がソフトリセットの役割を果たす)。

## エラー処理

- roster取得失敗(Steam API障害・未設定): クライアントは仮名tier("従業員A"等)にフォールバックし、ゲーム進行自体は妨げない。
- クレジット交換時にクレジット残高不足: 交換ボタンは実行せず、エラーメッセージを表示するのみ(ルーレット側のクレジットは減らさない)。
- localStorage読み取り不能な壊れた値(手動改ざん等): 既存のcredits/jackpot読み込み関数と同じ防御パターン(`isFinite`チェック、範囲外なら初期値にフォールバック)を踏襲する。

## テスト方針

- `web/views/incrementalPage.js`: `renderIncrementalPage`をTDDでテスト。従業員tier数・クリックボタン・交換UI・プレステージボタンの存在、コスト計算式・オフライン進行計算式・プレステージ倍率計算式が期待通りの文字列としてクライアントscript内に出力されているかを正規表現でアサートする(既存の`roulettePage.test.js`/`layout.test.js`と同じ流儀)。
- `web/server.js`の新規ルート: 既存方針通り無テスト、手動E2Eで確認(積みゲーあり/なし両方のケース)。
- クライアントJS: 自動テスト基盤がないため無テスト。静的レンダリング+ローカルHTTPサーバー+ブラウザでの手動確認(このセッションで確立済みのワークフロー)を行う。

## スコープ外

- DP→クレジットの逆交換。
- マルチプレイ・ランキング・他プレイヤーとの比較。
- 既存の実績・統計システムとの統合。
- インクリメンタル専用の「データ全リセット」ボタン(プレステージがソフトリセットの役割を果たすため、初回実装では見送る。要望があれば別途追加)。
- 従業員tier数・コスト成長率・交換レート等の数値バランスのユーザー設定化(初回実装は固定値、実機で遊びながら調整する前提)。
