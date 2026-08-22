# Webダッシュボード: ゲームルーレット機能 設計

## 背景

ユーザーから「積みゲーおすすめルーレット」と「おすすめゲームもルーレットで」という要望。単なるテキストでの提案ではなく、スロットマシン風のアニメーションで結果が出る、ゲーム性のある体験を求められている。

利用シーンは2つ、完全に独立したページとして分ける:
1. 積みゲー(所有しているのにほぼ遊んでいないゲーム)から1本ランダムに選んで遊ぶきっかけを作る
2. Steamの新作/セール一覧(既存の`/recommend`と同じプール)から1本選んで出会いを作る

両者は「候補リストを取得し、1件を当選させ、スロットアニメーションで見せる」という骨格が同じなので、アニメーション部分(HTML/CSS/クライアントJS)は共有し、候補取得ロジックだけモード別に分ける。

## 決定事項

- **ページ構成**: `/roulette/backlog`と`/roulette/recommend`の2つの独立したページ(タブ切り替えではない)。
- **アニメーション形式**: 縦スロット(スロットマシン風)。候補のヘッダー画像を縦に並べたリールが高速スクロールした後、徐々に減速して中央の枠に当選ゲームが止まる。円形ルーレットや横カルーセルは不採用(実装コストと視覚効果のバランスでスロットを選択)。
- **当選決定はサーバー側**: クライアントは乱数を持たない。`POST /api/roulette/<mode>/spin`が候補リストと`winnerIndex`を確定させて返し、クライアントは純粋に見た目のアニメーションだけを担当する。不正操作の余地がなく、ロジックのテストも容易。
- **積みゲー判定基準**: `playtime_forever < 120分`(2時間未満)。Steam公式Web API `GetOwnedGames`(`include_played_free_games=1`)を新規に叩く。これには新しい`STEAM_API_KEY`(通常のWeb APIキー、ユーザーが取得済み)が要る。プロフィールとゲーム詳細が非公開の場合は0件になる(エラー処理で対応)。
- **おすすめモードの当選バイアス**: 均等ランダムではなく、既存の`/recommend`修正(`scripts/recommend-games.js`の`pickAnalyzableGames`)と同じ「レビューがある候補を優先」ロジックを流用する。理由: せっかく回して当たったゲームが分析ページで価格だけのスカスカな表示だと体験が悪いため。積みゲーモードは(ユーザー自身が購入した実績のあるタイトル群なので相対的にメジャーな傾向があり)均等ランダムのままでよい。
- **Bot(Discord)側は対象外**: アニメーションはWebでしか表現できないため、今回はWebダッシュボードのみ。Discord向けの軽量版(即座にテキストで結果を返す版)は別の機会に検討する。
- **`bot/**`・`scripts/**`は一切変更しない**(既存の標準制約)。`scripts/recommend-games.js`の`fetchFeaturedPool`/`pickRealGames`(`bot/lib/gamePool.js`)/`pickAnalyzableGames`を読み取り専用で再利用する。

## アーキテクチャ

```
GET /roulette/backlog
  → 静的なページシェル(空のリール+「回す」ボタン)を返すのみ。候補取得はしない。

POST /api/roulette/backlog/spin
  → steamLib.fetchOwnedGames(steamId64, apiKey) (新規、GetOwnedGames)
  → backlogPool.filterBacklog(games, 120) で積みゲーだけに絞る
  → 0件ならエラーJSON
  → 候補をシャッフルし、最大12件に切り詰める(12件未満ならある分だけ使う。多すぎるとリール読み込みが重いための上限)
  → roulette.pickWinner(candidates, Math.random) で当選を決定
  → { candidates: [{id,name,imageUrl}], winnerIndex } を返す

GET /roulette/recommend
  → 同様の静的ページシェル

POST /api/roulette/recommend/spin
  → recommendGames.fetchFeaturedPool() → pickRandomGames → gamePool.pickRealGames で実在ゲームを最大10件選定(10件未満ならある分だけ)
  → 各候補のレビューを取得(既存の/recommend修正と同じ流れ)
  → レビュー件数が3件以上ある候補だけを抽出し、1件以上あればその部分集合から roulette.pickWinner で当選を選ぶ
    (該当インデックスは元のcandidates配列上のインデックスに変換する)。0件ならcandidates全体からpickWinnerで選ぶ
  → { candidates: [{id,name,imageUrl}], winnerIndex } を返す

クライアントJS(共通):
  「回す」ボタン押下 → fetch(spin API) → 候補リストをDOMに5〜8回ループ複製してリール生成
  → CSS transitionでtranslateYを大きく動かし、winnerIndexの実際の座標にちょうど止まるオフセットを計算
  → アニメーション終了後、当選ゲーム名・画像・「詳しく見る」リンク(/analyze?name=...)を表示
```

## コンポーネント

### `web/lib/backlogPool.js`(新規)

- `fetchOwnedGames(steamId64, apiKey)` — I/O。`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=...&steamid=...&include_appinfo=1&include_played_free_games=1`を叩き、`[{id, name, imageUrl, playtimeMinutes}]`を返す。プロフィール非公開等でレスポンスに`games`が無ければ`[]`。
- `filterBacklog(games, maxMinutes)` — 純粋関数。`playtimeMinutes < maxMinutes`のものだけ返す。TDDでテスト。

### `web/lib/roulette.js`(新規)

- `pickWinner(candidates, rng)` — 純粋関数。`rng`未指定時は`Math.random`(既存`pickRandomGames`と同じ注入パターン)。`candidates`から1件選び、そのインデックスを返す。TDDでテスト。
- `buildSpinPayload(candidates, winnerIndex)` — 純粋関数。`{id,name,imageUrl}`の配列に整形し`{candidates, winnerIndex}`を返す(候補の余分なフィールド、例えば`playtimeMinutes`をクライアントに漏らさないための整形層)。TDDでテスト。

### `web/views/roulettePage.js`(新規)

- `renderRoulettePage(opts)` — `opts = {title, spinEndpoint, backLinkText}`。リール用の空コンテナ・「回す」ボタン・結果表示エリアのHTMLを返す純粋関数。TDDでテスト(タイトル・エンドポイント・戻るリンクの反映を確認)。

### `web/server.js`(既存拡張)

- `GET /roulette/backlog` / `GET /roulette/recommend` — `roulettePage.renderRoulettePage(...)`をレイアウトに埋め込んで返す。
- `POST /api/roulette/backlog/spin` / `POST /api/roulette/recommend/spin` — 上記アーキテクチャ節の通り。I/Oオーケストレーションとして無テスト(既存方針通り)。

### `web/views/layout.js`(既存拡張)

- リール用CSS(縦スクロールコンテナ、中央固定枠のハイライト、減速アニメーション用の`transition-timing-function`)。
- クライアントJS: 「回す」ボタンのfetch呼び出し・リールDOM生成・オフセット計算・アニメーション完了検知(`transitionend`)・結果表示。既存のチャット機能と同じくバニラJS、ビルドツールなし。

### トップページ導線

- `web/views/topPage.js`に「🎰 積みゲールーレット」「🎰 おすすめルーレット」の2つのリンクを追加する。

## データフロー

「回す」ボタン押下 → fetch(spin API) → サーバーが候補+当選をJSONで返す → クライアントがDOM上に候補画像をループ配置 → CSSアニメーションで当選位置まで動いて停止 → 当選ゲームの詳細(名前・画像・分析ページへのリンク)を表示。ページ再読み込みで状態はリセットされる(結果の永続化はしない — 「回すたびに新しい抽選」という体験を優先)。

## エラー処理

- 積みゲー0件(全ゲームが2時間以上プレイ済み、またはプロフィール非公開): spin APIが`{error: 'no_candidates'}`相当を返し、クライアントはアニメーションを開始せず「対象のゲームが見つかりませんでした(プロフィールが非公開の可能性があります)」を表示。
- `STEAM_API_KEY`未設定: 積みゲーモードのspin APIは同様のエラーメッセージ(「積みゲー機能の設定が未完了です」)を返す。おすすめモードはこのキーを使わないため影響しない。
- おすすめモードの候補取得失敗(Steam API障害等): spin APIが500を返し、クライアントは「候補の取得に失敗しました。もう一度試してください」を表示。
- 個別ゲームのレビュー取得失敗(おすすめモード): 既存の`/recommend`と同様、その候補は「レビューなし」として扱われるだけで全体は失敗しない。

## テスト方針

- `web/lib/backlogPool.js`: `filterBacklog`をTDDでテスト。`fetchOwnedGames`はI/Oのため無テスト。
- `web/lib/roulette.js`: `pickWinner`・`buildSpinPayload`をTDDでテスト(RNG注入で決定的にテスト可能)。
- `web/views/roulettePage.js`: `renderRoulettePage`をTDDでテスト。
- `web/server.js`の新規ルート: 既存方針通り無テスト、実際の`STEAM_API_KEY`/`STEAM_ID64`を使った手動E2E検証を行う。
- クライアントJS: 自動テスト基盤がないため無テスト。手動ブラウザ確認。

## スコープ外

- Discord Bot側の軽量版コマンド。
- 当選結果の永続化・共有機能。
- 円形ルーレット/横カルーセルなど他のアニメーション形式。
- 積みゲー判定基準のユーザー設定化(閾値2時間は固定値)。
- レート制限・スパム対策(個人利用のダッシュボードのため対象外、既存方針と同じ)。
