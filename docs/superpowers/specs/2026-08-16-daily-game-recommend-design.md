# 毎日のおすすめゲーム通知 設計

## 背景

ウィッシュリスト値下げ通知(別プラン、実装済み・稼働中)とは別に、毎日Steamの売上上位/新作から
ランダムに5本ピックアップし、価格とAI分析(良い点/懸念点/購入判断)を添えてDiscordに通知する。

## 決定事項(ユーザーとの合意内容)

- **選定元**: Steamの「売上上位」「新作」タイトル(公開API、ウィッシュリストとは無関係)
- **重複回避なし**: 前日以前に紹介したタイトルの重複は気にしない。毎回完全ランダム
- **AI分析は5本全部**: Qwen3-8B(1min.ai)で各ゲームを個別に分析する
- **見た目重視**: Discordメッセージ1通に、ゲームごとに個別のembed(最大10個/メッセージ許容枠のうち5個使用)を送り、
  ストア画像付きのカード形式で表示する
- 実行スケジュールは既存の値下げ通知cronとは別時刻にする(同じ1min.aiキーへの同時アクセスを避ける)

## データソース

`https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese` — 公開API、認証不要。
`top_sellers`(10件)と`new_releases`(30件)の`items`配列を結合し、計40件のプールから5件を無作為抽出する。
各itemは `{id, name, final_price, original_price, discount_percent, large_capsule_image, ...}` を含む
(curlで実データ確認済み)。

## アーキテクチャ

```
GitHub Actions (毎日1回, 値下げ通知cronとは別時刻 + workflow_dispatchで手動実行可能)
  └ scripts/recommend-games.js (Node.js)
       1. featuredcategories APIから top_sellers + new_releases を取得し40件のプールを作る
       2. 無作為に5件選出(重複回避ロジックなし)
       3. 各ゲームのレビューを既存のcheck-wishlist-prices.jsのfetchReviewsを再利用して取得
          (appidベースの汎用関数のため、ウィッシュリスト機能に依存しない — DRYな正当な再利用)
       4. Qwen3-8B(1min.ai)に軽量JSON形式で個別に問い合わせる:
          {"verdict":"今すぐ買い/買い/セール待ち/人を選ぶ/見送り","reason":"一言理由","good":["良い点1","良い点2"],"concern":"懸念点"}
          ※本日発生した「複雑なJSONスキーマだとAIが指示文の書き写しを返す」不具合を踏まえ、
            スキーマを4項目に絞り、既存main.jsの`_isLeakedString`と同じ手法(数値+「字以内」パターン検出)で
            書き写し文字列を検出しnull化する軽量ガードを入れる
       5. ゲームごとに個別のDiscord embed(画像・価格・AI判定・理由・良い点・懸念点)を組み立て、
          1メッセージにまとめて送信(embeds配列に5個)
```

### 変更ファイル

- 新規: `scripts/recommend-games.js` — 純粋関数(`pickRandomGames`, `parseGameAnalysis`, `buildRecommendEmbeds`)
  とI/O関数(`fetchFeaturedPool`, `fetchGameAnalysis`, `sendDiscordEmbeds`)+ `main()`
- 新規: `scripts/recommend-games.test.js` — 純粋関数のユニットテスト
- 新規: `.github/workflows/daily-game-recommend.yml` — schedule(値下げ通知と別時刻)+ workflow_dispatch

### 既存コードの再利用

`scripts/check-wishlist-prices.js`から`fetchReviews`を`require`して再利用する(appidと件数だけを
引数に取る汎用関数のため、ウィッシュリスト固有のロジックを含まない)。価格取得は`featuredcategories`の
レスポンスに`final_price`が既に含まれるため、別途`fetchPrice`を呼ぶ必要はない。

### 必要なSecrets

既存の`DISCORD_WEBHOOK_URL`・`ONEMIN_API_KEY`をそのまま再利用する(新規追加不要)。

## エラー処理

- 個別ゲームのレビュー取得・AI分析の失敗は、そのゲームだけスキップして残り4本で続行
  (既存cronと同じ「1件失敗しても継続」方針)
- 5本中1本もAI分析が成功しなかった場合でも、価格情報だけのシンプルなembedとして送信する
  (「今日のおすすめが1本も無い」より「AI分析なしでも紹介はする」方を優先)
- featuredcategories自体の取得に失敗した場合は既存の空ウィッシュリスト対応と同じく
  エラー終了(process.exit(1))してGitHub Actions側に失敗を通知する

## テスト方法

`workflow_dispatch`で手動実行し、Discordに5枚のカードが画像付きで表示されるか確認する。

## スコープ外

- 重複回避ロジック(ユーザーが不要と明言)
- ウィッシュリストとの連携(完全に独立した選定ロジック)
