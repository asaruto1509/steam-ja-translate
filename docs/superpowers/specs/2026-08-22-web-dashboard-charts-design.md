# Webダッシュボード: グラフ表示・分析拡充 設計

## 背景

Webダッシュボードの改善4項目(UX改善→分析精度強化→複数ゲーム対応→**新機能追加**)のうち最後の項目。ユーザーから「分析情報をもっと増やして、グラフなどを駆使して見やすく」という要望があった。

要望には「AIとの会話機能」も含まれていたが、これは会話履歴の保存・チャットUIという別種の新機能であり、規模も大きいためスコープを分離した(別途、後続のspec/planで扱う)。本specは以下4点の視覚化・拡充機能を対象とする:

1. 価格推移の折れ線グラフ
2. カテゴリ別星評価の棒グラフ化
3. レビュー好悪内訳の円グラフ化
4. 類似ゲーム比較表(5件)

## 決定事項

- **チャート描画方式**: サーバー側で生成する手組みのインラインSVG文字列。既存の「ビルドツールなし・SSRのみ」方針に合わせ、外部チャートライブラリ(CDN経由含む)は使わない。`node:test`でSVG文字列の内容を直接アサートできるようテストしやすさも兼ねる。
- **価格推移データソース**: [IsThereAnyDeal API](https://docs.isthereanydeal.com/)(無料登録制の公開API)を使用する。Steamの実際の過去の値動き(直近3ヶ月分、ショップ別)が取得できるため、自前でデータを貯める方式は採用しない。
  - `GET https://api.isthereanydeal.com/games/lookup/v1?appid=<steam_appid>&key=<key>` でSteam appidからITADのゲームID(UUID)を取得。
  - `GET https://api.isthereanydeal.com/games/history/v2?id=<itad_game_id>&country=jp&shops=61&key=<key>` で価格推移(タイムスタンプ・価格・割引率)を取得。`shops=61`はSteamのショップID。`country=jp`で円建てに揃える。
  - APIキーは`ITAD_API_KEY`環境変数(`.env`/`/etc/web-dashboard.env`)として新規追加。未設定または呼び出し失敗時はグラフを省略し、他の分析結果には影響させない(既存の`safe()`パターンを踏襲)。
  - 応答の正確なJSONスキーマは実装時に実際のAPI呼び出しで確認・確定させる(本specの記述はドキュメント調査に基づく設計時点の理解であり、フィールド名の細部は実装時に実APIで検証する)。
- **類似ゲーム比較の実現方法**: 追加のAI呼び出しはしない。既存の1回の分析AI呼び出し(`web/lib/analysisPrompt.js`)のJSON応答スキーマに、類似ゲーム名を5件求める項目を追加する。得られた名前ごとに既存の`bot/lib/steam.js`の`searchGame`/`fetchPriceDetail`/`fetchReviewSummary`/`fetchPlayerCount`を並列で呼び出し、価格・レビュー評価・現在のプレイヤー数を取得して比較表にする。
- **`bot/**`は一切変更しない**(既存の標準制約)。`web/lib/analysisPrompt.js`はWeb専用モジュールなので、スキーマ拡張はここで行う。
- **時間について**: ユーザーは「時間はかかってもいい」と明言している。類似ゲーム5件分のSteam API呼び出しが直列/並列問わず追加でかかることを許容する。

## アーキテクチャ

```
GET /analyze?name=...
  → gameAnalysis.fetchGameAnalysis()
      - 既存: 検索・価格・レビュー・コンテキスト・プレイヤー数・実績・好悪レビュー取得(並列)
      - 既存: AI分析(analysisPrompt.buildAnalysisPrompt → fetchChatReply → parseAnalysis)
        - 応答JSONに新規 "similarGames": ["名前1", ..., "名前5"] を追加要求
      - 新規: similarGames の各名前について searchGame → 価格/レビュー/プレイヤー数を並列取得(safe()でラップ、失敗した項目は比較表から欠落表示)
      - 新規: priceHistoryApi.fetchPriceHistory(appid) を呼び出し(safe()でラップ)
  → viewModel.buildAnalysisViewModel()
      - 新規: categoryLines を charts.renderCategoryBarChart() 用のデータ形状に整形
      - 新規: reviewSummary から positivePct を charts.renderReviewPieChart() に渡す形に整形
      - 新規: 価格履歴データ点を charts.renderPriceLineChart() 用の形状に整形
      - 新規: similarGames の比較データをvmに追加
  → analysisPage.js
      - 新規: 上記3種のSVGチャートをレンダリング(charts.js の関数を直接呼ぶ)
      - 新規: 類似ゲーム比較表をレンダリング
```

## コンポーネント

### `web/lib/priceHistoryApi.js`(新規)

- `lookupGameId(appid, apiKey)` — ITADの`games/lookup/v1`を呼び、ゲームIDを返す(見つからなければ`null`)。
- `fetchPriceHistory(appid, apiKey)` — 上記lookupしてから`games/history/v2`を呼び、`[{date, price}]`形式の配列に整形して返す(価格は円の整数、日付はISO文字列)。Steam(shop id 61)のデータのみ抽出。取得失敗・APIキー未設定・データなしの場合は空配列を返す(例外を投げない)。

### `web/lib/charts.js`(新規)

純粋関数、すべてSVG文字列を返す:
- `renderCategoryBarChart(categoryLines)` — `[{name, stars}]`(starsは0-5の整数)を横棒グラフに。
- `renderReviewPieChart(positivePct)` — 0-100の数値から2色の円グラフ(好評/不評)を描く。
- `renderPriceLineChart(pricePoints)` — `[{date, price}]`から折れ線グラフを描く。0件なら「データなし」、1件なら点のみ描画し、複数件で折れ線にする。

### `web/lib/analysisPrompt.js`(既存拡張)

AI応答のJSONスキーマに`"similarGames":["類似ゲーム名を最大5つ"]`を追加。

### `web/lib/gameAnalysis.js`(既存拡張)

AI分析結果(`similarGames`)を受けて、各ゲーム名について`searchGame`→価格/レビュー/プレイヤー数を並列取得し、`similarGamesData`(`[{name, appid, priceHtml用の生データ, reviewSummaryText用の生データ, playerCount}]`)を結果に追加。取得失敗した個別ゲームは比較表からその項目だけ欠落させる(全体は失敗させない)。
また`priceHistoryApi.fetchPriceHistory()`の結果を`priceHistory`として結果に追加。

### `web/lib/viewModel.js`(既存拡張)

上記データをチャート関数への入力形状・比較表表示用の形状に整形してvmに追加。

### `web/views/analysisPage.js`(既存拡張)

`web/lib/charts.js`の3関数を呼んでSVGを埋め込み、類似ゲーム比較表(HTML table)をレンダリング。比較表の各ゲーム名は`topPage.js`の履歴/お気に入りリンクと同じ形式で`/analyze?name=<encodeURIComponent(name)>`にリンクし、クリックでその類似ゲームの分析ページに遷移できるようにする。

## データフロー

検索成功 → 既存データ取得(並列)+AI分析(similarGames込み)→ 類似ゲームごとのSteamデータ取得(並列)+ITAD価格履歴取得(並列)→ viewModelでチャート用データに整形 → analysisPageでSVGチャート+比較表を描画。

## エラー処理

- ITAD API呼び出し失敗・キー未設定: 価格推移グラフを省略し「データなし」的な表示、または非表示。他のセクションに影響しない。
- 類似ゲームの個別取得失敗: その1件を比較表から省く(既存の`safe()`パターンを踏襲)。
- AIが`similarGames`を返さない/不正な形式: 空配列扱いにして比較表セクションごと非表示。

## テスト方針

- `web/lib/charts.js`: 純粋関数なのでTDDで全面テスト(0件/1件/複数件のデータパターン、SVGの妥当性を文字列アサートで検証)。
- `web/lib/priceHistoryApi.js`: 既存の`gameAnalysis.js`と同じ扱いで、ネットワークI/O部分は無テスト。ITADのレスポンスをパースする部分がもし十分に複雑なら、パース関数だけ純粋関数として切り出しテストする(実装時に判断)。
- `web/lib/analysisPrompt.js`: 既存の`analysisPrompt.test.js`に`similarGames`を含むプロンプトの検証を追加。
- `web/lib/viewModel.js` / `web/views/analysisPage.js`: 既存パターンに沿ってTDDでテスト追加。
- `web/lib/gameAnalysis.js`: 既存方針通り無テスト(I/Oオーケストレーション層)。

## スコープ外

- AIとの会話機能(別スペックで扱う)。
- 価格推移グラフのショップ横断比較(Steam以外のショップ表示)。
- 類似ゲーム比較表の各行からの追加操作(お気に入り追加など)。ゲーム名クリックでの分析ページへの遷移のみ対応する。
- ITAD APIのゲームIDのキャッシュ(毎回lookupし直す。低頻度アクセスのため許容)。
