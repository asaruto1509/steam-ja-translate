# Web Dashboard Charts & Analysis Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the Steam Web Dashboard's single-game analysis page with three SVG charts (price history, category-star bar chart, review sentiment pie chart) and an AI-generated 5-game similar-titles comparison table.

**Architecture:** Two new standalone pure-function modules (`web/lib/charts.js` for SVG rendering, `web/lib/priceHistoryApi.js` for the IsThereAnyDeal price-history API client) plug into the existing `gameAnalysis.js` orchestration via the same dependency-injection pattern already used for Steam/AI calls. The AI analysis prompt gains one more requested field (`similarGames`); `gameAnalysis.js` resolves each suggested title against Steam in parallel, the same way it already resolves the primary game. `viewModel.js` shapes the new data for rendering; `analysisPage.js` calls the new chart functions and renders a comparison table.

**Tech Stack:** Node.js (CommonJS, ES5-style: `var`/`function`, no `let`/`const`/arrow functions in implementation files — test files use `const`/arrow callbacks per existing convention), `node:test` + `node:assert/strict`, hand-rolled inline SVG (no charting library, no client-side JS), the IsThereAnyDeal public API (read-only, keyed by `ITAD_API_KEY`).

**Spec:** `docs/superpowers/specs/2026-08-22-web-dashboard-charts-design.md`

## Global Constraints

- Implementation files use ES5-ish CommonJS style: `'use strict'`, `var`, `function` declarations — no `let`/`const`/arrow functions. Test files use `const`/arrow-function callbacks (existing convention).
- Test framework is exclusively `node:test` + `node:assert/strict`.
- Pure logic functions (chart rendering, history-entry parsing, view-model shaping) are TDD-tested. Thin I/O wrappers (network calls, `gameAnalysis.js`'s orchestration, `server.js` route handlers) are left untested, matching the existing pattern.
- `bot/**` is never modified — only `require()`'d read-only (this plan reuses `bot/lib/fetchWithTimeout.js` read-only, the same way `gameAnalysis.js` already reuses `bot/lib/steam.js`).
- No charting library and no client-side JavaScript for charts — every chart is a plain SVG string built server-side, matching the project's no-build-tooling, SSR-only design.
- IsThereAnyDeal calls use Steam's shop ID `61` and `country=jp` so prices come back as whole yen — verified live against the real API on 2026-08-22 (see spec for the exact captured response shapes).
- `ITAD_API_KEY` is a new environment variable, already present in `web/.env` locally and to be added to `/etc/web-dashboard.env` on the VM at deploy time. Missing key or failed lookup must degrade to an empty price-history array, never an error.
- Similar-game titles from the AI are capped at 5 even if the model returns more, because each one triggers additional real Steam API calls (unlike `pros`/`cons`, which are just displayed text with no extra cost).

---

## Task 1: `web/lib/charts.js` — SVG chart rendering

**Files:**
- Create: `web/lib/charts.js`
- Create: `web/lib/charts.test.js`

**Interfaces:**
- Consumes: `html.escapeHtml(str)` from `web/lib/html.js` (existing)
- Produces (consumed by Task 6's `analysisPage.js`):
  - `renderCategoryBarChart(categoryLines)` — `categoryLines` is `[{name, starCount}]` (`starCount` a number, ideally 0-5) → SVG string, or `''` for an empty/missing list
  - `renderReviewPieChart(positivePct)` — `positivePct` a number 0-100 → SVG string, or `''` if not a number
  - `renderPriceLineChart(pricePoints)` — `pricePoints` is `[{date, price}]` (`date` an ISO-ish string parseable by `new Date()`, `price` a number) → SVG string, or `''` for an empty/missing list. Sorts by date ascending internally regardless of input order (the IsThereAnyDeal API returns newest-first).

- [ ] **Step 1: Write the failing tests**

Create `web/lib/charts.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderCategoryBarChart, renderReviewPieChart, renderPriceLineChart } = require('./charts.js');

test('renderCategoryBarChart returns an empty string for an empty list', () => {
  assert.equal(renderCategoryBarChart([]), '');
});

test('renderCategoryBarChart draws a background bar and a filled bar per category', () => {
  const svg = renderCategoryBarChart([
    { name: 'ゲームプレイ', starCount: 4 },
    { name: 'ストーリー', starCount: 2 }
  ]);
  const rectCount = (svg.match(/<rect/g) || []).length;
  assert.equal(rectCount, 4);
  assert.match(svg, /ゲームプレイ/);
  assert.match(svg, /ストーリー/);
  assert.match(svg, /<svg/);
});

test('renderCategoryBarChart clamps out-of-range or missing starCount into 0-5', () => {
  const svg = renderCategoryBarChart([{ name: 'X', starCount: 99 }, { name: 'Y', starCount: null }]);
  assert.match(svg, />5\/5</);
  assert.match(svg, />0\/5</);
});

test('renderCategoryBarChart escapes category names', () => {
  const svg = renderCategoryBarChart([{ name: '<script>alert(1)</script>', starCount: 3 }]);
  assert.doesNotMatch(svg, /<script>alert\(1\)<\/script>/);
});

test('renderReviewPieChart returns an empty string when the percentage is not a number', () => {
  assert.equal(renderReviewPieChart(null), '');
  assert.equal(renderReviewPieChart(undefined), '');
  assert.equal(renderReviewPieChart(NaN), '');
});

test('renderReviewPieChart shows the rounded percentage label', () => {
  const svg = renderReviewPieChart(96.4);
  assert.match(svg, />96%</);
});

test('renderReviewPieChart clamps percentages above 100 or below 0', () => {
  assert.match(renderReviewPieChart(150), />100%</);
  assert.match(renderReviewPieChart(-10), />0%</);
});

test('renderPriceLineChart returns an empty string when there is no data', () => {
  assert.equal(renderPriceLineChart([]), '');
  assert.equal(renderPriceLineChart(null), '');
});

test('renderPriceLineChart draws a single point without a polyline when only one sample exists', () => {
  const svg = renderPriceLineChart([{ date: '2026-07-01T00:00:00+00:00', price: 1500 }]);
  assert.match(svg, /<circle/);
  assert.doesNotMatch(svg, /<polyline/);
});

test('renderPriceLineChart draws a polyline with one point per sample when there are multiple samples', () => {
  const svg = renderPriceLineChart([
    { date: '2026-05-01T00:00:00+00:00', price: 1000 },
    { date: '2026-06-01T00:00:00+00:00', price: 2000 },
    { date: '2026-07-01T00:00:00+00:00', price: 1500 }
  ]);
  const circleCount = (svg.match(/<circle/g) || []).length;
  assert.equal(circleCount, 3);
  assert.match(svg, /<polyline/);
});

test('renderPriceLineChart sorts points chronologically regardless of input order', () => {
  const svg = renderPriceLineChart([
    { date: '2026-07-01T00:00:00+00:00', price: 2000 },
    { date: '2026-05-01T00:00:00+00:00', price: 1000 }
  ]);
  const cxValues = [...svg.matchAll(/cx="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
  assert.equal(cxValues.length, 2);
  assert.ok(cxValues[0] < cxValues[1]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/charts.test.js`
Expected: FAIL — `Cannot find module './charts.js'`

- [ ] **Step 3: Implement `web/lib/charts.js`**

```js
'use strict';
var html = require('./html.js');

function renderCategoryBarChart(categoryLines) {
  if (!Array.isArray(categoryLines) || !categoryLines.length) return '';
  var rowHeight = 24;
  var maxBarWidth = 150;
  var labelWidth = 90;
  var width = labelWidth + maxBarWidth + 40;
  var height = categoryLines.length * rowHeight;
  var rows = categoryLines.map(function (c, i) {
    var raw = typeof c.starCount === 'number' ? c.starCount : 0;
    var n = Math.max(0, Math.min(5, raw));
    var barWidth = (n / 5) * maxBarWidth;
    var y = i * rowHeight;
    var name = html.escapeHtml(c.name);
    return '<text x="0" y="' + (y + rowHeight / 2 + 4) + '" font-size="12" fill="#c7d5e0">' + name + '</text>'
      + '<rect x="' + labelWidth + '" y="' + (y + 4) + '" width="' + maxBarWidth + '" height="' + (rowHeight - 8) + '" fill="#2a3f5a"></rect>'
      + '<rect x="' + labelWidth + '" y="' + (y + 4) + '" width="' + barWidth + '" height="' + (rowHeight - 8) + '" fill="#66c0f4"></rect>'
      + '<text x="' + (labelWidth + maxBarWidth + 8) + '" y="' + (y + rowHeight / 2 + 4) + '" font-size="12" fill="#c7d5e0">' + n + '/5</text>';
  }).join('');
  return '<svg class="category-bar-chart" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' + rows + '</svg>';
}

function renderReviewPieChart(positivePct) {
  if (typeof positivePct !== 'number' || isNaN(positivePct)) return '';
  var pct = Math.max(0, Math.min(100, positivePct));
  var radius = 40;
  var circumference = 2 * Math.PI * radius;
  var positiveLength = (pct / 100) * circumference;
  var negativeLength = circumference - positiveLength;
  var size = (radius + 10) * 2;
  var center = size / 2;
  return '<svg class="review-pie-chart" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">'
    + '<circle cx="' + center + '" cy="' + center + '" r="' + radius + '" fill="none" stroke="#e05252" stroke-width="16"></circle>'
    + '<circle cx="' + center + '" cy="' + center + '" r="' + radius + '" fill="none" stroke="#7fbb4a" stroke-width="16" '
    + 'stroke-dasharray="' + positiveLength + ' ' + negativeLength + '" transform="rotate(-90 ' + center + ' ' + center + ')"></circle>'
    + '<text x="' + center + '" y="' + (center + 5) + '" font-size="16" fill="#c7d5e0" text-anchor="middle">' + Math.round(pct) + '%</text>'
    + '</svg>';
}

function renderPriceLineChart(pricePoints) {
  if (!Array.isArray(pricePoints) || !pricePoints.length) return '';
  var points = pricePoints.slice().sort(function (a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  var width = 280;
  var height = 100;
  var padding = 20;
  var prices = points.map(function (p) { return p.price; });
  var minPrice = Math.min.apply(null, prices);
  var maxPrice = Math.max.apply(null, prices);
  var range = maxPrice - minPrice || 1;

  function xAt(i) {
    return points.length === 1 ? width / 2 : padding + (i / (points.length - 1)) * (width - padding * 2);
  }
  function yAt(price) {
    return height - padding - ((price - minPrice) / range) * (height - padding * 2);
  }

  var circles = points.map(function (p, i) {
    return '<circle cx="' + xAt(i) + '" cy="' + yAt(p.price) + '" r="3" fill="#66c0f4"></circle>';
  }).join('');

  var polyline = '';
  if (points.length > 1) {
    var coords = points.map(function (p, i) { return xAt(i) + ',' + yAt(p.price); }).join(' ');
    polyline = '<polyline points="' + coords + '" fill="none" stroke="#66c0f4" stroke-width="2"></polyline>';
  }

  return '<svg class="price-line-chart" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
    + polyline + circles + '</svg>';
}

module.exports = {
  renderCategoryBarChart: renderCategoryBarChart,
  renderReviewPieChart: renderReviewPieChart,
  renderPriceLineChart: renderPriceLineChart
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/charts.test.js`
Expected: PASS — all 11 tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/charts.js web/lib/charts.test.js
git commit -m "Add SVG chart rendering for category ratings, review sentiment, and price history"
```

---

## Task 2: `web/lib/priceHistoryApi.js` — IsThereAnyDeal price-history client

**Files:**
- Create: `web/lib/priceHistoryApi.js`
- Create: `web/lib/priceHistoryApi.test.js`

**Interfaces:**
- Consumes: `fetchWithTimeout(url)` from `bot/lib/fetchWithTimeout.js` (existing, read-only reuse)
- Produces (consumed by Task 4's `gameAnalysis.js`):
  - `fetchPriceHistory(appid, apiKey)` — async, returns `[{date, price}]` (newest-first input re-sorted is NOT done here — that happens in `charts.js`; this just parses the raw API shape). Returns `[]` on any failure, missing key, or no data — never throws.
  - `lookupGameId(appid, apiKey)` — async, returns the IsThereAnyDeal game UUID string or `null`
  - `parseHistoryEntries(entries)` — pure, `entries` is the raw array from the ITAD `games/history/v2` response → `[{date, price}]`, filtered to Steam-shop entries only

- [ ] **Step 1: Write the failing tests for the pure parsing function**

Create `web/lib/priceHistoryApi.test.js`. The fixture below is the *exact* response captured from a live `games/history/v2` call for Hollow Knight (Steam appid 367520) on 2026-08-22, verified during spec review:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHistoryEntries } = require('./priceHistoryApi.js');

const REAL_SAMPLE_RESPONSE = [
  { timestamp: '2026-07-09T19:28:10+02:00', shop: { id: 61, name: 'Steam' }, deal: { price: { amount: 1700, amountInt: 1700, currency: 'JPY' }, regular: { amount: 1700, amountInt: 1700, currency: 'JPY' }, cut: 0 } },
  { timestamp: '2026-06-25T19:39:18+02:00', shop: { id: 61, name: 'Steam' }, deal: { price: { amount: 850, amountInt: 850, currency: 'JPY' }, regular: { amount: 1700, amountInt: 1700, currency: 'JPY' }, cut: 50 } },
  { timestamp: '2026-05-20T17:29:34+02:00', shop: { id: 61, name: 'Steam' }, deal: { price: { amount: 1700, amountInt: 1700, currency: 'JPY' }, regular: { amount: 1700, amountInt: 1700, currency: 'JPY' }, cut: 0 } }
];

test('parseHistoryEntries maps the real ITAD response shape to {date, price}', () => {
  const result = parseHistoryEntries(REAL_SAMPLE_RESPONSE);
  assert.deepEqual(result, [
    { date: '2026-07-09T19:28:10+02:00', price: 1700 },
    { date: '2026-06-25T19:39:18+02:00', price: 850 },
    { date: '2026-05-20T17:29:34+02:00', price: 1700 }
  ]);
});

test('parseHistoryEntries filters out entries from shops other than Steam (id 61)', () => {
  const mixed = REAL_SAMPLE_RESPONSE.concat([
    { timestamp: '2026-07-10T00:00:00+02:00', shop: { id: 35, name: 'GOG' }, deal: { price: { amount: 1600, amountInt: 1600, currency: 'JPY' }, regular: { amount: 1700, amountInt: 1700, currency: 'JPY' }, cut: 6 } }
  ]);
  const result = parseHistoryEntries(mixed);
  assert.equal(result.length, 3);
  assert.ok(result.every((r) => r.price !== 1600));
});

test('parseHistoryEntries skips malformed entries missing a price', () => {
  const malformed = [{ timestamp: '2026-07-09T19:28:10+02:00', shop: { id: 61, name: 'Steam' }, deal: {} }];
  assert.deepEqual(parseHistoryEntries(malformed), []);
});

test('parseHistoryEntries returns an empty array for non-array input', () => {
  assert.deepEqual(parseHistoryEntries(null), []);
  assert.deepEqual(parseHistoryEntries(undefined), []);
  assert.deepEqual(parseHistoryEntries('not an array'), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/priceHistoryApi.test.js`
Expected: FAIL — `Cannot find module './priceHistoryApi.js'`

- [ ] **Step 3: Implement `web/lib/priceHistoryApi.js`**

```js
'use strict';
var fetchWithTimeout = require('../../bot/lib/fetchWithTimeout.js').fetchWithTimeout;

var STEAM_SHOP_ID = 61;

function parseHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(function (e) {
      return e && e.shop && e.shop.id === STEAM_SHOP_ID && e.deal && e.deal.price && typeof e.deal.price.amount === 'number';
    })
    .map(function (e) {
      return { date: e.timestamp, price: e.deal.price.amount };
    });
}

async function lookupGameId(appid, apiKey) {
  var r = await fetchWithTimeout('https://api.isthereanydeal.com/games/lookup/v1?key=' + encodeURIComponent(apiKey) + '&appid=' + appid);
  if (!r.ok) return null;
  var d = await r.json();
  return (d && d.found && d.game && d.game.id) ? d.game.id : null;
}

async function fetchPriceHistory(appid, apiKey) {
  if (!apiKey) return [];
  var gameId = await lookupGameId(appid, apiKey);
  if (!gameId) return [];
  var r = await fetchWithTimeout('https://api.isthereanydeal.com/games/history/v2?key=' + encodeURIComponent(apiKey) + '&id=' + gameId + '&country=jp&shops=' + STEAM_SHOP_ID);
  if (!r.ok) return [];
  var entries = await r.json();
  return parseHistoryEntries(entries);
}

module.exports = {
  parseHistoryEntries: parseHistoryEntries,
  lookupGameId: lookupGameId,
  fetchPriceHistory: fetchPriceHistory
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/priceHistoryApi.test.js`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Manually verify against the real API**

`web/.env` already has a working `ITAD_API_KEY`. Confirm the live client works end to end:

```bash
cd web
node -e "
require('dotenv').config();
" 2>/dev/null || true
```

There is no `dotenv` dependency in this project, so load the env file manually and run a one-off script:

```bash
cd web
set -a && source .env && set +a
node -e "
var api = require('./lib/priceHistoryApi.js');
api.fetchPriceHistory('367520', process.env.ITAD_API_KEY).then(function (r) {
  console.log(JSON.stringify(r));
});
"
```

Expected: a JSON array of `{date, price}` objects (matching the shape the tests assert), not an empty array — confirming the real network path works, not just the pure parser.

- [ ] **Step 6: Commit**

```bash
git add web/lib/priceHistoryApi.js web/lib/priceHistoryApi.test.js
git commit -m "Add IsThereAnyDeal price-history API client"
```

---

## Task 3: `web/lib/analysisPrompt.js` — request similar game titles

**Files:**
- Modify: `web/lib/analysisPrompt.js`
- Modify: `web/lib/analysisPrompt.test.js`

**Interfaces:**
- Produces: the AI's JSON response now includes `"similarGames": [...]` (an array of up to 5 title strings) — consumed by Task 4's `gameAnalysis.js`, which reads `analysis.similarGames`

- [ ] **Step 1: Write the failing test**

In `web/lib/analysisPrompt.test.js`, add (after the existing `'buildAnalysisPrompt requests the full JSON schema'` test):

```js
test('buildAnalysisPrompt requests similar game titles', () => {
  const prompt = buildAnalysisPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.match(prompt, /"similarGames"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/analysisPrompt.test.js`
Expected: FAIL — `similarGames` is not in the prompt yet

- [ ] **Step 3: Implement the change**

In `web/lib/analysisPrompt.js`, inside `buildAnalysisPrompt`, change:

```js
    + '"audienceFor":["こんな人向け、を最大3つ"],'
    + '"audienceAgainst":["向いていない人、を最大3つ"]}\n\n'
```

to:

```js
    + '"audienceFor":["こんな人向け、を最大3つ"],'
    + '"audienceAgainst":["向いていない人、を最大3つ"],'
    + '"similarGames":["似ている実在のSteamゲームのタイトルを最大5つ"]}\n\n'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/analysisPrompt.test.js`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/analysisPrompt.js web/lib/analysisPrompt.test.js
git commit -m "Request similar game titles in the analysis AI prompt"
```

---

## Task 4: `web/lib/gameAnalysis.js` — resolve similar games and price history

**Files:**
- Modify: `web/lib/gameAnalysis.js`

**Interfaces:**
- Consumes: `deps.fetchPriceHistory(appid, apiKey)` (Task 2), `deps.itadApiKey` (a new dep, wired in Task 7's `server.js`), `analysis.similarGames` (Task 3's new prompt field), `deps.searchGame`/`deps.fetchPriceDetail`/`deps.fetchReviewSummary`/`deps.fetchPlayerCount` (existing, from `bot/lib/steam.js`)
- Produces (consumed by Task 5's `viewModel.js`): the result object now also has `priceHistory` (`[{date, price}]`, always an array) and `similarGamesData` (`[{name, appid, priceDetail, reviewSummary, playerCount}]`, always an array, entries with a failed Steam lookup are dropped rather than included with nulls)

This task has no new automated tests, matching this codebase's existing convention that `gameAnalysis.js`'s I/O orchestration is untested (only the pure functions it calls are tested).

- [ ] **Step 1: Add the similar-games resolver and price-history call**

Replace the full contents of `web/lib/gameAnalysis.js` with:

```js
'use strict';

var NO_REVIEWS = { positive: [], negative: [] };
var MAX_SIMILAR_GAMES = 5;

async function safe(promiseFn, fallback) {
  try {
    return await promiseFn();
  } catch (e) {
    return fallback;
  }
}

function hasReviews(reviews) {
  return !!(reviews && ((reviews.positive && reviews.positive.length) || (reviews.negative && reviews.negative.length)));
}

async function fetchAnalysis(deps, found, gameContext, reviews, extra) {
  if (!deps.apiKey || !hasReviews(reviews)) return null;
  return safe(function () {
    var prompt = deps.buildAnalysisPrompt(found.name, reviews, gameContext, extra);
    return deps.fetchChatReply(prompt, deps.apiKey, { webSearch: false }).then(function (raw) {
      return deps.parseAnalysis(raw);
    });
  }, null);
}

async function fetchSimilarGameData(name, deps) {
  var found = await safe(function () { return deps.searchGame(name); }, null);
  if (!found) return null;
  var results = await Promise.all([
    safe(function () { return deps.fetchPriceDetail(found.id); }, null),
    safe(function () { return deps.fetchReviewSummary(found.id); }, null),
    safe(function () { return deps.fetchPlayerCount(found.id); }, null)
  ]);
  return { name: found.name, appid: found.id, priceDetail: results[0], reviewSummary: results[1], playerCount: results[2] };
}

async function fetchSimilarGamesData(names, deps) {
  if (!Array.isArray(names) || !names.length) return [];
  var settled = await Promise.all(
    names.slice(0, MAX_SIMILAR_GAMES).map(function (name) { return fetchSimilarGameData(name, deps); })
  );
  return settled.filter(function (g) { return g !== null; });
}

async function fetchGameAnalysis(name, deps) {
  var found = await deps.searchGame(name);
  if (!found) {
    return {
      found: null, priceDetail: null, reviewSummary: null, gameContext: null,
      playerCount: null, achievementStats: null, priceHistory: [], similarGamesData: [], analysis: null
    };
  }

  var results = await Promise.all([
    safe(function () { return deps.fetchPriceDetail(found.id); }, null),
    safe(function () { return deps.fetchReviewSummary(found.id); }, null),
    safe(function () { return deps.fetchGameContext(found.id); }, null),
    safe(function () { return deps.fetchPlayerCount(found.id); }, null),
    safe(function () { return deps.fetchAchievementStats(found.id); }, null),
    deps.apiKey ? safe(function () { return deps.fetchOpposingReviews(found.id, 10); }, NO_REVIEWS) : Promise.resolve(NO_REVIEWS),
    deps.itadApiKey ? safe(function () { return deps.fetchPriceHistory(found.id, deps.itadApiKey); }, []) : Promise.resolve([])
  ]);
  var priceDetail = results[0];
  var reviewSummary = results[1];
  var gameContext = results[2];
  var playerCount = results[3];
  var achievementStats = results[4];
  var reviews = results[5];
  var priceHistory = results[6];

  var analysis = await fetchAnalysis(deps, found, gameContext, reviews, { playerCount: playerCount, achievementStats: achievementStats });
  var similarGamesData = analysis ? await fetchSimilarGamesData(analysis.similarGames, deps) : [];

  return {
    found: found, priceDetail: priceDetail, reviewSummary: reviewSummary, gameContext: gameContext,
    playerCount: playerCount, achievementStats: achievementStats, priceHistory: priceHistory,
    similarGamesData: similarGamesData, analysis: analysis
  };
}

module.exports = { fetchGameAnalysis: fetchGameAnalysis };
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `cd web && node --test`
Expected: PASS — all existing tests still green (this file has no dedicated tests, but confirm no other test imports/mocks its old shape in a way that now breaks)

- [ ] **Step 3: Commit**

```bash
git add web/lib/gameAnalysis.js
git commit -m "Resolve similar games and fetch price history in the analysis pipeline"
```

---

## Task 5: `web/lib/viewModel.js` — shape chart and comparison data

**Files:**
- Modify: `web/lib/viewModel.js`
- Modify: `web/lib/viewModel.test.js`

**Interfaces:**
- Consumes: `result.priceHistory`, `result.similarGamesData` (Task 4)
- Produces (consumed by Task 6's `analysisPage.js`):
  - `vm.analysis.categoryLines` items now also carry `starCount` (a number 0-5) alongside the existing `stars` (★ string)
  - `vm.priceHistoryPoints` — `[{date, price}]`, always an array
  - `vm.reviewPositivePct` — number 0-100, or `null` when there's no review summary
  - `vm.similarGames` — `[{name, appid, priceHtml, reviewSummaryText, playerCountText}]`, always an array

- [ ] **Step 1: Write the failing tests**

In `web/lib/viewModel.test.js`:

First, update the existing test `'buildAnalysisViewModel converts analysis categories into star strings'` — change its assertion from:

```js
  assert.deepEqual(vm.analysis.categoryLines, [{ name: 'ゲームプレイ', stars: '★★★★☆' }]);
```

to:

```js
  assert.deepEqual(vm.analysis.categoryLines, [{ name: 'ゲームプレイ', stars: '★★★★☆', starCount: 4 }]);
```

Then add these new tests (anywhere after the existing tests):

```js
test('buildAnalysisViewModel passes through price history points', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    priceHistory: [{ date: '2026-07-01T00:00:00+00:00', price: 1500 }]
  });
  assert.deepEqual(vm.priceHistoryPoints, [{ date: '2026-07-01T00:00:00+00:00', price: 1500 }]);
});

test('buildAnalysisViewModel defaults priceHistoryPoints to an empty array when missing', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null
  });
  assert.deepEqual(vm.priceHistoryPoints, []);
});

test('buildAnalysisViewModel exposes the raw review positive percentage', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: { positivePct: 87, totalReviews: 500 }, gameContext: null, analysis: null
  });
  assert.equal(vm.reviewPositivePct, 87);
});

test('buildAnalysisViewModel leaves reviewPositivePct null when there is no review summary', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null
  });
  assert.equal(vm.reviewPositivePct, null);
});

test('buildAnalysisViewModel formats similar games with price, review, and player count text', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    similarGamesData: [{
      name: 'Similar Game', appid: '999',
      priceDetail: { finalPrice: 500, originalPrice: 1000, discountPercent: 50 },
      reviewSummary: { positivePct: 90, totalReviews: 200 },
      playerCount: 42
    }]
  });
  assert.deepEqual(vm.similarGames, [{
    name: 'Similar Game', appid: '999',
    priceHtml: '<span class="orig">¥1,000</span> → <strong>¥500</strong> (-50%)',
    reviewSummaryText: '90% (200件)',
    playerCountText: '42人'
  }]);
});

test('buildAnalysisViewModel defaults similarGames to an empty array when missing', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null
  });
  assert.deepEqual(vm.similarGames, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/viewModel.test.js`
Expected: FAIL — the updated categoryLines assertion fails (no `starCount`), and the new fields don't exist yet

- [ ] **Step 3: Implement the change**

In `web/lib/viewModel.js`, add a new helper function (near `formatAchievementStats`):

```js
function formatSimilarGames(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (g) {
    return {
      name: g.name,
      appid: g.appid,
      priceHtml: formatPriceHtml(g.priceDetail),
      reviewSummaryText: g.reviewSummary
        ? g.reviewSummary.positivePct + '% (' + g.reviewSummary.totalReviews.toLocaleString() + '件)'
        : 'レビュー情報なし',
      playerCountText: formatPlayerCount(g.playerCount)
    };
  });
}
```

In `buildAnalysisViewModel`'s `vm` object literal, add three fields (alongside `playerCountText`/`achievementInfo`/`isFavorite`):

```js
    priceHistoryPoints: Array.isArray(result.priceHistory) ? result.priceHistory : [],
    reviewPositivePct: result.reviewSummary ? result.reviewSummary.positivePct : null,
    similarGames: formatSimilarGames(result.similarGamesData),
```

In the `categoryLines` map inside the `if (result.analysis)` block, add `starCount`:

```js
      categoryLines: (Array.isArray(a.categories) ? a.categories : [])
        .filter(function (c) { return c && typeof c.stars === 'number'; })
        .map(function (c) { return { name: c.name, stars: starsLine(c.stars), starCount: c.stars }; }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/viewModel.test.js`
Expected: PASS — all 19 tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/viewModel.js web/lib/viewModel.test.js
git commit -m "Shape price history, review percentage, and similar-games data in the view model"
```

---

## Task 6: `web/views/analysisPage.js` + `web/views/layout.js` — render the charts and comparison table

**Files:**
- Modify: `web/views/analysisPage.js`
- Modify: `web/views/analysisPage.test.js`
- Modify: `web/views/layout.js`
- Modify: `web/views/layout.test.js`

**Interfaces:**
- Consumes: `charts.renderCategoryBarChart`/`renderReviewPieChart`/`renderPriceLineChart` (Task 1), `vm.priceHistoryPoints`/`vm.reviewPositivePct`/`vm.similarGames`/`vm.analysis.categoryLines[].starCount` (Task 5)

- [ ] **Step 1: Write the failing tests**

In `web/views/analysisPage.test.js`, add (before the final `'escapes the game name'` test):

```js
test('renders a review pie chart when reviewPositivePct is a number', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: 90, similarGames: []
  });
  assert.match(result, /class="review-pie-chart"/);
});

test('omits the review pie chart when reviewPositivePct is not a number', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null, similarGames: []
  });
  assert.doesNotMatch(result, /class="review-pie-chart"/);
});

test('renders a category bar chart instead of a plain list when categories are present', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [],
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null, similarGames: [],
    analysis: {
      verdict: '買い', reason: '', categoryLines: [{ name: 'ゲームプレイ', stars: '★★★★☆', starCount: 4 }],
      pros: [], cons: [], audienceFor: [], audienceAgainst: []
    }
  });
  assert.match(result, /class="category-bar-chart"/);
  assert.doesNotMatch(result, /class="category-stars"/);
});

test('renders a price history chart when price history points exist', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [{ date: '2026-07-01T00:00:00+00:00', price: 1500 }],
    reviewPositivePct: null, similarGames: []
  });
  assert.match(result, /class="price-history"/);
  assert.match(result, /class="price-line-chart"/);
});

test('omits the price history section when there are no price history points', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null, similarGames: []
  });
  assert.doesNotMatch(result, /class="price-history"/);
});

test('renders a similar games comparison table with escaped, linked names', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null,
    similarGames: [{
      name: '<script>alert(1)</script>', appid: '2',
      priceHtml: '¥500', reviewSummaryText: '90% (100件)', playerCountText: '10人'
    }]
  });
  assert.match(result, /class="similar-games"/);
  assert.match(result, /href="\/analyze\?name=%3Cscript%3Ealert\(1\)%3C%2Fscript%3E"/);
  assert.doesNotMatch(result, /<script>alert\(1\)<\/script>/);
  assert.match(result, /90% \(100件\)/);
});

test('omits the similar games section when there are none', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null, similarGames: []
  });
  assert.doesNotMatch(result, /class="similar-games"/);
});
```

In `web/views/layout.test.js`, add:

```js
test('renderLayout includes styling for the new chart and comparison-table elements', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.similar-games/);
  assert.match(page, /table\{/);
  assert.match(page, /th,td\{/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test views/analysisPage.test.js views/layout.test.js`
Expected: FAIL — none of the new markup or CSS exists yet

- [ ] **Step 3: Implement the changes**

In `web/views/analysisPage.js`, add the require at the top:

```js
var charts = require('../lib/charts.js');
```

Replace:

```js
  parts.push('<p class="reviews">💬 ' + html.escapeHtml(vm.reviewSummaryText) + '</p>');
```

with:

```js
  parts.push('<p class="reviews">💬 ' + html.escapeHtml(vm.reviewSummaryText) + '</p>');
  if (typeof vm.reviewPositivePct === 'number') {
    parts.push('<div class="review-chart">' + charts.renderReviewPieChart(vm.reviewPositivePct) + '</div>');
  }
```

Replace the achievements block's closing and the start of the `if (vm.analysis)` block — i.e. right after:

```js
    parts.push('<p class="achievements">' + achievementLine + '</p>');
  }
```

insert a new price-history block:

```js
    parts.push('<p class="achievements">' + achievementLine + '</p>');
  }

  if (vm.priceHistoryPoints && vm.priceHistoryPoints.length) {
    parts.push('<section class="price-history"><h3>価格推移</h3>' + charts.renderPriceLineChart(vm.priceHistoryPoints) + '</section>');
  }
```

Replace the category-stars list:

```js
    if (a.categoryLines.length) {
      parts.push('<ul class="category-stars">' + a.categoryLines.map(function (c) {
        return '<li>' + html.escapeHtml(c.name) + ' ' + c.stars + '</li>';
      }).join('') + '</ul>');
    }
```

with:

```js
    if (a.categoryLines.length) {
      parts.push('<div class="category-bar-chart-wrap">' + charts.renderCategoryBarChart(a.categoryLines) + '</div>');
    }
```

Finally, right after the `if (vm.analysis) { ... } else { ... }` block closes and before `parts.push('</article>');`, insert the similar-games table:

```js
  if (vm.similarGames && vm.similarGames.length) {
    parts.push('<section class="similar-games"><h3>類似ゲーム比較</h3><table><thead><tr><th>ゲーム</th><th>価格</th><th>評価</th><th>プレイヤー数</th></tr></thead><tbody>'
      + vm.similarGames.map(function (g) {
        return '<tr><td><a href="/analyze?name=' + encodeURIComponent(g.name) + '">' + html.escapeHtml(g.name) + '</a></td>'
          + '<td>' + g.priceHtml + '</td>'
          + '<td>' + html.escapeHtml(g.reviewSummaryText) + '</td>'
          + '<td>' + html.escapeHtml(g.playerCountText || '不明') + '</td></tr>';
      }).join('')
      + '</tbody></table></section>');
  }

  parts.push('</article>');
```

(This replaces the previous bare `parts.push('</article>');` — the new block ends with that same line, just with the similar-games section pushed immediately before it.)

In `web/views/layout.js`, add to the CSS string (near the other section rules like `.analysis{margin-top:16px}`):

```js
    + '.price-history,.similar-games{margin-top:16px}'
    + '.category-bar-chart,.review-pie-chart,.price-line-chart{max-width:100%;height:auto}'
    + 'table{width:100%;border-collapse:collapse;font-size:14px;margin-top:8px}'
    + 'th,td{padding:4px 8px;text-align:left;border-bottom:1px solid #2a3f5a}'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test`
Expected: PASS — all tests green (this touches shared view files, so run the full suite, not just the two test files)

- [ ] **Step 5: Commit**

```bash
git add web/views/analysisPage.js web/views/analysisPage.test.js web/views/layout.js web/views/layout.test.js
git commit -m "Render price history, review sentiment, category bar charts, and similar-games table"
```

---

## Task 7: `web/server.js` — wire the new dependencies

**Files:**
- Modify: `web/server.js`

**Interfaces:**
- Consumes: `priceHistoryApi.fetchPriceHistory` (Task 2), `process.env.ITAD_API_KEY` (new env var, already set in `web/.env` locally)

This task has no new automated tests, matching this codebase's existing convention for route handlers. Verification is manual, at the end of the task — and this time, since `web/.env` already has a real `ONEMIN_API_KEY` and `ITAD_API_KEY`, the full AI-analysis and price-history paths can both be exercised locally (unlike some earlier tasks in this project's history where the AI path was untestable locally).

- [ ] **Step 1: Add the require and wire the new deps**

In `web/server.js`, add to the requires:

```js
var priceHistoryApi = require('./lib/priceHistoryApi.js');
```

In the `app.get('/analyze', ...)` handler, add two fields to the existing `deps` object literal (alongside `fetchOpposingReviews`/`fetchChatReply`):

```js
      fetchPriceHistory: priceHistoryApi.fetchPriceHistory,
      itadApiKey: process.env.ITAD_API_KEY,
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `cd web && node --test`
Expected: PASS — all tests green

- [ ] **Step 3: Manual end-to-end verification with real data**

```bash
cd web
set -a && source .env && set +a
PORT=3103 node server.js &
sleep 1
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" "http://127.0.0.1:3103/analyze?name=Hollow%20Knight" -o /tmp/charts-e2e.html
grep -o 'class="price-line-chart"' /tmp/charts-e2e.html
grep -o 'class="review-pie-chart"' /tmp/charts-e2e.html
grep -o 'class="category-bar-chart"' /tmp/charts-e2e.html
grep -o 'class="similar-games"' /tmp/charts-e2e.html
```

Expected: `price-line-chart` and `review-pie-chart` classes are present (Hollow Knight has real Steam review data and, per this plan's own spec verification, real IsThereAnyDeal price history). `category-bar-chart` and `similar-games` depend on the AI call succeeding — since `ONEMIN_API_KEY` is configured, they should appear too, but if the AI call times out or the model's response doesn't include a usable `similarGames`/`categories` list, their absence is not this task's bug (it's the existing, pre-existing AI-reliability behavior this plan doesn't change). Report what actually came back either way.

Stop the background server process afterward. This test run does not create any new files under `web/data/` (history/favorites), but if you want to avoid polluting your real local history, you can delete `web/data/dashboard-data.json` afterward if one didn't already exist before this step.

- [ ] **Step 4: Commit**

```bash
git add web/server.js
git commit -m "Wire the IsThereAnyDeal price-history client into the analyze route"
```

---

## Self-Review Notes

- **Spec coverage:** price history graph (Tasks 2, 4, 5, 6, 7), category bar chart (Tasks 1, 5, 6), review pie chart (Tasks 1, 5, 6), similar-games comparison table (Tasks 3, 4, 5, 6). All four spec features have a task chain from data to rendering.
- **Type consistency:** `priceHistoryApi.fetchPriceHistory(appid, apiKey)` (Task 2) is called identically in `gameAnalysis.js` (Task 4) and wired from `server.js` (Task 7) as `priceHistoryApi.fetchPriceHistory`. `result.priceHistory`/`result.similarGamesData` (Task 4's output) match exactly what `viewModel.js` (Task 5) reads. `vm.priceHistoryPoints`/`vm.reviewPositivePct`/`vm.similarGames`/`categoryLines[].starCount` (Task 5's output) match exactly what `analysisPage.js` (Task 6) reads, and the `charts.js` (Task 1) function signatures (`renderCategoryBarChart(categoryLines)` expecting `.starCount`, `renderReviewPieChart(positivePct)`, `renderPriceLineChart(pricePoints)` expecting `{date, price}`) match how Task 6 calls them.
- **No placeholders:** every step has complete, runnable code; the one deliberately-verified-live piece (the IsThereAnyDeal response shape) is backed by an actual captured sample used as the test fixture in Task 2, not a guess.
- **Consistency with prior work in this codebase:** this plan repeats the pure/I/O split, the `safe()` fallback pattern, and the DI-via-`deps` pattern established by `gameAnalysis.js`/`viewModel.js`/`analysisPage.js` in earlier plans, and — learning from the previous plan's final-review finding — includes CSS for every new UI element in the same task that introduces the markup, rather than leaving it for a later fix wave.
