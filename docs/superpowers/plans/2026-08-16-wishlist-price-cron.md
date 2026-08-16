# ウィッシュリスト値下げ通知 GitHub Actions移行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discordウィッシュリスト値下げ通知を、ブラウザ拡張機能の`chrome.alarms`依存から、GitHub Actionsの独立したスケジュール実行(Node.jsスクリプト)に移行し、ブラウザを閉じていても通知が届くようにする。

**Architecture:** GitHub Actionsが毎日1回`scripts/check-wishlist-prices.js`を実行。Steamの公開API(ログイン不要)でウィッシュリストと価格を取得し、`price_history.json`(リポジトリにgit commitして永続化)と比較して値下げを検知。3件以上の同時値下げ時はQwen3-8B(1min.ai)にverdictラベルのみを問い合わせて優先順位付けし、Discord webhookに通知する。拡張機能側の`chrome.alarms`による自動チェックは無効化する。

**Tech Stack:** Node.js(組み込み`fetch`と`node:test`のみ、npm依存追加なし)、GitHub Actions(`actions/checkout`, `actions/setup-node`)、Discord Webhook、Steam公開API、1min.ai API(Qwen3-8B)

**Spec:** `docs/superpowers/specs/2026-08-16-wishlist-price-cron-design.md`

## Global Constraints

- 新規npm依存パッケージは追加しない(Node組み込み`fetch`/`node:test`/`node:assert`のみ使用)
- 既存の`background.js`の`checkWishlistPrices`関数・定数(`VERDICT_RANK`, `VERDICT_EMOJI`, Discord embed構造)はそのまま流用・移植する。独自の新しい通知フォーマットは作らない
- `chrome.alarms`関連コードは**削除せず、コメントアウトで無効化**する(将来元に戻せるように)
- Secrets(`DISCORD_WEBHOOK_URL`, `ONEMIN_API_KEY`, `STEAM_ID64`)の登録はユーザーがGitHub Web UIで手動で行う。エージェントは代行できない
- リポジトリは既に`https://github.com/Nekokann3352/steam-ja-translates`(private)にpush済み。ローカルの`.git`にリモート設定済み

---

### Task 1: 価格差分検知ロジック(純粋関数)とテスト

**Files:**
- Create: `scripts/check-wishlist-prices.js`
- Test: `scripts/check-wishlist-prices.test.js`

**Interfaces:**
- Produces: `detectPriceDrops(items, history, minDiscountPct)` — `items: [{id: string, name: string, price: number}]`, `history: {[id: string]: number}`, 戻り値 `{drops: [{id, name, prevPrice, price, dropPct}], updatedHistory: {[id: string]: number}}`

- [ ] **Step 1: `scripts/check-wishlist-prices.js`を作成し、`detectPriceDrops`を実装する**

```js
'use strict';

// 既存のbackground.js内checkWishlistPricesと同じロジック(閾値未満の下落ではhistを更新しない)を
// ブラウザ非依存のNode.js純粋関数として移植したもの。
function detectPriceDrops(items, history, minDiscountPct) {
  var drops = [];
  var updatedHistory = Object.assign({}, history);
  items.forEach(function (item) {
    var prev = updatedHistory[item.id];
    if (prev != null && item.price < prev) {
      var dropPct = prev > 0 ? Math.round((prev - item.price) / prev * 100) : 0;
      if (dropPct >= minDiscountPct) {
        drops.push({ id: item.id, name: item.name, prevPrice: prev, price: item.price, dropPct: dropPct });
        updatedHistory[item.id] = item.price;
      }
      // 閾値未満の下落はhistを更新しない。何日も積み重なった末の大きな値下げを検知できるようにするため。
    } else if (prev !== item.price) {
      updatedHistory[item.id] = item.price;
    }
  });
  return { drops: drops, updatedHistory: updatedHistory };
}

module.exports = { detectPriceDrops: detectPriceDrops };
```

- [ ] **Step 2: `scripts/check-wishlist-prices.test.js`に失敗するテストを書く**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPriceDrops } = require('./check-wishlist-prices.js');

test('price drop above threshold is detected and history updates', () => {
  const items = [{ id: '100', name: 'Game A', price: 800 }];
  const history = { '100': 1000 };
  const result = detectPriceDrops(items, history, 10);
  assert.equal(result.drops.length, 1);
  assert.deepEqual(result.drops[0], { id: '100', name: 'Game A', prevPrice: 1000, price: 800, dropPct: 20 });
  assert.equal(result.updatedHistory['100'], 800);
});

test('price drop below threshold is not reported and history is NOT updated', () => {
  const items = [{ id: '200', name: 'Game B', price: 950 }];
  const history = { '200': 1000 };
  const result = detectPriceDrops(items, history, 10);
  assert.equal(result.drops.length, 0);
  assert.equal(result.updatedHistory['200'], 1000);
});

test('price increase updates history without producing a drop', () => {
  const items = [{ id: '300', name: 'Game C', price: 1200 }];
  const history = { '300': 1000 };
  const result = detectPriceDrops(items, history, 0);
  assert.equal(result.drops.length, 0);
  assert.equal(result.updatedHistory['300'], 1200);
});

test('unseen item (no prior history) is recorded but not a drop', () => {
  const items = [{ id: '400', name: 'Game D', price: 500 }];
  const result = detectPriceDrops(items, {}, 0);
  assert.equal(result.drops.length, 0);
  assert.equal(result.updatedHistory['400'], 500);
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `node --test scripts/check-wishlist-prices.test.js`
Expected: 4 tests中、モジュールがまだ`module.exports`していない場合はrequireエラーで即失敗。Step 1を先に書いていれば全PASSになるはずなので、Step 1のコードが未保存の状態で一旦確認してから保存するか、Step 1と同時に確認して構わない。

- [ ] **Step 4: テストを実行してPASSを確認する**

Run: `node --test scripts/check-wishlist-prices.test.js`
Expected: 4 tests, 4 pass, 0 fail

- [ ] **Step 5: コミット**

```bash
git add scripts/check-wishlist-prices.js scripts/check-wishlist-prices.test.js
git commit -m "Add price-drop detection logic for wishlist cron"
```

---

### Task 2: Discord embed組み立てロジック(純粋関数)とテスト

**Files:**
- Modify: `scripts/check-wishlist-prices.js`
- Modify: `scripts/check-wishlist-prices.test.js`

**Interfaces:**
- Consumes: `detectPriceDrops`の戻り値の`drops`配列(Task 1で定義した形)
- Produces: `buildDiscordEmbed(drops, verdictMap)` — `verdictMap: {[id: string]: string}`(verdictラベル文字列、未判定はキー無し)。戻り値はDiscord embedオブジェクト1個
- Produces: `VERDICT_RANK`, `VERDICT_EMOJI`定数(既存`background.js`と同じ値)をエクスポートする

- [ ] **Step 1: `check-wishlist-prices.js`に`VERDICT_RANK`/`VERDICT_EMOJI`定数と`buildDiscordEmbed`を追加する**

`module.exports = { detectPriceDrops: detectPriceDrops };`の行を以下に置き換える:

```js
// 既存background.jsのVERDICT_RANK/VERDICT_EMOJIと同じ値。
// Discord通知内のAI判定バッジ表示・ランキング順位付けに使う。
var VERDICT_RANK = { '今すぐ買い': 0, '買い': 1, 'セール待ち': 2, '人を選ぶ': 3, '見送り': 4 };
var VERDICT_EMOJI = { '今すぐ買い': '🔥', '買い': '✅', 'セール待ち': '⏳', '人を選ぶ': '🤔', '見送り': '⛔' };

// 既存background.js の _sendDiscordNotification 呼び出し3パターン(1件/2件/3件以上)を
// 1つの純粋関数に統合したもの。embedの見た目は既存通知と同一にする。
function buildDiscordEmbed(drops, verdictMap) {
  verdictMap = verdictMap || {};

  if (drops.length === 1) {
    var d = drops[0];
    return {
      title: '💰 ' + d.name + ' が値下げされました',
      url: 'https://store.steampowered.com/app/' + d.id + '/',
      color: 0x4caf50,
      thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + d.id + '/header.jpg' },
      fields: [
        { name: '価格', value: '~~¥' + d.prevPrice.toLocaleString() + '~~ → **¥' + d.price.toLocaleString() + '**', inline: true },
        { name: '割引率', value: '-' + d.dropPct + '%', inline: true }
      ]
    };
  }

  if (drops.length >= 3) {
    var ranked = drops.slice().sort(function (a, b) {
      var ra = VERDICT_RANK[verdictMap[a.id]] != null ? VERDICT_RANK[verdictMap[a.id]] : 9;
      var rb = VERDICT_RANK[verdictMap[b.id]] != null ? VERDICT_RANK[verdictMap[b.id]] : 9;
      if (ra !== rb) return ra - rb;
      return b.dropPct - a.dropPct;
    });
    var best3 = ranked.slice(0, 3);
    var hasVerdict = best3.some(function (dd) { return verdictMap[dd.id]; });
    return {
      title: hasVerdict ? '🎯 セール中！AI判定ベスト' : '💰 ウィッシュリストの' + drops.length + '件が値下げされました',
      url: 'https://store.steampowered.com/wishlist/',
      color: hasVerdict ? 0xf6c744 : 0x66c0f4,
      thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + best3[0].id + '/header.jpg' },
      description: best3.map(function (dd) {
        var vv = verdictMap[dd.id];
        var emoji = vv && VERDICT_EMOJI[vv] ? VERDICT_EMOJI[vv] + ' ' : '▪ ';
        return emoji + '**' + dd.name + '**' + (vv ? ' `' + vv + '`' : '')
          + '\n¥' + dd.prevPrice.toLocaleString() + ' → ¥' + dd.price.toLocaleString() + '（-' + dd.dropPct + '%）';
      }).join('\n\n') + (drops.length > 3 ? '\n\n他' + (drops.length - 3) + '件' : ''),
      footer: { text: 'ウィッシュリスト全' + drops.length + '件が値下げ中' }
    };
  }

  return {
    title: '💰 ウィッシュリストの' + drops.length + '件が値下げされました',
    url: 'https://store.steampowered.com/wishlist/',
    color: 0x66c0f4,
    thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + drops[0].id + '/header.jpg' },
    description: drops.map(function (dd) {
      return '▪ **' + dd.name + '**\n¥' + dd.prevPrice.toLocaleString() + ' → ¥' + dd.price.toLocaleString() + '（-' + dd.dropPct + '%）';
    }).join('\n\n')
  };
}

module.exports = {
  detectPriceDrops: detectPriceDrops,
  buildDiscordEmbed: buildDiscordEmbed,
  VERDICT_RANK: VERDICT_RANK,
  VERDICT_EMOJI: VERDICT_EMOJI
};
```

- [ ] **Step 2: テストを追加する**

`check-wishlist-prices.test.js`の`require`行を以下に変更:

```js
const { detectPriceDrops, buildDiscordEmbed } = require('./check-wishlist-prices.js');
```

ファイル末尾に追加:

```js
test('single drop produces a field-based embed with price and discount', () => {
  const drops = [{ id: '1', name: 'Solo Game', prevPrice: 2000, price: 1000, dropPct: 50 }];
  const embed = buildDiscordEmbed(drops, {});
  assert.equal(embed.title, '💰 Solo Game が値下げされました');
  assert.equal(embed.fields[1].value, '-50%');
});

test('two drops produce a plain description list, no AI ranking', () => {
  const drops = [
    { id: '1', name: 'Game A', prevPrice: 1000, price: 800, dropPct: 20 },
    { id: '2', name: 'Game B', prevPrice: 500, price: 400, dropPct: 20 }
  ];
  const embed = buildDiscordEmbed(drops, {});
  assert.match(embed.title, /2件が値下げされました/);
  assert.match(embed.description, /Game A/);
  assert.match(embed.description, /Game B/);
});

test('three or more drops with verdicts rank best-3 by VERDICT_RANK, not just discount size', () => {
  const drops = [
    { id: '1', name: 'Low priority but bigger discount', prevPrice: 1000, price: 100, dropPct: 90 },
    { id: '2', name: 'Must buy now', prevPrice: 1000, price: 900, dropPct: 10 },
    { id: '3', name: 'No verdict', prevPrice: 1000, price: 500, dropPct: 50 }
  ];
  const verdictMap = { '1': '見送り', '2': '今すぐ買い' };
  const embed = buildDiscordEmbed(drops, verdictMap);
  assert.equal(embed.title, '🎯 セール中！AI判定ベスト');
  // 今すぐ買い(rank 0)が最初に来るべき。単純な割引率順なら90%引きのid:1が先頭になってしまう。
  assert.ok(embed.description.indexOf('Must buy now') < embed.description.indexOf('Low priority but bigger discount'));
});

test('three or more drops with no verdicts at all falls back to plain digest title', () => {
  const drops = [
    { id: '1', name: 'A', prevPrice: 1000, price: 900, dropPct: 10 },
    { id: '2', name: 'B', prevPrice: 1000, price: 900, dropPct: 10 },
    { id: '3', name: 'C', prevPrice: 1000, price: 900, dropPct: 10 }
  ];
  const embed = buildDiscordEmbed(drops, {});
  assert.match(embed.title, /3件が値下げされました/);
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `node --test scripts/check-wishlist-prices.test.js`
Expected: `buildDiscordEmbed`未実装ならFAIL(またはStep 1と合わせて実装済みならPASSでも可。重要なのはこの後Step 4で全PASSを確認すること)

- [ ] **Step 4: テストを実行してPASSを確認する**

Run: `node --test scripts/check-wishlist-prices.test.js`
Expected: 8 tests, 8 pass, 0 fail

- [ ] **Step 5: コミット**

```bash
git add scripts/check-wishlist-prices.js scripts/check-wishlist-prices.test.js
git commit -m "Add Discord embed builder for wishlist price-drop notifications"
```

---

### Task 3: AI verdictラベル解析ロジック(純粋関数)とテスト

**Files:**
- Modify: `scripts/check-wishlist-prices.js`
- Modify: `scripts/check-wishlist-prices.test.js`

**Interfaces:**
- Produces: `parseVerdictLabel(text)` — AIの生テキスト応答から5つの既定ラベルのどれかを抽出する。一致しなければ`null`

- [ ] **Step 1: `check-wishlist-prices.js`に`parseVerdictLabel`を追加する**

`module.exports`の直前に追加:

```js
var VERDICT_LABELS = ['今すぐ買い', '買い', 'セール待ち', '人を選ぶ', '見送り'];

// AIは単一ラベルのみ返すよう指示するが、句読点や引用符が付いて返ることがあるため
// 完全一致 → 部分一致(長い順、"買い"が"今すぐ買い"の一部に誤爆しないよう長さ降順)の順で判定する。
function parseVerdictLabel(text) {
  if (!text) return null;
  var trimmed = String(text).trim();
  if (VERDICT_LABELS.indexOf(trimmed) >= 0) return trimmed;
  var byLength = VERDICT_LABELS.slice().sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < byLength.length; i++) {
    if (trimmed.indexOf(byLength[i]) >= 0) return byLength[i];
  }
  return null;
}
```

`module.exports`のオブジェクトに`parseVerdictLabel: parseVerdictLabel,`を追加する。

- [ ] **Step 2: テストを追加する**

`require`行に`parseVerdictLabel`を追加してから、ファイル末尾に追加:

```js
test('parseVerdictLabel matches an exact label', () => {
  assert.equal(parseVerdictLabel('今すぐ買い'), '今すぐ買い');
});

test('parseVerdictLabel matches when the model adds surrounding text', () => {
  assert.equal(parseVerdictLabel('判定: セール待ち です。'), 'セール待ち');
});

test('parseVerdictLabel prefers the longer label to avoid substring false match', () => {
  assert.equal(parseVerdictLabel('今すぐ買いだと思います'), '今すぐ買い');
});

test('parseVerdictLabel returns null for unrecognized output', () => {
  assert.equal(parseVerdictLabel('わかりません'), null);
  assert.equal(parseVerdictLabel(''), null);
  assert.equal(parseVerdictLabel(null), null);
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `node --test scripts/check-wishlist-prices.test.js`
Expected: `parseVerdictLabel`未実装ならFAIL

- [ ] **Step 4: テストを実行してPASSを確認する**

Run: `node --test scripts/check-wishlist-prices.test.js`
Expected: 12 tests, 12 pass, 0 fail

- [ ] **Step 5: コミット**

```bash
git add scripts/check-wishlist-prices.js scripts/check-wishlist-prices.test.js
git commit -m "Add AI verdict label parser for wishlist price-drop notifications"
```

---

### Task 4: I/O関数とmain()オーケストレーション

**Files:**
- Modify: `scripts/check-wishlist-prices.js`
- Create: `price_history.json`

**Interfaces:**
- Consumes: `detectPriceDrops`, `buildDiscordEmbed`, `parseVerdictLabel`, `VERDICT_RANK`, `VERDICT_EMOJI`(すべてTask 1-3で定義済み)
- Produces: `main()` — スクリプトのエントリポイント。この関数自体はユニットテストしない(全てネットワークI/O)。動作確認はTask 6のworkflow_dispatch手動実行で行う

- [ ] **Step 1: `check-wishlist-prices.js`の先頭に`require`を追加する**

ファイル先頭の`'use strict';`の直後に追加:

```js
var fs = require('node:fs');
var path = require('node:path');
```

- [ ] **Step 2: I/O関数を追加する**

`module.exports`の直前(Task 3で追加した`parseVerdictLabel`の後)に追加:

```js
async function fetchWishlist(steamId64) {
  var r = await fetch('https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=' + steamId64);
  if (!r.ok) throw new Error('ウィッシュリスト取得に失敗しました(' + r.status + ')');
  var d = await r.json();
  return (d.response && d.response.items) || [];
}

async function fetchPrice(appid) {
  var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,price_overview&cc=jp');
  if (!r.ok) return null;
  var d = await r.json();
  var info = d && d[appid] && d[appid].data;
  if (!info || !info.price_overview) return null;
  return { id: String(appid), name: info.name, price: Math.floor(info.price_overview.final / 100) };
}

async function fetchReviews(appid, count) {
  var r = await fetch('https://store.steampowered.com/appreviews/' + appid
    + '?json=1&num_per_page=' + (count || 15) + '&language=japanese&filter=recent&purchase_type=all');
  if (!r.ok) return [];
  var d = await r.json();
  return (d.reviews || []).map(function (rv) { return rv.review; }).filter(Boolean);
}

async function fetchVerdict(gameName, reviewTexts, apiKey) {
  if (!reviewTexts.length) return null;
  var joined = reviewTexts.join('\n---\n').slice(0, 3000);
  var prompt = 'あなたはSteamゲームレビューの要約AIです。以下は「' + gameName + '」のユーザーレビュー抜粋です。\n'
    + 'このゲームの購入判断を、次の5つのラベルのうち1つだけで答えてください。ラベル以外の文字は一切出力しないでください。\n'
    + 'ラベル: 今すぐ買い / 買い / セール待ち / 人を選ぶ / 見送り\n\n'
    + 'レビュー:\n' + joined;
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
  return parseVerdictLabel(text);
}

async function sendDiscordNotification(embed, webhookUrl) {
  embed.footer = embed.footer || { text: 'Steam Japanese Translator (Cron)' };
  embed.timestamp = new Date().toISOString();
  var r = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });
  if (!r.ok) throw new Error('Discord webhook送信に失敗しました(' + r.status + ')');
}

function loadHistory(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveHistory(filePath, history) {
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2) + '\n');
}
```

- [ ] **Step 3: `main()`を追加する**

上記の直後、`module.exports`の直前に追加:

```js
async function main() {
  var steamId = process.env.STEAM_ID64;
  var webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  var apiKey = process.env.ONEMIN_API_KEY;
  var minDiscountPct = Number(process.env.MIN_DISCOUNT_PCT || 0);
  var historyPath = path.join(__dirname, '..', 'price_history.json');

  if (!steamId || !webhookUrl) {
    console.error('STEAM_ID64 と DISCORD_WEBHOOK_URL は必須です');
    process.exit(1);
  }

  var wishlist = await fetchWishlist(steamId);
  console.log('ウィッシュリスト件数: ' + wishlist.length);

  var items = [];
  var CHUNK = 4;
  for (var i = 0; i < wishlist.length; i += CHUNK) {
    var chunk = wishlist.slice(i, i + CHUNK);
    var results = await Promise.all(chunk.map(function (w) {
      return fetchPrice(w.appid).catch(function () { return null; });
    }));
    results.forEach(function (r) { if (r) items.push(r); });
    if (i + CHUNK < wishlist.length) {
      await new Promise(function (res) { setTimeout(res, 800); });
    }
  }
  console.log('価格取得成功件数: ' + items.length);

  var history = loadHistory(historyPath);
  var result = detectPriceDrops(items, history, minDiscountPct);
  console.log('値下げ検知件数: ' + result.drops.length);

  saveHistory(historyPath, result.updatedHistory);

  if (!result.drops.length) {
    console.log('値下げなし、終了します');
    return;
  }

  var verdictMap = {};
  if (result.drops.length >= 3 && apiKey) {
    for (var j = 0; j < result.drops.length; j++) {
      var drop = result.drops[j];
      try {
        var reviews = await fetchReviews(drop.id, 15);
        var verdict = await fetchVerdict(drop.name, reviews, apiKey);
        if (verdict) verdictMap[drop.id] = verdict;
      } catch (e) {
        console.error('AI判定失敗(appid=' + drop.id + '): ' + e.message);
      }
    }
  }

  var embed = buildDiscordEmbed(result.drops, verdictMap);
  await sendDiscordNotification(embed, webhookUrl);
  console.log('Discord通知を送信しました');
}

if (require.main === module) {
  main().catch(function (e) {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: `module.exports`にI/O関数も追加する**

既存の`module.exports = { ... }`を以下に置き換える(テスト対象の純粋関数はそのまま、I/O関数と`main`を追加):

```js
module.exports = {
  detectPriceDrops: detectPriceDrops,
  buildDiscordEmbed: buildDiscordEmbed,
  parseVerdictLabel: parseVerdictLabel,
  VERDICT_RANK: VERDICT_RANK,
  VERDICT_EMOJI: VERDICT_EMOJI,
  fetchWishlist: fetchWishlist,
  fetchPrice: fetchPrice,
  fetchReviews: fetchReviews,
  fetchVerdict: fetchVerdict,
  sendDiscordNotification: sendDiscordNotification,
  loadHistory: loadHistory,
  saveHistory: saveHistory,
  main: main
};
```

- [ ] **Step 5: 既存のユニットテストが壊れていないことを確認する**

Run: `node --test scripts/check-wishlist-prices.test.js`
Expected: 12 tests, 12 pass, 0 fail (I/O関数追加でも純粋関数のテストは影響を受けない)

- [ ] **Step 6: 構文チェック**

Run: `node --check scripts/check-wishlist-prices.js`
Expected: エラーなし(出力なしで正常終了)

- [ ] **Step 7: `price_history.json`の初期ファイルを作成する**

```bash
echo '{}' > "C:/Users/raito/steam-ja-translate/price_history.json"
```

- [ ] **Step 8: コミット**

```bash
git add scripts/check-wishlist-prices.js price_history.json
git commit -m "Add I/O layer and main orchestrator for wishlist price cron script"
```

---

### Task 5: GitHub Actionsワークフロー

**Files:**
- Create: `.github/workflows/wishlist-price-check.yml`

**Interfaces:**
- Consumes: `scripts/check-wishlist-prices.js`(Task 4で完成)、Secrets `STEAM_ID64`/`DISCORD_WEBHOOK_URL`/`ONEMIN_API_KEY`(ユーザーがTask 6で登録)

- [ ] **Step 1: ワークフローファイルを作成する**

```yaml
name: Wishlist Price Check

on:
  schedule:
    # 00:00 UTC = 09:00 JST。GitHub Actionsのcronは分刻みの遅延があるため目安時刻。
    - cron: '0 0 * * *'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  check-prices:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run price check
        env:
          STEAM_ID64: ${{ secrets.STEAM_ID64 }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
          ONEMIN_API_KEY: ${{ secrets.ONEMIN_API_KEY }}
        run: node scripts/check-wishlist-prices.js

      - name: Commit updated price history
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add price_history.json
          git diff --staged --quiet || git commit -m "chore: update price history [skip ci]"
          git push
```

- [ ] **Step 2: YAML構文を確認する**

Run: `node -e "require('node:fs').readFileSync('.github/workflows/wishlist-price-check.yml','utf8')" && echo "file exists and is readable"`

(このマシンにYAMLパーサーが入っていないため、厳密なYAML構文検証はGitHub Actions実行時に行う。ここではファイルが存在し読み込めることだけ確認する。)

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/wishlist-price-check.yml
git commit -m "Add GitHub Actions workflow for wishlist price cron"
```

---

### Task 6: 拡張機能側の自動チェックを無効化

**Files:**
- Modify: `background.js:77-87`

**Interfaces:**
- Consumes: なし
- Produces: なし(UIから呼ばれる`checkWishlistPrices`関数定義自体は残るが、自動起動されなくなる)

- [ ] **Step 1: `background.js`の`ensureWishlistAlarm`呼び出しと`chrome.alarms.onAlarm`リスナーをコメントアウトする**

`background.js`の以下の部分(77-87行目付近):

```js
function ensureWishlistAlarm() {
  chrome.alarms.get(WISH_ALARM_NAME, function (a) {
    if (!a) chrome.alarms.create(WISH_ALARM_NAME, { periodInMinutes: 1440 });
  });
}
chrome.runtime.onInstalled.addListener(ensureWishlistAlarm);
chrome.runtime.onStartup.addListener(ensureWishlistAlarm);

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === WISH_ALARM_NAME) checkWishlistPrices();
});
```

を以下に置き換える:

```js
function ensureWishlistAlarm() {
  chrome.alarms.get(WISH_ALARM_NAME, function (a) {
    if (!a) chrome.alarms.create(WISH_ALARM_NAME, { periodInMinutes: 1440 });
  });
}
// ウィッシュリスト値下げチェックはGitHub Actions(.github/workflows/wishlist-price-check.yml)に
// 移行したため、拡張機能側の自動起動は無効化する(二重通知防止)。
// chrome.runtime.onInstalled.addListener(ensureWishlistAlarm);
// chrome.runtime.onStartup.addListener(ensureWishlistAlarm);

chrome.alarms.onAlarm.addListener(function (alarm) {
  // if (alarm.name === WISH_ALARM_NAME) checkWishlistPrices();
});
```

- [ ] **Step 2: 構文チェック**

Run: `node --check background.js`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add background.js
git commit -m "Disable extension-side wishlist price alarm (moved to GitHub Actions)"
```

---

### Task 7: Secrets登録とpush(ユーザー作業) + 動作確認

**Files:** なし(GitHub Web UI上の作業)

このタスクはコードを書かず、ユーザーが実施する。エージェントは指示文を提示し、ユーザーの完了報告を待つ。

- [ ] **Step 1: ここまでの全コミットをGitHubにpushする**

```bash
git push origin main
```

- [ ] **Step 2: ユーザーにSecrets登録を依頼する**

以下をユーザーに伝える:

> `https://github.com/Nekokann3352/steam-ja-translates/settings/secrets/actions` を開いて、「New repository secret」から3つ登録してください:
> - `DISCORD_WEBHOOK_URL` — 拡張機能の設定画面で使っているのと同じDiscord webhook URL
> - `ONEMIN_API_KEY` — 拡張機能の設定画面で使っているのと同じ1min.ai APIキー
> - `STEAM_ID64` — あなたのSteamID64(17桁の数字。`https://steamid.io/` に自分のプロフィールURLを貼れば調べられます)
>
> 登録が終わったら教えてください。

- [ ] **Step 3: ユーザーの完了報告を受けて、手動実行を依頼する**

以下をユーザーに伝える:

> `https://github.com/Nekokann3352/steam-ja-translates/actions/workflows/wishlist-price-check.yml` を開いて、右側の「Run workflow」ボタンから手動実行してください。数十秒〜数分後に完了するので、ログを開いて「ウィッシュリスト件数」「価格取得成功件数」「値下げ検知件数」が出ているか確認してください。値下げが実際に発生していればDiscordにも通知が来ます。

- [ ] **Step 4: 動作確認完了の報告を受けて、`price_history.json`がcommitされたことを確認する**

```bash
git pull origin main
cat price_history.json
```

Expected: ワークフロー実行後、GitHub Actions bot名義のコミットが増えており、`price_history.json`にウィッシュリストのゲームIDと価格が入っている

