# ウィッシュリスト値下げ通知のサーバーレスcron移行 設計

## 背景・課題

現在のDiscordウィッシュリスト値下げ通知は、Chrome拡張機能の`background.js`が
`chrome.alarms`(1日1回)で発火し、ログインセッションCookie付きでSteamの
`dynamicstore/userdata/`を叩いて自分のウィッシュリストを取得している。

この方式は**ブラウザ(Chrome/Edge)が起動していないと動かない**。ユーザーは常時稼働
サーバーを持っていないため、ブラウザを閉じていても通知が届くようにしたい。

## 決定事項(ユーザーとの合意内容)

- **ホスティング先**: GitHub Actions のscheduled workflow(完全無料)
- **認証方式**: Steamプロフィール/ウィッシュリストをPublicに変更し、ログイン不要の
  公開API経由で取得する(フレンドリスト・インベントリは非公開のままでよい)
- **価格履歴の保存**: リポジトリ内の`price_history.json`をワークフロー自身が
  git commit & push して永続化する(外部KV/DBは使わない)
- **拡張機能側の`chrome.alarms`自動チェックは無効化**し、二重通知を防ぐ。
  拡張機能はページ上のAI分析・バッジ等のUI機能に専念する
- **AI判定(値下げ3件以上時のベスト3ランキング)も最初から再現する**。
  使用モデルはQwen3-8B(1min.ai、無料)。単一のverdictラベルだけを返す軽量プロンプト
  にするため、今回のセッションで見つかったJSON出力の不安定さ(テンプレート文字列の
  書き写し)のリスクは低い想定
- リポジトリは**Private**で作成する(価格履歴・SteamIDが入るため)
- リポジトリ作成はユーザーがインストール済みのGitHub Desktopの
  「Publish repository」機能を使う(`gh` CLIが環境に無いため)

## アーキテクチャ

```
GitHub Actions (毎日1回, cron + workflow_dispatchで手動実行も可能)
  └─ scripts/check-wishlist-prices.js (Node.js, 拡張機能とは独立した新規スクリプト)
       1. 公開ウィッシュリストAPIでSteamID64から一覧取得(ログイン不要)
       2. 各ゲームの現在価格をSteam appdetails APIで取得(filters=basic,price_overview&cc=jp)
       3. リポジトリ内 price_history.json と比較し値下げ検知
          (既存のcheckWishlistPricesと同じ「閾値未満の下落ではhist値を更新しない」方針を踏襲)
       4. 値下げ1件 → シンプルな通知
          値下げ3件以上 → 該当ゲームのレビューを公開レビューAPI
            (store.steampowered.com/appreviews/<appid>?json=1)で取得し、
            Qwen3-8B(1min.ai)にverdictラベルのみを問い合わせるライトプロンプトで判定
            → VERDICT_RANKで並べ替えてベスト3抽出
       5. Discord webhookに通知送信(既存のembed形式を踏襲)
       6. price_history.json を更新してgit commit & push
```

### 変更ファイル

- 新規: `.github/workflows/wishlist-price-check.yml` — scheduled workflow定義
- 新規: `scripts/check-wishlist-prices.js` — Node.js実装(既存main.js/background.jsの
  ブラウザ専用コード(chrome.*API、DOM操作)は一切再利用できないため独立実装)
- 新規: `price_history.json` — 初期状態は空オブジェクト`{}`。以降ワークフローが自動更新
- 変更: `background.js` — `ensureWishlistAlarm`の呼び出し(`chrome.runtime.onInstalled`/
  `onStartup`リスナー内)と`chrome.alarms.onAlarm`のウィッシュリストチェック分岐を
  コメントアウトして無効化。関数自体は削除せず残す(将来的に戻す可能性のため)

### 必要なSecrets(GitHubリポジトリのSettings → Secrets and variables → Actions)

- `DISCORD_WEBHOOK_URL`
- `ONEMIN_API_KEY`
- `STEAM_ID64` (機微情報ではないが、Secretsに入れておけば変更時にコード修正不要)

## エラー処理

- 個別ゲームの価格取得・レビュー取得の失敗は、そのゲームだけスキップして処理継続
  (既存`checkWishlistPrices`の「1件失敗してもスキップ」方針を踏襲)
- AI判定(verdict)取得に失敗した場合は「判定なし」としてダイジェストに含める
  (既存の`verdictMap[id]`未登録時のフォールバック表示と同じ扱い)
- git push が競合(他のジョブと同時実行等)した場合はリトライせず次回実行に委ねる
  (1日1回の実行頻度なら実質発生しない想定)

## テスト方法

1. `workflow_dispatch`トリガーを追加しておき、GitHub Actionsタブから手動実行できるようにする
2. 手動実行して以下を確認:
   - ウィッシュリスト取得が成功する(件数がログに出る)
   - 価格取得が成功する
   - `price_history.json`が正しくcommitされる
   - (値下げが実際に発生しているタイミングで)Discordに通知が来る、embed内容が
     既存のブラウザ発の通知と同等の見た目になっている
3. 確認後、scheduleトリガー(cron)を本番運用として有効にする

## スコープ外(今回やらないこと)

- 拡張機能側`chrome.alarms`コードの完全削除(無効化のみ、コードは残す)
- 外部KV/DBへの移行(price_history.jsonのgit管理で十分な規模のため)
- AI判定以外のリッチな分析(トピック抽出・リスクフラグ等)をDiscord通知に含めること
  (verdictラベルのみ)
