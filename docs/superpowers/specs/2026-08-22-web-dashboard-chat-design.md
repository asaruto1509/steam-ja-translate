# Webダッシュボード: AIチャット機能 設計

## 背景

グラフ/分析拡充specの際に要望に含まれていたが規模が大きいため分離した「AIとの自然言語チャット機能」を扱う。会話履歴を送信し、連続した会話が成立するようにする。

利用シーンは2つ:
1. 各ゲームの分析ページで、そのゲームについて追加で質問できるチャット(ゲームごとに1本の会話が持続する)
2. トップページの、特定のゲームに紐づかない自由な雑談チャット(1本の会話のみ)

両者は挙動がほぼ同じ(履歴の保持・送信・保存の仕組みは共通)なので、共通のチャットエンジンを両方の画面から使う。

## 決定事項

- **共通化**: ゲーム紐付きチャットとトップページの独立チャットは、同じストレージ/プロンプト組み立て/APIエンドポイント/クライアントJSを共有する。違いは「scope」(ゲームのappid、またはstandalone)と、ゲーム紐付き時のみプロンプトにゲーム文脈を追加する点のみ。
- **送信方式**: `fetch`による非同期送信を採用する(この決定により、このプロジェクト初のインタラクティブなクライアントJSが入る。既存方針の「ビルドツールなし・SSRのみ」は維持しつつ、フォーム送信＋DOM追記程度のバニラJSに限定する)。
- **永続化**: サーバー側JSONファイル(`web/data/chat-data.json`、既存の`web/data/`ディレクトリを共用、gitignore済み)。ブラウザを閉じても、別端末からアクセスしても同じ会話が続く。
- **会話数**: ゲームごとの会話は1本(appidごとに1つ)。トップページの独立チャットも1本のみ。スレッドの複数作成・切り替えは対象外。
- **AIへの文脈提供**: ゲーム紐付きチャットでは、質問のたびにそのゲームのレビュー要約・カテゴリ情報を`steamLib.fetchReviewSummary`/`fetchGameContext`で都度取得し、プロンプトに含める(保存済みの分析結果を使い回すのではなく、常に最新を反映)。
- **AI自身によるWeb検索**: `bot/chat.js`の`fetchChatReply`が既に持つ`{webSearch: true}`オプションを使う。分析ページのAI呼び出し(`webSearch: false`)とはここが異なり、チャットではAI自身が必要な情報を検索できるようにする。
- **会話履歴の保持件数**: 30件(ユーザー15+AI15往復ぶん)。Discordボットの6件(`bot/chat.js`のMAX_HISTORY)より大きく増やすが、無制限にはしない — 毎回全履歴をプロンプト文字列に埋め込む方式のため、際限なく増やすと応答が遅くなる/コストが増える。実用上「多いが上限はある」値として30とする。
- **エラー処理**: AI呼び出し失敗時もAPIレスポンス自体は200を返し、`reply`に既存botと同じ文言「うまく返答を生成できなかった…」を入れる(`safe()`パターン)。クライアントJSはHTTPステータスによる分岐が不要になる。
- **`bot/**`は一切変更しない**(既存の標準制約)。`bot/chat.js`の`fetchChatReply`のみ読み取り専用で再利用する。`buildChatPrompt`はDiscord向けの雑談bot口調のため再利用せず、Web専用に新規作成する。

## アーキテクチャ

```
POST /chat/message  { scope: "<appid>" | null, message: "<text>" }
  → (scopeがappidの場合) steamLib.fetchReviewSummary(appid) / fetchGameContext(appid) を都度取得(safe()でラップ、失敗時はgameContextなしで続行)
  → chatStore.getConversation(scope) で既存履歴を取得
  → chatPrompt.buildChatPrompt(history, message, gameContext)
  → bot/chat.js の fetchChatReply(prompt, apiKey, {webSearch: true})  ※safe()でラップ、失敗時は固定文言
  → chatStore.addMessage(scope, {role:'user', text: message, at}) と
    chatStore.addMessage(scope, {role:'assistant', text: reply, at}) を保存
  → { reply } をJSONで返す

POST /chat/clear  { scope }
  → chatStore.clearConversation(scope)
  → { ok: true }

GET / , GET /analyze
  → 既存のHTMLレンダリングに、chatStore.getConversation(scope) の結果を
    chatWidget.renderChatWidget(scope, messages) で埋め込む(初期表示、リロードしても残る)
```

## コンポーネント

### `web/lib/chatStore.js`(新規)

`web/lib/store.js`と同じ同期fsパターンだが、データ形状が異なるため別ファイルに分離する。

- 保存先: `web/data/chat-data.json`
- スキーマ: `{ standalone: [{role, text, at}], byGame: { "<appid>": [{role, text, at}] } }`
- 純粋関数: `applyMessage(messages, entry, maxSize)` — 追加して`maxSize`(30)にトリミング(既存`applyHistoryEntry`と同型)。
- I/Oラッパー: `getConversation(scope)` / `addMessage(scope, entry)` / `clearConversation(scope)`。`scope`が`null`または`'standalone'`ならstandalone欄、それ以外(appid文字列)なら`byGame[scope]`を操作する。

### `web/lib/chatPrompt.js`(新規、Web専用)

- `buildChatPrompt(history, newMessage, gameContext)` — 純粋関数。
  - `gameContext`(`{name, reviewSummaryText, categories}`など、任意)がある場合、先頭にゲーム名・レビュー傾向を短く埋め込む。
  - `history`(`[{role, text}]`)を「ユーザー: ...」「AI: ...」の行に変換し、末尾に新メッセージを追加。
  - Steam知識のあるアシスタントとして自然な日本語で会話するよう指示する文面(Discordの雑談bot口調とは別に新規作成)。

### `web/views/chatWidget.js`(新規)

- `renderChatWidget(scope, messages)` — メッセージ一覧(role別にクラス分けしHTMLエスケープ)+入力フォーム+クリアボタンのHTMLを返す。空履歴時は「まだ会話がありません」等の表示。

### `web/server.js`(既存拡張)

- `POST /chat/message`、`POST /chat/clear`の2ルートを追加(JSON API、`express.json()`ミドルウェアが必要 — 現状`express.urlencoded`のみなので追加する)。
- `GET /`・`GET /analyze`のレンダリングに`chatWidget.renderChatWidget()`の出力を埋め込む。

### `web/views/analysisPage.js` / `web/views/topPage.js`(既存拡張)

- それぞれ`renderChatWidget(vm.appid, ...)` / `renderChatWidget(null, ...)`を呼んで埋め込む。

### `web/views/layout.js`(既存拡張)

- チャット用の吹き出しスタイルCSSを追加。
- チャットフォームの`fetch`送信・DOM追記・ローディング表示・クリアボタンを行うクライアントJSをインラインscriptに追加(バニラJS、ビルドツールなし)。

## データフロー

ユーザーがチャット欄にメッセージ送信 → クライアントJSが即座にユーザー発言をDOMに追加 → `fetch('/chat/message')` → サーバーがゲーム文脈(該当時)+履歴からプロンプト生成 → AI呼び出し → 両発言を永続化 → レスポンスのAI発言をDOMに追加。ページ再読み込み時は永続化済みの履歴がサーバー側HTMLとして初期表示される。

## エラー処理

- AI呼び出し失敗: `reply`に固定の失敗文言を入れて200を返す。ユーザー発言・失敗文言ともに履歴には保存する(会話の連続性を保つため)。
- ゲーム文脈の取得失敗(該当ゲームのレビュー取得等が失敗): `gameContext`なしでプロンプトを組み立てて続行(チャット自体は失敗させない)。
- クライアント側のfetch自体が失敗(ネットワーク断等): チャット欄にエラー表示を出す(サーバーには送信されていないので履歴には残らない)。
- 不正なリクエスト(空メッセージ等): サーバー側で簡易バリデーションし、空メッセージは無視する。
- 極端に長いメッセージ: 2000文字を超える入力は先頭2000文字に切り詰めてから履歴・プロンプトに使う(既存botの返信文字数上限と揃えた値)。

## テスト方針

- `web/lib/chatStore.js`: `applyMessage`のトリミング・upsert挙動を純粋関数としてTDDでテスト。I/Oラッパー(`getConversation`等)は既存`store.js`と同じ扱いで無テスト。
- `web/lib/chatPrompt.js`: `buildChatPrompt`をTDDでテスト(履歴の整形、ゲーム文脈あり/なし、新メッセージの追加)。
- `web/views/chatWidget.js`: `renderChatWidget`をTDDでテスト(メッセージのHTMLエスケープ、role別クラス、空履歴時の表示)。
- `web/server.js`のチャットルート: 既存方針通りI/Oオーケストレーションとして無テスト、手動E2E検証(実際にAPIキーを使ってメッセージを送り、履歴が保存され次回表示されることを確認)。
- クライアントJS: 自動テスト基盤がないため無テスト。手動ブラウザ確認、または`curl`での`/chat/message`直接呼び出しによる確認。

## スコープ外

- 複数会話スレッドの作成・切り替え。
- 会話履歴の全文検索・エクスポート。
- ストリーミング応答(1文字ずつ表示するような演出)。レスポンスが返ってから一括表示する。
- レート制限・スパム対策(個人利用のダッシュボードのため対象外)。
