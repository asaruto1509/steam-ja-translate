# Webダッシュボード: 検索履歴・お気に入り機能 設計

## 背景

Steam Web Dashboard(`web/`)は現状、リクエストごとに使い捨てのゲーム分析ページのみを提供している。永続化層は一切なく、検索した内容は毎回入力し直す必要がある。

ユーザーは「複数ゲーム対応」として、検索履歴の自動保存とお気に入り(ブックマーク)機能を求めている。単一ユーザー専用(Basic Auth 1ユーザーのみ)のダッシュボードであり、複数人でのデータ分離は不要。

これはWebダッシュボード改善の4項目中3番目(UX改善→分析精度強化→**複数ゲーム対応**→新機能追加の順で合意済み)。

## 決定事項

- **保存対象**: 検索履歴(自動)とお気に入り(手動)の両方。
- **表示場所**: トップページ(`/`)に検索フォームと一緒に一覧表示。専用ページは作らない。
- **履歴の上限**: 最新30件。古いものは自動で切り詰め。同じゲームを再検索した場合は重複させず先頭に移動する。
- **お気に入りの追加/削除**: 分析結果ページ(`/analyze`)にボタンを置く。トップページの一覧からの追加/削除操作はスコープ外(一覧は閲覧と再検索リンクのみ)。
- **永続化方式**: JSONファイル(`web/data/dashboard-data.json`)。単一ユーザー・低頻度書き込みという規模感に対し、`node:sqlite`や外部DBは過剰と判断。新規npm依存も増やさない。
- **git管理**: このJSONファイルはVM上の生きた個人データであり、`.gitignore`に追加してリポジトリにはコミットしない。リポジトリ直下の`price_history.json`(botが自動更新し履歴として意図的にコミットしているデータ)とは性質が異なるため、同じ扱いにはしない。
- **`bot/**`は一切変更しない**(既存の標準制約)。今回の機能はWebダッシュボード専用のため、そもそも触る必要がない。

## アーキテクチャ

```
GET /                 → topPage.js が history/favorites を表示
GET /analyze?name=... → 検索成功時に store.addHistoryEntry() で履歴に自動追加
                       → analysisPage.js が isFavorite に応じてボタン出し分け
POST /favorites/add    → store.addFavorite() → 302 /analyze?name=...
POST /favorites/remove → store.removeFavorite() → 302 /analyze?name=...
```

`web/lib/store.js`が唯一の永続化窓口。ファイルI/Oはこのモジュール内に閉じ、他のモジュールは`store.js`の関数越しにしかデータへ触れない。

## コンポーネント

### `web/lib/store.js`(新規)

データ形状:
```js
{ history: [{ appid: "367520", name: "Hollow Knight", searchedAt: 1734... }, ...],
  favorites: [{ appid: "367520", name: "Hollow Knight", addedAt: 1734... }, ...] }
```

純粋関数(TDD対象。既存の配列を変更せず新しい配列を返す):
- `applyHistoryEntry(history, entry, maxSize)` — 同じappidの既存エントリを除去してから先頭に追加し、`maxSize`件に切り詰める。
- `applyFavoriteAdd(favorites, entry)` — 同じappidが既にあれば何もしない(重複追加を防ぐ)。
- `applyFavoriteRemove(favorites, appid)` — 該当appidを取り除く。
- `isFavorited(favorites, appid)` — bool。

I/Oラッパー(既存の`gameAnalysis.js`/`server.js`と同様、無テストの薄い層):
- `loadData()` — ファイルが無ければ`{history:[],favorites:[]}`を返す。JSONパース失敗時も同様にフォールバックし、`console.error`でログだけ残す。
- `saveData(data)` — `web/data/`ディレクトリが無ければ作成し、JSONを書き込む。
- 書き込みの直列化: モジュールスコープの`writeQueue`(Promiseチェーン)経由で`loadData→変更→saveData`を実行し、並行呼び出しでの競合(read-modify-writeレース)を防ぐ。
- 公開関数: `addHistoryEntry(entry)`, `getHistory()`, `addFavorite(entry)`, `removeFavorite(appid)`, `getFavorites()`。

### `web/views/topPage.js`(新規)

現在`server.js`にベタ書きされている`<p>ゲーム名を検索してください。</p>`を置き換える。`renderTopPage({history, favorites})`が:
- 履歴が空なら簡単な案内文のみ。
- 履歴/お気に入りそれぞれ、ゲーム名リンク(`/analyze?name=<encoded name>`)のリストを表示。
- 全て`html.escapeHtml`でエスケープ。

### `web/views/analysisPage.js`(既存拡張)

`vm.isFavorite`に応じて:
- `false`または未設定 → `<form method="POST" action="/favorites/add">`(hidden: appid, name) + 「☆ お気に入りに追加」ボタン
- `true` → `<form method="POST" action="/favorites/remove">`(hidden: appid) + 「★ お気に入り解除」ボタン

### `web/lib/viewModel.js`(既存拡張)

`buildAnalysisViewModel(result)`の`result`に`isFavorite`(bool)を追加入力し、`vm.isFavorite`にそのまま渡す。

### `web/server.js`(既存拡張)

- `express.urlencoded({ extended: false })`ミドルウェアを追加(POSTフォームのbodyパース用)。
- `GET /`: `store.getHistory()`/`store.getFavorites()`を呼び、`topPage.renderTopPage()`で描画。
- `GET /analyze`: 検索成功時(`result.found`が真)に`store.addHistoryEntry({appid, name, searchedAt: Date.now()})`を呼ぶ(失敗してもページ表示は継続。try/catchで握りつぶし`console.error`)。`store.getFavorites()`で現在お気に入りかどうかを判定し、`viewModel`に渡す`result`へ`isFavorite`を追加。
- `POST /favorites/add`: body(appid, name)を受け取り`store.addFavorite()`→`/analyze?name=<name>`へ302リダイレクト。
- `POST /favorites/remove`: body(appid, name)を受け取り`store.removeFavorite(appid)`→同様にリダイレクト。

## データフロー

1. ユーザーがゲーム名で検索 → `/analyze`が成功 → 履歴に自動追加(重複は先頭に移動、30件超は切り詰め)。
2. 分析ページで「お気に入りに追加」ボタン押下 → POST → store更新 → 同じゲームの分析ページに戻る(ボタンが「解除」に変わっている)。
3. トップページ訪問時、履歴・お気に入りの一覧を表示。ゲーム名クリックで`/analyze?name=...`に遷移し再分析。

## エラー処理

- `store.js`のI/O層は例外を投げず、失敗時は空配列/no-opにフォールバックする。履歴・お気に入りが読み書きできなくても、検索・分析という主機能は止めない。
- JSONファイルが破損している場合もパース失敗として同様にフォールバックし、次回の書き込みで正常なファイルに上書きされる。

## テスト方針

- `store.js`の純粋関数(`applyHistoryEntry`, `applyFavoriteAdd`, `applyFavoriteRemove`, `isFavorited`)はTDDでテスト。
- `topPage.js`(新規)は`analysisPage.js`と同じ粒度でレンダリングテスト(履歴あり/なし、お気に入りあり/なし、エスケープ)。
- `analysisPage.js`のボタン出し分け(`isFavorite`true/false)をテスト追加。
- `viewModel.js`の`isFavorite`受け渡しをテスト追加。
- `store.js`のファイルI/Oラッパー、`server.js`のルートハンドラは既存方針通り無テスト(既存の`gameAnalysis.js`/`server.js`と同じ扱い)。

## スコープ外

- トップページの一覧からの直接お気に入り追加/削除(分析ページ経由のみ)。
- 履歴の手動削除機能。
- 複数ユーザー・マルチアカウント対応。
- お気に入りへのメモ/タグ付け。
- 検索履歴とお気に入りを使った比較・AI分析(これは4番目の「新機能追加」項目で別途検討)。
