# Discordチャット応答Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oracle Cloud VM上でsystemd常駐するNode.js + discord.js製Discord Botを新規追加し、指定チャンネルでの自由会話と`/price`・`/recommend`・`/review`・`/wishlist`の4スラッシュコマンドに対応させる。

**Architecture:** `bot/`配下に新規モジュール群を追加し、既存の`scripts/check-wishlist-prices.js`・`scripts/recommend-games.js`が既にexportしている関数を`require()`で読み取り専用に再利用する。Botはdiscord.jsのGateway接続で常時稼働し、`messageCreate`(自由会話)と`interactionCreate`(スラッシュコマンド)の2つのイベントを起点に動く。

**Tech Stack:** Node.js, discord.js v14

**Spec:** docs/superpowers/specs/2026-08-17-discord-chat-bot-design.md

## Global Constraints

- `scripts/*.js`は一切変更しない。Botはそれらの既存exportを`require()`で読むだけの新しい消費者として追加する
- 自由会話は指定した1チャンネル(`DISCORD_CHAT_CHANNEL_ID`環境変数)の全発言にのみ反応する。DM・メンションでは反応しない
- スラッシュコマンドは`/price`, `/recommend`, `/review`, `/wishlist`の4つ
- 会話履歴はプロセスメモリ上のみ保持する(DB等の永続化は行わない、再起動でリセットされる)
- デプロイはOracle Cloud Free Tier VM上のsystemd常駐。Docker化は行わない
- API失敗時はプロセスを終了させず、Discordへエラーメッセージを返信するだけにとどめる
- 純粋関数(整形・組み立てロジック)は`node:test`でユニットテストする。discord.jsのイベント配線・実際のfetch呼び出しはI/O層としてテスト対象外とする(既存`scripts/*.js`と同じ方針)

---

### Task 1: プロジェクトの雛形(bot/package.json, .gitignore)

**Files:**
- Create: `.gitignore`
- Create: `bot/package.json`

**Interfaces:**
- Consumes: なし
- Produces: `bot/`配下でdiscord.jsが`npm install`可能になる。以降の全タスクがこのディレクトリ構成に依存する

- [ ] **Step 1: リポジトリルートに`.gitignore`を作成**

```
node_modules/
.env
```

- [ ] **Step 2: `bot/package.json`を作成**

```json
{
  "name": "steam-discord-bot",
  "version": "1.0.0",
  "private": true,
  "description": "Steamのメッセージ応答Discord Bot(常駐プロセス)",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "node --test"
  },
  "dependencies": {
    "discord.js": "^14.0.0"
  }
}
```

- [ ] **Step 3: 依存インストールを確認**

Run: `cd bot && npm install`
Expected: `node_modules/discord.js`が作成され、エラーなく完了する

- [ ] **Step 4: Commit**

```bash
cd ..
git add .gitignore bot/package.json bot/package-lock.json
git commit -m "Scaffold bot/ project for the Discord chat bot"
```

---

### Task 2: bot/chat.js — 会話履歴とプロンプト構築、AI応答

**Files:**
- Create: `bot/chat.js`
- Test: `bot/chat.test.js`

**Interfaces:**
- Consumes: なし(このタスクは独立)
- Produces:
  - `appendHistory(history, channelId, entry, maxLen)` → 新しいhistoryオブジェクト(イミュータブル)
  - `buildChatPrompt(historyEntries, newMessage)` → プロンプト文字列
  - `fetchChatReply(prompt, apiKey)` → `Promise<string>` (1min.ai Qwen3-8Bへの生問い合わせ、未テストのI/O層)
  - `handleChatMessage(message, historyStore, apiKey)` → `Promise<void>` (discord.jsの`Message`オブジェクトを受け取り返信する、未テストのI/O層)
  - `MAX_HISTORY` (定数、既定の履歴保持件数)
  - Task 8はこれらすべてをそのまま`require('./chat.js')`で使う

- [ ] **Step 1: 失敗するテストを書く**

`bot/chat.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendHistory, buildChatPrompt } = require('./chat.js');

test('appendHistory adds an entry and keeps existing channels untouched', () => {
  const history = { 'other-channel': [{ author: 'X', text: 'hi' }] };
  const result = appendHistory(history, 'chan-1', { author: 'A', text: 'hello' }, 6);
  assert.deepEqual(result['chan-1'], [{ author: 'A', text: 'hello' }]);
  assert.deepEqual(result['other-channel'], [{ author: 'X', text: 'hi' }]);
});

test('appendHistory does not mutate the input object', () => {
  const history = { 'chan-1': [{ author: 'A', text: 'first' }] };
  appendHistory(history, 'chan-1', { author: 'B', text: 'second' }, 6);
  assert.deepEqual(history['chan-1'], [{ author: 'A', text: 'first' }]);
});

test('appendHistory caps the list at maxLen, dropping the oldest entries', () => {
  let history = {};
  for (let i = 0; i < 5; i++) {
    history = appendHistory(history, 'chan-1', { author: 'A', text: 'msg' + i }, 3);
  }
  assert.deepEqual(history['chan-1'].map((e) => e.text), ['msg2', 'msg3', 'msg4']);
});

test('buildChatPrompt includes prior history lines and the new message', () => {
  const historyEntries = [{ author: 'ユーザー', text: '猫好き？' }, { author: 'Bot', text: '好きだよ' }];
  const prompt = buildChatPrompt(historyEntries, '犬は？');
  assert.match(prompt, /猫好き？/);
  assert.match(prompt, /好きだよ/);
  assert.match(prompt, /犬は？/);
});

test('buildChatPrompt works with empty history', () => {
  const prompt = buildChatPrompt([], 'こんにちは');
  assert.match(prompt, /こんにちは/);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test bot/chat.test.js`
Expected: FAIL(`chat.js`が存在しないためモジュール読み込みエラー)

- [ ] **Step 3: 最小限の実装を書く**

`bot/chat.js`:

```js
'use strict';

var MAX_HISTORY = 6;

// 履歴はイミュータブルに扱う(呼び出し元のオブジェクトを書き換えない)。
function appendHistory(history, channelId, entry, maxLen) {
  maxLen = maxLen || MAX_HISTORY;
  var next = Object.assign({}, history);
  var list = (next[channelId] || []).concat([entry]);
  next[channelId] = list.slice(-maxLen);
  return next;
}

function buildChatPrompt(historyEntries, newMessage) {
  var lines = (historyEntries || []).map(function (e) {
    return e.author + ': ' + e.text;
  });
  lines.push('ユーザー: ' + newMessage);
  return 'あなたはSteamゲーム好きが集まるDiscordサーバーの雑談Botです。'
    + '気さくにタメ口寄りの日本語で、2〜3文程度の短さで返信してください。\n\n'
    + '会話:\n' + lines.join('\n') + '\nBot:';
}

async function fetchChatReply(prompt, apiKey) {
  var body = {
    type: 'UNIFY_CHAT_WITH_AI',
    model: 'qwen3-8b',
    promptObject: { prompt: prompt, settings: { historySettings: { isMixed: false, historyMessageLimit: 0 }, webSearchSettings: { webSearch: false } } }
  };
  var r = await fetch('https://api.1min.ai/api/chat-with-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-KEY': apiKey },
    body: JSON.stringify(body)
  });
  var d = await r.json();
  if (!r.ok || d.errorCode) throw new Error(d.message || String(r.status));
  var text = (d.aiRecord && d.aiRecord.aiRecordDetail && d.aiRecord.aiRecordDetail.resultObject && d.aiRecord.aiRecordDetail.resultObject[0]) || '';
  return text.trim();
}

async function handleChatMessage(message, historyStore, apiKey) {
  var channelId = message.channelId;
  var beforeHistory = (historyStore.data[channelId] || []);
  var entry = { author: message.author.username, text: message.content };
  historyStore.data = appendHistory(historyStore.data, channelId, entry, MAX_HISTORY);

  var prompt = buildChatPrompt(beforeHistory, message.content);
  try {
    var reply = await fetchChatReply(prompt, apiKey);
    var replyText = (reply || 'うまく返答を生成できなかった…').slice(0, 2000);
    await message.reply(replyText);
    historyStore.data = appendHistory(historyStore.data, channelId, { author: 'Bot', text: replyText }, MAX_HISTORY);
  } catch (e) {
    console.error('チャット応答生成に失敗しました: ' + e.message);
    await message.reply('うまく返答を生成できなかった…').catch(function () {});
  }
}

module.exports = {
  MAX_HISTORY: MAX_HISTORY,
  appendHistory: appendHistory,
  buildChatPrompt: buildChatPrompt,
  fetchChatReply: fetchChatReply,
  handleChatMessage: handleChatMessage
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test bot/chat.test.js`
Expected: PASS(5件全て)

- [ ] **Step 5: Commit**

```bash
git add bot/chat.js bot/chat.test.js
git commit -m "Add chat history and prompt building for the Discord bot"
```

---

### Task 3: bot/lib/steam.js — ゲーム名検索と価格詳細取得

**Files:**
- Create: `bot/lib/steam.js`

**Interfaces:**
- Consumes: なし(このタスクは独立)
- Produces:
  - `searchGame(name)` → `Promise<{id: string, name: string} | null>` (Steam公開検索API)
  - `fetchPriceDetail(appid)` → `Promise<{id: string, name: string, finalPrice: number, originalPrice: number, discountPercent: number} | null>`
  - Task 4(price.js), Task 5(review.js), Task 6(wishlist.js), Task 8(index.js)がこれらを使う

このタスクは外部APIを直接叩くI/O層のみで、純粋な整形ロジックを含まないため自動テストは書かない
(`scripts/*.js`の既存fetch系関数と同じ方針)。実際のSteam APIに対して手動で動作確認する。

- [ ] **Step 1: 実装を書く**

`bot/lib/steam.js`:

```js
'use strict';

// Steam公開検索API。認証不要、ゲーム名から先頭一致のappidを取る。
async function searchGame(name) {
  var r = await fetch('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(name) + '&cc=jp&l=japanese');
  if (!r.ok) return null;
  var d = await r.json();
  var items = d.items || [];
  if (!items.length) return null;
  var it = items[0];
  return { id: String(it.id), name: it.name };
}

// check-wishlist-prices.jsのfetchPriceは価格のみでdiscount_percent/originalPriceを持たないため、
// /price・/wishlistコマンド用に割引情報込みで別途取得する専用関数(scripts/*.jsは変更しない方針のため)。
async function fetchPriceDetail(appid) {
  var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,price_overview&cc=jp&l=japanese');
  if (!r.ok) return null;
  var d = await r.json();
  var info = d && d[appid] && d[appid].data;
  if (!info) return null;
  var po = info.price_overview;
  if (!po) return { id: String(appid), name: info.name, finalPrice: 0, originalPrice: 0, discountPercent: 0 };
  return {
    id: String(appid),
    name: info.name,
    finalPrice: Math.floor(po.final / 100),
    originalPrice: Math.floor(po.initial / 100),
    discountPercent: po.discount_percent || 0
  };
}

module.exports = { searchGame: searchGame, fetchPriceDetail: fetchPriceDetail };
```

- [ ] **Step 2: 手動で動作確認**

Run: `node -e "require('./bot/lib/steam.js').searchGame('Hades').then(r => console.log(r)).then(() => require('./bot/lib/steam.js').fetchPriceDetail('1145360')).then(r => console.log(r))"`
Expected: `searchGame`が`{id: '...', name: 'Hades'}`相当を返し、`fetchPriceDetail`が`finalPrice`等を含むオブジェクトを返す

- [ ] **Step 3: Commit**

```bash
git add bot/lib/steam.js
git commit -m "Add Steam name search and price-detail lookup for bot commands"
```

---

### Task 4: bot/commands/price.js — /priceコマンド

**Files:**
- Create: `bot/commands/price.js`
- Test: `bot/commands/price.test.js`

**Interfaces:**
- Consumes: `bot/lib/steam.js`の`searchGame(name)`/`fetchPriceDetail(appid)`と同じ形の戻り値を持つオブジェクト(`steamLib`引数として注入)
- Produces:
  - `formatPriceReply(gameName, detail)` → discord.js `interaction.reply`にそのまま渡せるオブジェクト
  - `handlePriceCommand(interaction, steamLib)` → `Promise<void>` (未テストのI/O層)
  - Task 8がこれらをそのまま使う

- [ ] **Step 1: 失敗するテストを書く**

`bot/commands/price.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPriceReply } = require('./price.js');

test('formatPriceReply shows a discounted price with strikethrough', () => {
  const detail = { id: '1', name: 'Sale Game', finalPrice: 750, originalPrice: 1000, discountPercent: 25 };
  const reply = formatPriceReply('Sale Game', detail);
  assert.match(reply.embeds[0].fields[0].value, /~~¥1,000~~/);
  assert.match(reply.embeds[0].fields[0].value, /¥750/);
  assert.match(reply.embeds[0].fields[0].value, /-25%/);
});

test('formatPriceReply shows 無料 for a free game', () => {
  const detail = { id: '2', name: 'Free Game', finalPrice: 0, originalPrice: 0, discountPercent: 0 };
  const reply = formatPriceReply('Free Game', detail);
  assert.equal(reply.embeds[0].fields[0].value, '無料');
});

test('formatPriceReply returns a not-found message when detail is null', () => {
  const reply = formatPriceReply('Unknown Game', null);
  assert.match(reply.content, /見つからなかった/);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test bot/commands/price.test.js`
Expected: FAIL(`price.js`が存在しない)

- [ ] **Step 3: 最小限の実装を書く**

`bot/commands/price.js`:

```js
'use strict';

function formatPriceReply(gameName, detail) {
  if (!detail) {
    return { content: '「' + gameName + '」が見つからなかった…' };
  }
  var priceLine = detail.finalPrice === 0
    ? '無料'
    : detail.discountPercent > 0
      ? '~~¥' + detail.originalPrice.toLocaleString() + '~~ → **¥' + detail.finalPrice.toLocaleString() + '** (-' + detail.discountPercent + '%)'
      : '¥' + detail.finalPrice.toLocaleString();
  return {
    embeds: [{
      title: detail.name,
      url: 'https://store.steampowered.com/app/' + detail.id + '/',
      color: 0x66c0f4,
      fields: [{ name: '価格', value: priceLine, inline: true }]
    }]
  };
}

async function handlePriceCommand(interaction, steamLib) {
  var gameName = interaction.options.getString('name');
  await interaction.deferReply();
  var found = await steamLib.searchGame(gameName);
  var detail = found ? await steamLib.fetchPriceDetail(found.id) : null;
  await interaction.editReply(formatPriceReply(gameName, detail));
}

module.exports = { formatPriceReply: formatPriceReply, handlePriceCommand: handlePriceCommand };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test bot/commands/price.test.js`
Expected: PASS(3件全て)

- [ ] **Step 5: Commit**

```bash
git add bot/commands/price.js bot/commands/price.test.js
git commit -m "Add /price slash command handler"
```

---

### Task 5: bot/commands/review.js — /reviewコマンド

**Files:**
- Create: `bot/commands/review.js`
- Test: `bot/commands/review.test.js`

**Interfaces:**
- Consumes: `{ searchGame(name), fetchReviews(appid, count), fetchVerdict(gameName, reviewTexts, apiKey) }`という形のオブジェクト(`steamScripts`引数として注入。Task 8で`bot/lib/steam.js`の`searchGame`と`scripts/check-wishlist-prices.js`の`fetchReviews`/`fetchVerdict`を組み合わせて渡す)
- Produces:
  - `formatReviewReply(gameName, verdict)` → discord.js reply用オブジェクト
  - `handleReviewCommand(interaction, steamScripts)` → `Promise<void>` (未テストのI/O層)

- [ ] **Step 1: 失敗するテストを書く**

`bot/commands/review.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatReviewReply } = require('./review.js');

test('formatReviewReply shows the verdict with its emoji', () => {
  const reply = formatReviewReply('Great Game', '買い');
  assert.match(reply.embeds[0].description, /✅/);
  assert.match(reply.embeds[0].description, /買い/);
  assert.equal(reply.embeds[0].title, 'Great Game');
});

test('formatReviewReply returns a not-found message when verdict is null', () => {
  const reply = formatReviewReply('Unknown Game', null);
  assert.match(reply.content, /見つからなかった/);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test bot/commands/review.test.js`
Expected: FAIL(`review.js`が存在しない)

- [ ] **Step 3: 最小限の実装を書く**

`bot/commands/review.js`:

```js
'use strict';

var VERDICT_EMOJI = { '今すぐ買い': '🔥', '買い': '✅', 'セール待ち': '⏳', '人を選ぶ': '🤔', '見送り': '⛔' };

function formatReviewReply(gameName, verdict) {
  if (!verdict) {
    return { content: '「' + gameName + '」のレビューが見つからなかった…' };
  }
  var emoji = VERDICT_EMOJI[verdict] || '▪';
  return {
    embeds: [{
      title: gameName,
      color: 0x66c0f4,
      description: emoji + ' **' + verdict + '**'
    }]
  };
}

async function handleReviewCommand(interaction, steamScripts) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var found = await steamScripts.searchGame(gameName);
  var verdict = null;
  if (found && apiKey) {
    var reviews = await steamScripts.fetchReviews(found.id, 15);
    verdict = reviews.length ? await steamScripts.fetchVerdict(found.name, reviews, apiKey) : null;
  }
  await interaction.editReply(formatReviewReply(gameName, verdict));
}

module.exports = { formatReviewReply: formatReviewReply, handleReviewCommand: handleReviewCommand };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test bot/commands/review.test.js`
Expected: PASS(2件全て)

- [ ] **Step 5: Commit**

```bash
git add bot/commands/review.js bot/commands/review.test.js
git commit -m "Add /review slash command handler"
```

---

### Task 6: bot/commands/wishlist.js — /wishlistコマンド

**Files:**
- Create: `bot/commands/wishlist.js`
- Test: `bot/commands/wishlist.test.js`

**Interfaces:**
- Consumes:
  - `scripts`引数: `{ fetchWishlist(steamId64) }`という形(Task 8で`scripts/check-wishlist-prices.js`をそのまま渡す)
  - `steamLib`引数: `{ fetchPriceDetail(appid) }`という形(Task 8で`bot/lib/steam.js`をそのまま渡す)
- Produces:
  - `buildWishlistDealsEmbed(deals)` → discord.js reply用オブジェクト
  - `handleWishlistCommand(interaction, steamId64, scripts, steamLib)` → `Promise<void>` (未テストのI/O層)

- [ ] **Step 1: 失敗するテストを書く**

`bot/commands/wishlist.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWishlistDealsEmbed } = require('./wishlist.js');

test('buildWishlistDealsEmbed lists each discounted title with its price', () => {
  const deals = [
    { id: '1', name: 'Game A', finalPrice: 800, originalPrice: 1000, discountPercent: 20 },
    { id: '2', name: 'Game B', finalPrice: 400, originalPrice: 500, discountPercent: 20 }
  ];
  const reply = buildWishlistDealsEmbed(deals);
  assert.match(reply.embeds[0].title, /2件/);
  assert.match(reply.embeds[0].description, /Game A/);
  assert.match(reply.embeds[0].description, /Game B/);
});

test('buildWishlistDealsEmbed returns a plain message when there are no deals', () => {
  const reply = buildWishlistDealsEmbed([]);
  assert.match(reply.content, /ない/);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test bot/commands/wishlist.test.js`
Expected: FAIL(`wishlist.js`が存在しない)

- [ ] **Step 3: 最小限の実装を書く**

`bot/commands/wishlist.js`:

```js
'use strict';

function buildWishlistDealsEmbed(deals) {
  if (!deals.length) {
    return { content: '今値下げ中のウィッシュリストタイトルはないみたい。' };
  }
  var description = deals.map(function (d) {
    return '**' + d.name + '**\n~~¥' + d.originalPrice.toLocaleString() + '~~ → ¥' + d.finalPrice.toLocaleString() + '（-' + d.discountPercent + '%）';
  }).join('\n\n');
  return {
    embeds: [{
      title: '💰 ウィッシュリスト値下げ中 ' + deals.length + '件',
      url: 'https://store.steampowered.com/wishlist/',
      color: 0x66c0f4,
      description: description
    }]
  };
}

async function handleWishlistCommand(interaction, steamId64, scripts, steamLib) {
  await interaction.deferReply();
  var wishlist = await scripts.fetchWishlist(steamId64);
  var deals = [];
  var CHUNK = 4;
  for (var i = 0; i < wishlist.length; i += CHUNK) {
    var chunk = wishlist.slice(i, i + CHUNK);
    var results = await Promise.all(chunk.map(function (w) {
      return steamLib.fetchPriceDetail(w.appid).catch(function () { return null; });
    }));
    results.forEach(function (r) { if (r && r.discountPercent > 0) deals.push(r); });
  }
  await interaction.editReply(buildWishlistDealsEmbed(deals));
}

module.exports = { buildWishlistDealsEmbed: buildWishlistDealsEmbed, handleWishlistCommand: handleWishlistCommand };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test bot/commands/wishlist.test.js`
Expected: PASS(2件全て)

- [ ] **Step 5: Commit**

```bash
git add bot/commands/wishlist.js bot/commands/wishlist.test.js
git commit -m "Add /wishlist slash command handler"
```

---

### Task 7: bot/commands/recommend.js — /recommendコマンド

**Files:**
- Create: `bot/commands/recommend.js`

**Interfaces:**
- Consumes: `deps`引数として `{ fetchFeaturedPool, pickRandomGames, fetchReviews, fetchGameAnalysis, buildHeaderEmbed, buildRecommendEmbeds }` (Task 8で`scripts/recommend-games.js`と`scripts/check-wishlist-prices.js`の既存exportをまとめて渡す)
- Produces: `handleRecommendCommand(interaction, deps)` → `Promise<void>` (未テストのI/O層)

このコマンドは既存の`recommend-games.js`が公開している関数をそのまま組み合わせるだけで、
新規の整形ロジックを持たないため自動テストは書かない(`scripts/*.js`の`main()`と同じ方針)。

- [ ] **Step 1: 実装を書く**

`bot/commands/recommend.js`:

```js
'use strict';

async function handleRecommendCommand(interaction, deps) {
  await interaction.deferReply();
  var pool = await deps.fetchFeaturedPool();
  var picked = deps.pickRandomGames(pool, 3);
  var apiKey = process.env.ONEMIN_API_KEY;

  for (var i = 0; i < picked.length; i++) {
    var g = picked[i];
    try {
      var reviews = await deps.fetchReviews(g.id, 15);
      g.analysis = (apiKey && reviews.length) ? await deps.fetchGameAnalysis(g.name, reviews, apiKey) : null;
    } catch (e) {
      g.analysis = null;
    }
  }

  var embeds = [deps.buildHeaderEmbed(picked.length)].concat(deps.buildRecommendEmbeds(picked));
  await interaction.editReply({ embeds: embeds });
}

module.exports = { handleRecommendCommand: handleRecommendCommand };
```

- [ ] **Step 2: 構文エラーがないことを確認**

Run: `node -c bot/commands/recommend.js`
Expected: エラーなく終了(実際の動作確認はTask 8完了後、本物のDiscordインタラクションで行う)

- [ ] **Step 3: Commit**

```bash
git add bot/commands/recommend.js
git commit -m "Add /recommend slash command handler"
```

---

### Task 8: bot/index.js — discord.jsクライアントとイベント配線

**Files:**
- Create: `bot/index.js`

**Interfaces:**
- Consumes: Task 2〜7で作った全モジュールのexportすべて、および`scripts/check-wishlist-prices.js`・`scripts/recommend-games.js`の既存export
- Produces: なし(このリポジトリ内では最終消費者)。起動には環境変数`DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CHAT_CHANNEL_ID`, `STEAM_ID64`, `ONEMIN_API_KEY`が必要

このタスクはdiscord.jsのGateway接続・イベント配線そのものであり、実際のBotトークンなしには
動作確認できないI/O層のため自動テストは書かない。構文チェックのみ行い、実機での動作確認は
Task 9のデプロイ後にユーザー自身が行う。

- [ ] **Step 1: 実装を書く**

`bot/index.js`:

```js
'use strict';

var { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
var checkWishlistPrices = require('../scripts/check-wishlist-prices.js');
var recommendGames = require('../scripts/recommend-games.js');
var steamLib = require('./lib/steam.js');
var chat = require('./chat.js');
var priceCommand = require('./commands/price.js');
var reviewCommand = require('./commands/review.js');
var wishlistCommand = require('./commands/wishlist.js');
var recommendCommand = require('./commands/recommend.js');

var token = process.env.DISCORD_BOT_TOKEN;
var clientId = process.env.DISCORD_CLIENT_ID;
var chatChannelId = process.env.DISCORD_CHAT_CHANNEL_ID;
var steamId64 = process.env.STEAM_ID64;
var apiKey = process.env.ONEMIN_API_KEY;

if (!token || !clientId) {
  console.error('DISCORD_BOT_TOKEN と DISCORD_CLIENT_ID は必須です');
  process.exit(1);
}

var commands = [
  new SlashCommandBuilder().setName('price').setDescription('Steamゲームの現在価格を調べる')
    .addStringOption(function (opt) { return opt.setName('name').setDescription('ゲーム名').setRequired(true); }),
  new SlashCommandBuilder().setName('review').setDescription('レビューをAIが要約して買い判断を返す')
    .addStringOption(function (opt) { return opt.setName('name').setDescription('ゲーム名').setRequired(true); }),
  new SlashCommandBuilder().setName('wishlist').setDescription('ウィッシュリストの値下げ中タイトルを表示'),
  new SlashCommandBuilder().setName('recommend').setDescription('その場でAIおすすめゲームを紹介')
].map(function (c) { return c.toJSON(); });

var historyStore = { data: {} };

var client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

client.once(Events.ClientReady, async function () {
  console.log('ログイン完了: ' + client.user.tag);
  try {
    var rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('スラッシュコマンド登録完了');
  } catch (e) {
    console.error('スラッシュコマンド登録に失敗しました: ' + e.message);
  }
});

client.on(Events.MessageCreate, function (message) {
  if (message.author.bot) return;
  if (!chatChannelId || message.channelId !== chatChannelId) return;
  chat.handleChatMessage(message, historyStore, apiKey).catch(function (e) {
    console.error('チャット処理でエラー: ' + e.message);
  });
});

client.on(Events.InteractionCreate, function (interaction) {
  if (!interaction.isChatInputCommand()) return;
  var handlers = {
    price: function () { return priceCommand.handlePriceCommand(interaction, steamLib); },
    review: function () {
      return reviewCommand.handleReviewCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchReviews: checkWishlistPrices.fetchReviews,
        fetchVerdict: checkWishlistPrices.fetchVerdict
      });
    },
    wishlist: function () {
      return wishlistCommand.handleWishlistCommand(interaction, steamId64, checkWishlistPrices, steamLib);
    },
    recommend: function () {
      return recommendCommand.handleRecommendCommand(interaction, {
        fetchFeaturedPool: recommendGames.fetchFeaturedPool,
        pickRandomGames: recommendGames.pickRandomGames,
        fetchReviews: checkWishlistPrices.fetchReviews,
        fetchGameAnalysis: recommendGames.fetchGameAnalysis,
        buildHeaderEmbed: recommendGames.buildHeaderEmbed,
        buildRecommendEmbeds: recommendGames.buildRecommendEmbeds
      });
    }
  };
  var handler = handlers[interaction.commandName];
  if (!handler) return;
  handler().catch(function (e) {
    console.error('コマンド処理でエラー(' + interaction.commandName + '): ' + e.message);
    var reply = { content: 'エラーが発生しました…' };
    if (interaction.deferred || interaction.replied) {
      interaction.editReply(reply).catch(function () {});
    } else {
      interaction.reply(reply).catch(function () {});
    }
  });
});

client.on(Events.Error, function (e) {
  console.error('discord.jsクライアントエラー: ' + e.message);
});

client.login(token);
```

- [ ] **Step 2: 構文エラーがないことを確認**

Run: `node -c bot/index.js`
Expected: エラーなく終了

- [ ] **Step 3: Commit**

```bash
git add bot/index.js
git commit -m "Wire up the Discord bot client, slash commands, and chat handler"
```

---

### Task 9: デプロイ設定(systemdユニット・環境変数テンプレート)

**Files:**
- Create: `bot/steam-discord-bot.service`
- Create: `bot/.env.example`

**Interfaces:**
- Consumes: なし
- Produces: なし(デプロイ用の設定ファイル。実際の起動確認はユーザーがOracle Cloud VM上で行う)

- [ ] **Step 1: 環境変数テンプレートを作成**

`bot/.env.example`:

```
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CHAT_CHANNEL_ID=
STEAM_ID64=
ONEMIN_API_KEY=
```

- [ ] **Step 2: systemdユニットファイルを作成**

`bot/steam-discord-bot.service`:

```ini
[Unit]
Description=Steam Discord Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/opc/steam-ja-translate/bot
EnvironmentFile=/home/opc/steam-ja-translate/bot/.env
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`WorkingDirectory`と`EnvironmentFile`のパスは、実際にVM上でリポジトリをcloneしたパスと
ログインユーザー名(Oracle LinuxのデフォルトはOS種別により`opc`または`ubuntu`)に合わせて
書き換えること。

- [ ] **Step 3: Commit**

```bash
git add bot/steam-discord-bot.service bot/.env.example
git commit -m "Add systemd unit and env template for deploying the bot"
```

- [ ] **Step 4: VM上での手動デプロイ手順(実行はユーザー自身)**

以下はOracle Cloud VMにSSHログインした状態で実行する:

```bash
git clone <このリポジトリのURL> ~/steam-ja-translate
cd ~/steam-ja-translate/bot
npm install
cp .env.example .env
# .envを実際の値で埋める(DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_CHAT_CHANNEL_ID, STEAM_ID64, ONEMIN_API_KEY)
sudo cp steam-discord-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now steam-discord-bot
sudo systemctl status steam-discord-bot
```

事前にDiscord Developer PortalでBotアプリケーションを作成し、`MESSAGE CONTENT INTENT`を
有効化し、サーバーに招待しておく必要がある(仕様書の「事前準備」節を参照)。

---

## 完了確認

全タスク完了後、Discord上で以下を手動確認する:

1. 指定チャンネルで雑談を投げかけ、Botが数秒以内に返信すること
2. `/price <ゲーム名>` で価格が表示されること(割引中タイトルと通常価格タイトルの両方で確認)
3. `/review <ゲーム名>` でAI判定が返ること
4. `/wishlist` で値下げ中タイトルの一覧が表示されること(値下げ中タイトルが無い場合は「無い」旨の返信になること)
5. `/recommend` でAI分析付きのおすすめが3本表示されること
6. `sudo systemctl status steam-discord-bot` が`active (running)`であること
