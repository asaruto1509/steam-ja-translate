# 毎日のおすすめゲーム通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 毎日Steamの売上上位/新作からランダムに5本を選び、AI分析(Qwen3-8B)付きで見た目のいいDiscord embedカードとして通知する、既存の値下げ通知cronとは独立した第2のGitHub Actionsワークフローを追加する。

**Architecture:** `scripts/recommend-games.js`が`store.steampowered.com/api/featuredcategories`(公開API)から候補プールを取得→無作為に5本選出→各ゲームのレビューを既存`check-wishlist-prices.js`の`fetchReviews`を再利用して取得→Qwen3-8Bに軽量JSON形式で分析依頼(テンプレート書き写し検知ガード付き)→ゲームごとに個別のDiscord embed(画像・価格・AI判定付き)を組み立てて1メッセージで送信する。別スケジュールのGitHub Actionsワークフローから毎日実行される。

**Tech Stack:** Node.js(組み込み`fetch`/`node:test`のみ、npm依存追加なし)、GitHub Actions、Discord Webhook、Steam公開API(`featuredcategories`, `appreviews`)、1min.ai API(Qwen3-8B)

**Spec:** `docs/superpowers/specs/2026-08-16-daily-game-recommend-design.md`

## Global Constraints

- 新規npm依存パッケージは追加しない(Node組み込み`fetch`/`node:test`/`node:assert`のみ使用)
- 新規Secretsは追加しない。既存の`DISCORD_WEBHOOK_URL`・`ONEMIN_API_KEY`をそのまま再利用する
- `scripts/check-wishlist-prices.js`の`fetchReviews(appid, count)`をrequireして再利用する(汎用関数、ウィッシュリスト固有ロジックを含まない)。この関数のシグネチャ・挙動は変更しない
- 重複回避ロジックは実装しない(ユーザーが明示的に不要と回答済み)。ただし同一実行内での重複(top_sellersとnew_releasesの両方に同じゲームが載っているケース)は選出前に除去する
- テンプレート書き写し検知は既存`main.js`の`_isLeakedString`と同じ正規表現パターン(`/\d+字(以内|以上|程度)?/`)を流用する
- ワークフローのスケジュールは既存の値下げ通知cron(`0 0 * * *`)とは別時刻にする

---

### Task 1: ランダム選出ロジック(純粋関数)とテスト

**Files:**
- Create: `scripts/recommend-games.js`
- Test: `scripts/recommend-games.test.js`

**Interfaces:**
- Produces: `pickRandomGames(pool, n, rng)` — `pool: [{id: string, name: string, ...}]`, `n: number`, `rng: () => number`(省略時`Math.random`)。戻り値は`pool`からid重複を除去した上で無作為に`n`件選んだ配列(元の要素をそのまま含む)

- [ ] **Step 1: `scripts/recommend-games.js`を作成し、`pickRandomGames`を実装する**

```js
'use strict';

// top_sellersとnew_releasesの両方に同じゲームが載っているケースがあるため、
// 選出前にid重複を除去する(同じゲームが1日の投稿内で2回出るのを防ぐ)。
function _dedupeById(pool) {
  var seen = {};
  return pool.filter(function (item) {
    if (seen[item.id]) return false;
    seen[item.id] = true;
    return true;
  });
}

// Fisher-Yatesシャッフルで先頭n件を返す。rngを注入可能にすることで
// テストから決定的な乱数列を渡せるようにしている。
function pickRandomGames(pool, n, rng) {
  rng = rng || Math.random;
  var arr = _dedupeById(pool).slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, n);
}

module.exports = { pickRandomGames: pickRandomGames };
```

- [ ] **Step 2: `scripts/recommend-games.test.js`に失敗するテストを書く**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRandomGames } = require('./recommend-games.js');

test('pickRandomGames returns exactly n items from a larger pool', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' },
    { id: '4', name: 'D' }, { id: '5', name: 'E' }
  ];
  const result = pickRandomGames(pool, 3, () => 0);
  assert.equal(result.length, 3);
});

test('pickRandomGames dedupes by id before selecting (same game in both source lists)', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '1', name: 'A (dup)' }, { id: '2', name: 'B' }
  ];
  const result = pickRandomGames(pool, 2, () => 0);
  assert.equal(result.length, 2);
  const ids = result.map((g) => g.id);
  assert.equal(new Set(ids).size, 2);
});

test('pickRandomGames with a fixed rng produces a deterministic, reproducible order', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }, { id: '4', name: 'D' }
  ];
  const fixedRng = () => 0.5;
  const result1 = pickRandomGames(pool, 4, fixedRng);
  const result2 = pickRandomGames(pool, 4, fixedRng);
  assert.deepEqual(result1.map((g) => g.id), result2.map((g) => g.id));
});

test('pickRandomGames returns fewer items than n if the deduped pool is smaller than n', () => {
  const pool = [{ id: '1', name: 'A' }, { id: '1', name: 'A (dup)' }];
  const result = pickRandomGames(pool, 5, () => 0);
  assert.equal(result.length, 1);
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `node --test scripts/recommend-games.test.js`
Expected: `recommend-games.js`が存在しない、またはStep 1の実装前であればrequireエラーでFAIL

- [ ] **Step 4: テストを実行してPASSを確認する**

Run: `node --test scripts/recommend-games.test.js`
Expected: 4 tests, 4 pass, 0 fail

- [ ] **Step 5: コミット**

```bash
git add scripts/recommend-games.js scripts/recommend-games.test.js
git commit -m "Add random game selection logic for daily recommendation"
```

---

### Task 2: AI分析レスポンス解析ロジック(純粋関数、テンプレート漏れガード付き)とテスト

**Files:**
- Modify: `scripts/recommend-games.js`
- Modify: `scripts/recommend-games.test.js`

**Interfaces:**
- Consumes: なし(Task 1の`pickRandomGames`とは独立)
- Produces: `parseGameAnalysis(text)` — AIの生テキスト応答からJSONを抽出・検証する。戻り値は
  `{verdict: string|null, reason: string, good: string[], concern: string}`、またはJSON抽出/パース失敗時は`null`

- [ ] **Step 1: `scripts/recommend-games.js`に`parseGameAnalysis`を追加する**

`module.exports`の行を以下に置き換える:

```js
// 本日発生した「複雑なJSONスキーマだとAIが指示文の書き写しをそのまま返す」不具合と同じ検知パターン。
// main.jsの_isLeakedStringと同じ正規表現(数値+「字以内/以上/程度」)を流用し、
// プロンプト内の文字数指示がそのまま値として書き写された場合にその項目だけを無効化する。
var LEAK_PATTERN = /\d+字(以内|以上|程度)?/;
function _isLeaked(s) {
  return typeof s === 'string' && LEAK_PATTERN.test(s);
}

function _extractJsonObject(text) {
  var match = String(text || '').match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function parseGameAnalysis(text) {
  var jsonStr = _extractJsonObject(text);
  if (!jsonStr) return null;
  var obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  var verdict = (typeof obj.verdict === 'string' && !_isLeaked(obj.verdict)) ? obj.verdict : null;
  var reason = (typeof obj.reason === 'string' && !_isLeaked(obj.reason)) ? obj.reason : '';
  var good = Array.isArray(obj.good)
    ? obj.good.filter(function (g) { return typeof g === 'string' && !_isLeaked(g); }).slice(0, 3)
    : [];
  var concern = (typeof obj.concern === 'string' && !_isLeaked(obj.concern)) ? obj.concern : '';

  return { verdict: verdict, reason: reason, good: good, concern: concern };
}

module.exports = { pickRandomGames: pickRandomGames, parseGameAnalysis: parseGameAnalysis };
```

- [ ] **Step 2: テストを追加する**

`require`行を以下に変更:

```js
const { pickRandomGames, parseGameAnalysis } = require('./recommend-games.js');
```

ファイル末尾に追加:

```js
test('parseGameAnalysis parses a clean JSON response', () => {
  const text = '{"verdict":"買い","reason":"完成度が高い","good":["操作性が良い","BGMが良い"],"concern":"難易度が高め"}';
  const result = parseGameAnalysis(text);
  assert.deepEqual(result, {
    verdict: '買い',
    reason: '完成度が高い',
    good: ['操作性が良い', 'BGMが良い'],
    concern: '難易度が高め'
  });
});

test('parseGameAnalysis extracts JSON even when wrapped in surrounding prose', () => {
  const text = '以下が分析結果です:\n{"verdict":"今すぐ買い","reason":"神ゲー","good":["神ゲー"],"concern":""}\nご参考までに。';
  const result = parseGameAnalysis(text);
  assert.equal(result.verdict, '今すぐ買い');
});

test('parseGameAnalysis nulls out only the leaked field, keeps the rest', () => {
  const text = '{"verdict":"買い","reason":"20字以内で理由","good":["本物の良い点"],"concern":""}';
  const result = parseGameAnalysis(text);
  assert.equal(result.verdict, '買い');
  assert.equal(result.reason, '');
  assert.deepEqual(result.good, ['本物の良い点']);
});

test('parseGameAnalysis filters leaked entries out of the good array individually', () => {
  const text = '{"verdict":"買い","reason":"","good":["15字以内の良い点1","本物の良い点2"],"concern":""}';
  const result = parseGameAnalysis(text);
  assert.deepEqual(result.good, ['本物の良い点2']);
});

test('parseGameAnalysis returns null for unparseable text', () => {
  assert.equal(parseGameAnalysis('すみません、分析できませんでした'), null);
  assert.equal(parseGameAnalysis(''), null);
  assert.equal(parseGameAnalysis(null), null);
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `node --test scripts/recommend-games.test.js`
Expected: `parseGameAnalysis`未実装ならFAIL

- [ ] **Step 4: テストを実行してPASSを確認する**

Run: `node --test scripts/recommend-games.test.js`
Expected: 9 tests, 9 pass, 0 fail

- [ ] **Step 5: コミット**

```bash
git add scripts/recommend-games.js scripts/recommend-games.test.js
git commit -m "Add AI analysis response parser with template-leak guard"
```

---

### Task 3: Discord embed組み立てロジック(純粋関数)とテスト

**Files:**
- Modify: `scripts/recommend-games.js`
- Modify: `scripts/recommend-games.test.js`

**Interfaces:**
- Consumes: `parseGameAnalysis`の戻り値の形(Task 2で定義)を`analysis`フィールドとして受け取る
- Produces: `buildRecommendEmbeds(games)` — `games: [{id, name, finalPrice, originalPrice, discountPercent, image, analysis}]`。
  `analysis`は`parseGameAnalysis`の戻り値、または`null`(AI分析が失敗/未実施の場合)。戻り値はDiscord embedオブジェクトの配列(gamesと同じ順序・同じ件数)

- [ ] **Step 1: `scripts/recommend-games.js`に`buildRecommendEmbeds`を追加する**

`module.exports`の行を以下に置き換える:

```js
// AI分析が失敗した場合(analysisがnull)でも、価格情報だけの簡易embedとして必ず1件は出す
// (5本中1本もAI分析が成功しなかった場合でも「紹介自体はする」という設計方針)。
function buildRecommendEmbeds(games) {
  return games.map(function (g) {
    var priceLine = g.discountPercent > 0
      ? '~~¥' + g.originalPrice.toLocaleString() + '~~ → **¥' + g.finalPrice.toLocaleString() + '** (-' + g.discountPercent + '%)'
      : '¥' + g.finalPrice.toLocaleString();
    var fields = [{ name: '価格', value: priceLine, inline: true }];

    var a = g.analysis;
    if (a && a.verdict) fields.push({ name: 'AI判定', value: a.verdict, inline: true });
    if (a && a.reason) fields.push({ name: '理由', value: a.reason, inline: false });
    if (a && a.good && a.good.length) {
      fields.push({ name: '👍 良い点', value: a.good.map(function (x) { return '・' + x; }).join('\n'), inline: true });
    }
    if (a && a.concern) fields.push({ name: '⚠ 懸念', value: a.concern, inline: true });

    return {
      title: g.name,
      url: 'https://store.steampowered.com/app/' + g.id + '/',
      color: 0x66c0f4,
      thumbnail: { url: g.image },
      fields: fields
    };
  });
}

module.exports = {
  pickRandomGames: pickRandomGames,
  parseGameAnalysis: parseGameAnalysis,
  buildRecommendEmbeds: buildRecommendEmbeds
};
```

- [ ] **Step 2: テストを追加する**

`require`行を以下に変更:

```js
const { pickRandomGames, parseGameAnalysis, buildRecommendEmbeds } = require('./recommend-games.js');
```

ファイル末尾に追加:

```js
test('buildRecommendEmbeds includes all analysis fields when analysis succeeded', () => {
  const games = [{
    id: '100', name: 'Test Game', finalPrice: 1000, originalPrice: 1000, discountPercent: 0,
    image: 'https://example.com/img.jpg',
    analysis: { verdict: '買い', reason: '面白い', good: ['操作性が良い'], concern: '短い' }
  }];
  const embeds = buildRecommendEmbeds(games);
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].title, 'Test Game');
  assert.equal(embeds[0].thumbnail.url, 'https://example.com/img.jpg');
  const fieldNames = embeds[0].fields.map((f) => f.name);
  assert.ok(fieldNames.includes('AI判定'));
  assert.ok(fieldNames.includes('👍 良い点'));
  assert.ok(fieldNames.includes('⚠ 懸念'));
});

test('buildRecommendEmbeds degrades to a price-only embed when analysis is null', () => {
  const games = [{
    id: '200', name: 'No Analysis Game', finalPrice: 500, originalPrice: 500, discountPercent: 0,
    image: 'https://example.com/img2.jpg', analysis: null
  }];
  const embeds = buildRecommendEmbeds(games);
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].fields.length, 1);
  assert.equal(embeds[0].fields[0].name, '価格');
});

test('buildRecommendEmbeds formats a discounted price with strikethrough original price', () => {
  const games = [{
    id: '300', name: 'Sale Game', finalPrice: 750, originalPrice: 1000, discountPercent: 25,
    image: 'https://example.com/img3.jpg', analysis: null
  }];
  const embeds = buildRecommendEmbeds(games);
  assert.match(embeds[0].fields[0].value, /~~¥1,000~~/);
  assert.match(embeds[0].fields[0].value, /¥750/);
  assert.match(embeds[0].fields[0].value, /-25%/);
});

test('buildRecommendEmbeds preserves game order and count across multiple games', () => {
  const games = [
    { id: '1', name: 'First', finalPrice: 100, originalPrice: 100, discountPercent: 0, image: 'a', analysis: null },
    { id: '2', name: 'Second', finalPrice: 200, originalPrice: 200, discountPercent: 0, image: 'b', analysis: null }
  ];
  const embeds = buildRecommendEmbeds(games);
  assert.equal(embeds.length, 2);
  assert.equal(embeds[0].title, 'First');
  assert.equal(embeds[1].title, 'Second');
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

Run: `node --test scripts/recommend-games.test.js`
Expected: `buildRecommendEmbeds`未実装ならFAIL

- [ ] **Step 4: テストを実行してPASSを確認する**

Run: `node --test scripts/recommend-games.test.js`
Expected: 13 tests, 13 pass, 0 fail

- [ ] **Step 5: コミット**

```bash
git add scripts/recommend-games.js scripts/recommend-games.test.js
git commit -m "Add Discord embed builder for daily game recommendations"
```

---

### Task 4: I/O関数とmain()オーケストレーション

**Files:**
- Modify: `scripts/recommend-games.js`

**Interfaces:**
- Consumes: `pickRandomGames`, `parseGameAnalysis`, `buildRecommendEmbeds`(Task 1-3で定義済み)、
  `fetchReviews(appid, count)` — `scripts/check-wishlist-prices.js`からrequireして再利用する既存関数
- Produces: `main()` — スクリプトのエントリポイント。この関数自体とその他のI/O関数はユニットテストしない
  (全てネットワークI/O)。動作確認はTask 6のworkflow_dispatch手動実行で行う

- [ ] **Step 1: `scripts/recommend-games.js`の先頭に`require`を追加する**

ファイル先頭の`'use strict';`の直後に追加:

```js
var { fetchReviews } = require('./check-wishlist-prices.js');
```

- [ ] **Step 2: I/O関数を追加する**

`module.exports`の直前に追加:

```js
async function fetchFeaturedPool() {
  var r = await fetch('https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese');
  if (!r.ok) throw new Error('featuredcategories取得に失敗しました(' + r.status + ')');
  var d = await r.json();
  var pool = [];
  ['top_sellers', 'new_releases'].forEach(function (key) {
    var items = (d[key] && d[key].items) || [];
    items.forEach(function (it) {
      pool.push({
        id: String(it.id),
        name: it.name,
        finalPrice: Math.floor((it.final_price || 0) / 100),
        originalPrice: Math.floor((it.original_price || it.final_price || 0) / 100),
        discountPercent: it.discount_percent || 0,
        image: it.large_capsule_image || it.header_image || null
      });
    });
  });
  return pool;
}

async function fetchGameAnalysis(gameName, reviewTexts, apiKey) {
  if (!reviewTexts.length) return null;
  var joined = reviewTexts.join('\n---\n').slice(0, 3000);
  var prompt = 'あなたはSteamゲームレビューの要約AIです。以下は「' + gameName + '」のユーザーレビュー抜粋です。\n'
    + '次のJSON形式のみで回答してください。説明文やコードブロックは不要です。\n'
    + '{"verdict":"今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか","reason":"一言理由(20字程度)","good":["良い点1(15字程度)","良い点2(15字程度)"],"concern":"懸念点(15字程度、無ければ空文字)"}\n\n'
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
  return parseGameAnalysis(text);
}

async function sendDiscordEmbeds(embeds, webhookUrl) {
  var r = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '🎮 今日のおすすめゲーム', embeds: embeds })
  });
  if (!r.ok) throw new Error('Discord webhook送信に失敗しました(' + r.status + ')');
}
```

- [ ] **Step 3: `main()`を追加する**

上記の直後、`module.exports`の直前に追加:

```js
async function main() {
  var webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  var apiKey = process.env.ONEMIN_API_KEY;
  var pickCount = Number(process.env.RECOMMEND_COUNT || 5);

  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL は必須です');
    process.exit(1);
  }

  var pool = await fetchFeaturedPool();
  console.log('候補プール件数: ' + pool.length);
  if (!pool.length) {
    console.error('候補プールが0件でした');
    process.exit(1);
  }

  var picked = pickRandomGames(pool, pickCount);
  console.log('選出件数: ' + picked.length);

  for (var i = 0; i < picked.length; i++) {
    var g = picked[i];
    try {
      var reviews = await fetchReviews(g.id, 15);
      g.analysis = apiKey ? await fetchGameAnalysis(g.name, reviews, apiKey) : null;
    } catch (e) {
      console.error('AI分析失敗(appid=' + g.id + '): ' + e.message);
      g.analysis = null;
    }
  }

  var embeds = buildRecommendEmbeds(picked);
  await sendDiscordEmbeds(embeds, webhookUrl);
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

既存の`module.exports = { ... }`を以下に置き換える:

```js
module.exports = {
  pickRandomGames: pickRandomGames,
  parseGameAnalysis: parseGameAnalysis,
  buildRecommendEmbeds: buildRecommendEmbeds,
  fetchFeaturedPool: fetchFeaturedPool,
  fetchGameAnalysis: fetchGameAnalysis,
  sendDiscordEmbeds: sendDiscordEmbeds,
  main: main
};
```

- [ ] **Step 5: 既存のユニットテストが壊れていないことを確認する**

Run: `node --test scripts/recommend-games.test.js`
Expected: 13 tests, 13 pass, 0 fail

- [ ] **Step 6: `check-wishlist-prices.test.js`も壊れていないことを確認する**

Run: `node --test scripts/check-wishlist-prices.test.js`
Expected: 12 tests, 12 pass, 0 fail (このタスクは`check-wishlist-prices.js`のコードを変更しないため、requireされる側には影響が無いはずだが念のため確認する)

- [ ] **Step 7: 構文チェック**

Run: `node --check scripts/recommend-games.js`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add scripts/recommend-games.js
git commit -m "Add I/O layer and main orchestrator for daily game recommendation script"
```

---

### Task 5: GitHub Actionsワークフロー

**Files:**
- Create: `.github/workflows/daily-game-recommend.yml`

**Interfaces:**
- Consumes: `scripts/recommend-games.js`(Task 4で完成)、既存Secrets `DISCORD_WEBHOOK_URL`/`ONEMIN_API_KEY`
  (新規登録不要、既にリポジトリに設定済み)

- [ ] **Step 1: ワークフローファイルを作成する**

```yaml
name: Daily Game Recommendation

on:
  schedule:
    # 03:00 UTC = 12:00 JST。値下げ通知cron(00:00 UTC)とは別時刻にして、
    # 同じ1min.aiキーへの同時アクセスを避ける。
    - cron: '0 3 * * *'
  workflow_dispatch: {}

jobs:
  recommend:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run recommendation
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
          ONEMIN_API_KEY: ${{ secrets.ONEMIN_API_KEY }}
        run: node scripts/recommend-games.js
```

このワークフローは`price_history.json`のような永続化ファイルを持たないため、値下げ通知ワークフローと違い
`permissions: contents: write`もgit commit/pushステップも不要。

- [ ] **Step 2: ファイルが存在し読み込めることを確認する**

Run: `node -e "require('node:fs').readFileSync('.github/workflows/daily-game-recommend.yml','utf8')" && echo "file exists and is readable"`

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/daily-game-recommend.yml
git commit -m "Add GitHub Actions workflow for daily game recommendation"
```

---

### Task 6: push + 動作確認(ユーザー作業)

**Files:** なし(GitHub Web UI上の作業)

このタスクはコードを書かず、ユーザーが実施する。エージェントは指示文を提示し、ユーザーの完了報告を待つ。
新規Secretsの登録は不要(既存の`DISCORD_WEBHOOK_URL`・`ONEMIN_API_KEY`を再利用するため)。

- [ ] **Step 1: ここまでの全コミットをGitHubにpushする**

```bash
git push origin main
```

(ユーザーの端末での認証が必要な場合は、そちらで実行してもらう)

- [ ] **Step 2: ユーザーに手動実行を依頼する**

以下をユーザーに伝える:

> `https://github.com/asaruto1509/steam-ja-translate/actions/workflows/daily-game-recommend.yml` を開いて、
> (キャッシュ対策のため一度ページを強制リロードしてから)右側の「Run workflow」ボタンから手動実行してください。
> 数十秒〜数分で完了するので、ログを開いて「候補プール件数」「選出件数」が出ているか確認してください。
> 成功すればDiscordに5枚のゲームカード(画像・価格・AI判定付き)が届きます。

- [ ] **Step 3: ユーザーの実行結果を受けて、Discordの見た目を確認する**

ユーザーから届いたスクリーンショットまたは説明を確認し、以下を検証する:
- 5枚のembedがそれぞれ独立したカードとして表示されているか
- 各カードにストア画像(サムネイル)が表示されているか
- 価格・AI判定・良い点・懸念点が読みやすく表示されているか
- (AI分析が一部失敗していた場合)該当ゲームは価格のみのシンプルなカードとして表示され、
  メッセージ全体の送信は失敗していないか
