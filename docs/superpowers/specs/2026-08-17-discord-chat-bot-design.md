# Discordチャット応答Bot 設計

## 背景

既存の値下げ通知・毎日のおすすめゲーム(GitHub Actions cron + webhook)は「一方的に送るだけ」で、
ユーザーからのメッセージには反応できない。ユーザーからDiscord上で会話・コマンド操作したいという
要望があり、Oracle Cloud Free Tierのアカウント登録が完了したことで、常時起動プロセスを前提にした
新しいBotサブシステムを追加する。

## 決定事項(ユーザーとの合意内容)

- **役割**: 自由会話(AI応答) + スラッシュコマンドの両方
- **自由会話の発火範囲**: 特定チャンネルの全発言に反応(メンション/DMは対象外の追加条件ではなく、
  指定チャンネル内であれば無条件に反応する)
- **スラッシュコマンド**: `/price`, `/recommend`, `/review`, `/wishlist` の4つ
- **技術選定**: Node.js + discord.js。既存の`scripts/check-wishlist-prices.js`・
  `scripts/recommend-games.js`の関数をそのまま`require()`して再利用する(Python化は却下、
  ロジックの二重管理を避けるため)
- **デプロイ**: Oracle Cloud Free Tier VM上でsystemd常駐。Docker化は個人用単一プロセスには
  オーバースペックのため見送り
- **運用**: 手動デプロイ(`git pull` → `npm install` → `systemctl restart`)。CI/CD自動化は
  このプロジェクトの規模では不要と判断

## アーキテクチャ

```
Oracle Cloud VM (systemd常駐プロセス)
  └ bot/index.js (discord.jsクライアント、Gateway接続)
       ├─ messageCreate イベント → bot/chat.js
       │    指定チャンネルの全発言に反応。直近数件をメモリ内履歴として保持し、
       │    新規メッセージと合わせてQwen3-8B(1min.ai)にプロンプトを渡して返信を生成する。
       │    履歴はプロセスメモリ上のみ(再起動でリセット、DB等の永続化は行わない)。
       │
       └─ interactionCreate イベント → bot/commands/{price,recommend,review,wishlist}.js
            各ハンドラは既存scriptsの関数を呼び出し、今回のUI改善(image埋め込み・
            verdict色分け)と同じ見た目のembedを組み立てて返信する。
```

### コンポーネント

- `bot/index.js` — discord.jsクライアントの初期化、イベントリスナー登録、スラッシュコマンドの
  Discord API登録(起動時に一括登録)
- `bot/chat.js` — 自由会話ハンドラ。純粋関数`buildChatPrompt(history, newMessage)`で
  プロンプト文字列を組み立てる部分と、実際にAPIを呼んでメッセージ送信するI/O部分を分離する
- `bot/commands/price.js` — `require('../../scripts/check-wishlist-prices.js').fetchPrice`を
  使い、指定ゲームの現在価格・割引率を返す
- `bot/commands/recommend.js` — `require('../../scripts/recommend-games.js')`の
  `fetchFeaturedPool`/`pickRandomGames`/`fetchGameAnalysis`/`buildRecommendEmbeds`を使い、
  その場で2〜3本をAI分析付きでおすすめする
- `bot/commands/review.js` — `check-wishlist-prices.js`の`fetchReviews`/`fetchVerdict`を使い、
  指定ゲームのレビューをAI要約して買い判断を返す
- `bot/commands/wishlist.js` — `fetchWishlist`/`fetchPrice`を使い、自分のウィッシュリスト中で
  現在値下げされているタイトルを一覧表示する(既存の`STEAM_ID64`環境変数を再利用)

### 既存コードとの関係

`scripts/*.js`は一切変更しない。Botはそれらのモジュールを読み取り専用で`require()`するだけの
新しい消費者として追加する。cronスクリプトとBotプロセスは完全に独立して動作する
(片方が落ちてももう片方に影響しない)。

## エラー処理

- 1min.ai・Steam APIの呼び出し失敗は、プロセスを終了させずにDiscordへ「取得できませんでした」
  という趣旨の返信を送るだけにとどめる(常駐プロセスのため、単発のAPI障害でBotが落ちてはいけない)
- discord.jsクライアントの`error`/`shardError`イベントをログ出力のみで捕捉し、プロセスは
  継続させる(Gateway再接続はdiscord.jsの標準機能に任せる)

## テスト方法

- `bot/chat.js`の`buildChatPrompt`、および各コマンドハンドラ内の純粋な整形ロジック
  (embed組み立て等)は、既存scriptsと同じくNode.js標準の`node:test`でユニットテストを書く
- discord.jsのイベント配線・実際のGateway接続はI/O層としてテスト対象外とする
  (既存cronスクリプトのfetch系関数と同じ方針)
- 手動確認: Oracle VM上でBotを起動し、指定チャンネルでの雑談応答と4つのスラッシュコマンドを
  それぞれ実行して動作確認する

## 事前準備(ユーザー側の作業、実装対象外)

- Discord Developer PortalでBotアプリケーションを新規作成
- `MESSAGE CONTENT INTENT`(特権インテント)を有効化
- Botをサーバーに招待し、自由会話用チャンネルを指定
- Oracle Cloud VM上にNode.js実行環境を用意

## スコープ外

- 複数サーバーでの汎用運用(個人サーバー1つのみを想定)
- 会話履歴の永続化(DB導入は行わない、プロセスメモリのみ)
- CI/CDによる自動デプロイ
