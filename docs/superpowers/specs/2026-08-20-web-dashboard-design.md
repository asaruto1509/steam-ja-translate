# Webダッシュボード(ゲーム分析v1) 設計

## 背景

Discordの埋め込みはカスタマイズ性・視認性に天井があり、「ブラウザみたいに自由に見たい」という
要望が出た。既存のOracle Cloud VM(Discord Bot常駐中)を流用し、ブラウザから直接アクセスできる
個人用Webダッシュボードを新設する。まずは`/review`コマンドと同等以上の詳細度を持つ
「ゲーム分析」機能を単体ページとして提供し、動作を確認した後で他の分析機能(ウィッシュリスト、
所持ライブラリ等)を追加していく方針。今回はv1(ゲーム分析ページ)のみをスコープとする。

## 決定事項(ユーザーとの合意内容)

- **対象**: Discord Botの機能ではなく、Chrome拡張機能でもない、独立した新規Webサイト
- **v1の中身**: ゲーム名を検索して単体ゲームのAI分析を見るページのみ。ウィッシュリスト一覧や
  所持ライブラリ分析は次回以降のスコープ
- **技術選定**: Node.js + Express。ビルド工程なしのサーバーサイドレンダリング(素のHTML文字列/
  テンプレート)。このリポジトリの「フレームワークレス」な流儀に合わせる
- **既存コードとの関係**: `bot/lib/steam.js`・`bot/chat.js`・`bot/commands/review.js`の
  純粋関数をそのまま`require()`して再利用する。ロジックの二重管理を避ける
  (`scripts/*.js`は今回対象外、一切触らない)
- **認証**: HTTP Basic認証(`WEB_DASHBOARD_USER`/`WEB_DASHBOARD_PASS`環境変数)で全ページガード。
  加えて`robots.txt`で`Disallow: /`を返し検索エンジンにインデックスさせない
- **秘匿性**: モバイル通信だとIPが変動し固定IP許可制は運用できないため、Tailscaleを導入し
  VM・スマホ・PCで私的ネットワークを構成する。Expressは`127.0.0.1`ではなくTailscale interface
  (`100.x.x.x`)にバインドし、OCI側の公網セキュリティリストはポート3000を一切開放しない。
  外部のポートスキャンには何も応答しない状態になる。Tailscaleは個人利用(〜100台)無料枠内
- **ホスティング**: 既存Oracle Cloud VM上、別systemdサービスとしてポート3000で常駐。
  Tailscale経由でのみアクセス(`http://<TailscaleのVM側IP>:3000`)。ドメイン/HTTPS化は
  今回スコープ外(Tailscale自体がWireGuardで通信を暗号化するため必須ではない)
- **デプロイ**: 既存Botと同じ手動デプロイ(`git pull` → `npm install` → `systemctl restart`)

## アーキテクチャ

```
Oracle Cloud VM
  ├─ bot/index.js          (既存、discord.js常駐プロセス、変更なし)
  └─ web/server.js         (新規、Express常駐プロセス、ポート3000)
       ├─ Basic認証ミドルウェア (全ルート)
       ├─ GET  /            検索フォームを表示
       ├─ GET  /analyze?name=... ゲーム分析結果を表示
       └─ GET  /robots.txt  Disallow: /
```

### コンポーネント

- `web/server.js` — Expressアプリの起動、ミドルウェア登録、ルーティング
- `web/lib/auth.js` — Basic認証ミドルウェア(純粋関数`checkCredentials(user, pass)`と、
  それを使うExpressミドルウェアを分離)
- `web/lib/gameAnalysis.js` — 分析ロジックの取りまとめ。内部で以下を`require()`する:
  - `bot/lib/steam.js`: `searchGame`, `fetchPriceDetail`, `fetchReviewSummary`, `fetchReviewTexts`,
    `storeUrl`, `headerImageUrl`, `fetchGameContext`
  - `bot/chat.js`: `fetchChatReply`(モデルは`qwen3-8b`固定、変更禁止の既存制約を継続)
  - `bot/commands/review.js`: `buildAnalysisPrompt`, `parseAnalysis`
  純粋関数`buildAnalysisViewModel(found, priceDetail, reviewSummary, analysis)`で、
  HTMLテンプレートに渡す表示用オブジェクトを組み立てる(星評価の文字列化、価格表示等)
- `web/views/analysis.js` — `buildAnalysisViewModel`の結果を受け取りHTML文字列を返す
  純粋関数(テンプレートエンジン不使用、タグ関数or文字列結合)
- `web/views/layout.js` — 共通レイアウト(検索フォーム、ヘッダー)を返す純粋関数

### データフロー

1. ユーザーがBasic認証を通過し `/` にアクセス → 検索フォーム表示
2. ゲーム名を入力して送信 → `GET /analyze?name=...`
3. `steamLib.searchGame(name)` でゲームを検索
   - 見つからない場合 → 「見つからなかった」表示で終了
4. 見つかった場合、並行して以下を取得:
   - `fetchPriceDetail(id)` → 価格(nullなら「価格情報なし」表示、既存の`priceFormat`と同じ方針)
   - `fetchReviewSummary(id)` → ポジティブ率・レビュー数
   - `fetchGameContext(id)` → ジャンル/カテゴリ
   - `ONEMIN_API_KEY`が設定されていれば `fetchReviewTexts(id)` → レビューがあれば
     `buildAnalysisPrompt` → `fetchChatReply` → `parseAnalysis` でAI分析(判定/カテゴリ星評価/
     良い点/悪い点/向いてる人)を取得。APIキー無し・レビュー0件・パース失敗時はAI分析欄を省略し、
     価格とレビュー数のみ表示する(既存Botコマンドの失敗時フォールバックと同じ考え方)
5. `buildAnalysisViewModel` で表示用データに整形 → `views/analysis.js` でHTML化して返す

## エラー処理

- Steam API・1min.ai呼び出し失敗はプロセスを落とさず、該当セクションを「取得できませんでした」
  表示に差し替える(常駐プロセスのため単発障害で落ちてはいけない、既存Botと同方針)
- Express全体の予期しない例外は共通エラーハンドラで捕捉し、500ページを返してログ出力のみ行う

## テスト方法

- `web/lib/gameAnalysis.js`の`buildAnalysisViewModel`、`web/views/*.js`のHTML組み立て関数は
  純粋関数として`node:test`でユニットテストを書く(TDD、既存Botコマンドと同じ方針)
- `web/lib/auth.js`の`checkCredentials`も純粋関数としてユニットテスト対象
- Expressルートハンドラ(I/O層)・実際のHTTPサーバー起動はテスト対象外
  (既存Botの`handleXCommand`と同じ方針、I/Oは手動確認)
- 手動確認: VM上で`web-dashboard.service`を起動し、ブラウザから実際に検索→分析結果表示を確認する

## 事前準備(ユーザー側の作業、実装対象外)

- VM・スマホ・PCそれぞれにTailscaleをインストールし同一アカウントで私的ネットワークに参加
  (OCIのセキュリティリストは変更不要、ポート3000は公網に一切開けない)
- VM上でTailscaleが払い出したIP(`tailscale ip -4`で確認)を控えておく(Express起動時の
  バインドアドレスに使う)
- `web/.env`に `WEB_DASHBOARD_USER` / `WEB_DASHBOARD_PASS` / `STEAM_ID64`(将来のウィッシュリスト
  機能用に先に用意しておく) / `ONEMIN_API_KEY` / `BIND_HOST`(TailscaleのIP) を設定
- systemdユニットファイル(`web-dashboard.service`)をVM上に配置し`systemctl enable --now`

## スコープ外(v1では実装しない)

- ウィッシュリスト一覧・所持ライブラリ分析(次回以降)
- ドメイン・HTTPS化・リバースプロキシ経由アクセス
- 拡張機能のローカルデータ(ブックマーク・翻訳履歴)との同期
- 複数ユーザー対応(単一Basic認証アカウントのみ)
