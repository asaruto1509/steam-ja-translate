# Game Roulette Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two independent web dashboard pages — a "backlog roulette" (picks from the user's owned-but-barely-played Steam games) and a "recommend roulette" (picks from the same featured/new-release pool `/recommend` uses) — each showing the pick via a slot-machine-style spinning animation.

**Architecture:** Two new pure-logic modules (`web/lib/roulette.js` for winner selection, `web/lib/backlogPool.js` for the owned-games data source), one new shared view (`web/views/roulettePage.js`) rendered by two new `GET` routes, and two new `POST /api/roulette/<mode>/spin` JSON routes in `web/server.js` that decide the winner server-side and hand the client only a candidate list + winning index. A new client-side vanilla-JS block in `web/views/layout.js` (same fetch-based, no-build-tooling style as the existing chat feature) drives the reel animation. The recommend mode reuses `scripts/recommend-games.js`'s `fetchFeaturedPool`/`pickRandomGames` and `bot/lib/gamePool.js`'s `pickRealGames` read-only, exactly like the existing `/recommend` Discord command does.

**Tech Stack:** Node.js (CommonJS, ES5-style: `var`/`function`, no `let`/`const`/arrow functions in implementation files — test files use `const`/arrow callbacks per existing convention), `node:test` + `node:assert/strict`, vanilla browser JS with `fetch` and CSS transitions (no framework, no build step, no canvas/SVG).

**Spec:** `docs/superpowers/specs/2026-08-22-game-roulette-design.md`

## Global Constraints

- Implementation files use ES5-ish CommonJS style: `'use strict'`, `var`, `function` declarations — no `let`/`const`/arrow functions. This applies to browser-side JS embedded in `layout.js` too. Test files use `const`/arrow-function callbacks.
- Test framework is exclusively `node:test` + `node:assert/strict`.
- Pure logic functions (`roulette.pickWinner`, `roulette.buildSpinPayload`, `backlogPool.filterBacklog`, `roulettePage.renderRoulettePage`) are TDD-tested. Thin I/O wrappers (`backlogPool.fetchOwnedGames`, `server.js` route handlers) are left untested, matching the existing pattern.
- `bot/**` and `scripts/**` are never modified. Only read: `scripts/recommend-games.js`'s `fetchFeaturedPool`/`pickRandomGames`, `bot/lib/gamePool.js`'s `pickRealGames`, `bot/lib/steam.js`'s `isRealGame`/`fetchReviewTexts`/`headerImageUrl` (all already required elsewhere in `web/server.js` or newly required read-only here).
- The winner is always decided server-side (`roulette.pickWinner`, injectable RNG defaulting to `Math.random`, same pattern as `scripts/recommend-games.js`'s `pickRandomGames`). The client never generates randomness — it only animates a server-provided `{candidates, winnerIndex}` payload.
- Backlog threshold is a fixed constant: `playtime_forever < 120` minutes (2 hours). Not user-configurable.
- Two fully separate pages (`/roulette/backlog`, `/roulette/recommend`), not a tab-switcher. They share the same view-rendering function and client-side animation code.
- Requires a new environment variable, `STEAM_API_KEY` (a plain Steam Web API key from https://steamcommunity.com/dev/apikey — different from the existing `STEAM_ID64`). Task 4 adds the empty placeholder to `bot/.env.example` and `web/.env`; the actual value must be filled in locally by the user, and separately added to the VM's `/etc/web-dashboard.env` at deploy time (that file lives outside the repo, matching the existing `EnvironmentFile` setup in `web/web-dashboard.service`).
- No feature lives in the Discord bot in this plan — web dashboard only.

---

## Task 1: `web/lib/roulette.js` — winner selection and payload shaping

**Files:**
- Create: `web/lib/roulette.js`
- Create: `web/lib/roulette.test.js`

**Interfaces:**
- Consumes: nothing from other new files.
- Produces (consumed by Task 4's `server.js`):
  - `pickWinner(candidates, rng)` — pure. `candidates` is any array-like value (only `.length` is read). `rng` optionally overrides `Math.random` (same injection pattern as `scripts/recommend-games.js`'s `pickRandomGames`). Returns an integer index in `[0, candidates.length)`.
  - `buildSpinPayload(candidates, winnerIndex)` — pure. `candidates` is `[{id, name, imageUrl, ...anythingElse}]`. Returns `{ candidates: [{id, name, imageUrl}], winnerIndex }` — strips any extra fields (e.g. `playtimeMinutes`) so they never reach the client.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/roulette.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickWinner, buildSpinPayload } = require('./roulette.js');

test('pickWinner returns an index within range using the injected rng', () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const idx = pickWinner(candidates, () => 0.5);
  assert.equal(idx, 1);
});

test('pickWinner returns 0 when rng returns 0', () => {
  const candidates = [{ id: '1' }, { id: '2' }];
  assert.equal(pickWinner(candidates, () => 0), 0);
});

test('pickWinner returns the last index when rng returns just under 1', () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }];
  assert.equal(pickWinner(candidates, () => 0.999), 2);
});

test('pickWinner defaults to Math.random when no rng is given', () => {
  const candidates = [{ id: '1' }];
  assert.equal(pickWinner(candidates), 0);
});

test('buildSpinPayload strips extra fields and keeps id/name/imageUrl', () => {
  const candidates = [
    { id: '1', name: 'A', imageUrl: 'http://x/1.jpg', playtimeMinutes: 0 },
    { id: '2', name: 'B', imageUrl: 'http://x/2.jpg', playtimeMinutes: 10 }
  ];
  const payload = buildSpinPayload(candidates, 1);
  assert.deepEqual(payload, {
    candidates: [
      { id: '1', name: 'A', imageUrl: 'http://x/1.jpg' },
      { id: '2', name: 'B', imageUrl: 'http://x/2.jpg' }
    ],
    winnerIndex: 1
  });
});

test('buildSpinPayload works with a winnerIndex of 0', () => {
  const candidates = [{ id: '1', name: 'A', imageUrl: 'u' }];
  assert.deepEqual(buildSpinPayload(candidates, 0), {
    candidates: [{ id: '1', name: 'A', imageUrl: 'u' }],
    winnerIndex: 0
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/roulette.test.js`
Expected: FAIL — `Cannot find module './roulette.js'`

- [ ] **Step 3: Implement `web/lib/roulette.js`**

```js
'use strict';

function pickWinner(candidates, rng) {
  rng = rng || Math.random;
  return Math.floor(rng() * candidates.length);
}

function buildSpinPayload(candidates, winnerIndex) {
  return {
    candidates: candidates.map(function (c) {
      return { id: c.id, name: c.name, imageUrl: c.imageUrl };
    }),
    winnerIndex: winnerIndex
  };
}

module.exports = {
  pickWinner: pickWinner,
  buildSpinPayload: buildSpinPayload
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/roulette.test.js`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/roulette.js web/lib/roulette.test.js
git commit -m "Add roulette winner-selection and payload-shaping logic"
```

---

## Task 2: `web/lib/backlogPool.js` — owned-games data source

**Files:**
- Create: `web/lib/backlogPool.js`
- Create: `web/lib/backlogPool.test.js`

**Interfaces:**
- Consumes: `fetchWithTimeout` from `../../bot/lib/fetchWithTimeout.js` (existing).
- Produces (consumed by Task 4's `server.js`):
  - `fetchOwnedGames(steamId64, apiKey)` — async I/O. Calls Steam's `IPlayerService/GetOwnedGames/v1` endpoint. Returns `[{id, name, imageUrl, playtimeMinutes}]`. Returns `[]` if `apiKey` is falsy, the request fails, or the profile has no visible games (private profile).
  - `filterBacklog(games, maxMinutes)` — pure. Returns only the entries with `playtimeMinutes < maxMinutes`.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/backlogPool.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterBacklog } = require('./backlogPool.js');

test('filterBacklog keeps only games under the playtime threshold', () => {
  const games = [
    { id: '1', playtimeMinutes: 0 },
    { id: '2', playtimeMinutes: 119 },
    { id: '3', playtimeMinutes: 120 },
    { id: '4', playtimeMinutes: 500 }
  ];
  const result = filterBacklog(games, 120);
  assert.deepEqual(result.map((g) => g.id), ['1', '2']);
});

test('filterBacklog returns an empty array when nothing qualifies', () => {
  const games = [{ id: '1', playtimeMinutes: 200 }];
  assert.deepEqual(filterBacklog(games, 120), []);
});

test('filterBacklog returns an empty array for an empty input', () => {
  assert.deepEqual(filterBacklog([], 120), []);
});

test('filterBacklog does not mutate the input array', () => {
  const games = [{ id: '1', playtimeMinutes: 0 }];
  filterBacklog(games, 120);
  assert.equal(games.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/backlogPool.test.js`
Expected: FAIL — `Cannot find module './backlogPool.js'`

- [ ] **Step 3: Implement `web/lib/backlogPool.js`**

```js
'use strict';
var fetchWithTimeout = require('../../bot/lib/fetchWithTimeout.js').fetchWithTimeout;

function headerImageUrl(appid) {
  return 'https://cdn.akamai.steamstatic.com/steam/apps/' + appid + '/header.jpg';
}

async function fetchOwnedGames(steamId64, apiKey) {
  if (!apiKey) return [];
  var url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=' + encodeURIComponent(apiKey)
    + '&steamid=' + encodeURIComponent(steamId64) + '&include_appinfo=1&include_played_free_games=1';
  var r = await fetchWithTimeout(url);
  if (!r.ok) return [];
  var d = await r.json();
  var games = (d.response && d.response.games) || [];
  return games.map(function (g) {
    return {
      id: String(g.appid),
      name: g.name,
      imageUrl: headerImageUrl(g.appid),
      playtimeMinutes: g.playtime_forever || 0
    };
  });
}

function filterBacklog(games, maxMinutes) {
  return games.filter(function (g) { return g.playtimeMinutes < maxMinutes; });
}

module.exports = {
  fetchOwnedGames: fetchOwnedGames,
  filterBacklog: filterBacklog
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/backlogPool.test.js`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/backlogPool.js web/lib/backlogPool.test.js
git commit -m "Add owned-games backlog data source"
```

---

## Task 3: `web/views/roulettePage.js` — shared roulette page markup

**Files:**
- Create: `web/views/roulettePage.js`
- Create: `web/views/roulettePage.test.js`

**Interfaces:**
- Consumes: `html.escapeHtml(str)` from `web/lib/html.js` (existing).
- Produces (consumed by Task 4's `server.js`):
  - `renderRoulettePage(opts)` — `opts = {title, spinEndpoint, backLinkText}` (`backLinkText` optional, defaults to `'トップに戻る'`). Returns an HTML string: a `<section class="roulette-page" data-spin-endpoint="...">` containing a reel window (`#roulette-reel` inside a marker overlay), a spin button (`class="roulette-spin-btn"`), a result area (`#roulette-result`), an error area (`#roulette-error`), and a link back to `/`.

- [ ] **Step 1: Write the failing tests**

Create `web/views/roulettePage.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderRoulettePage } = require('./roulettePage.js');

test('renderRoulettePage includes the given title', () => {
  const html = renderRoulettePage({ title: '積みゲールーレット', spinEndpoint: '/api/roulette/backlog/spin' });
  assert.match(html, /積みゲールーレット/);
});

test('renderRoulettePage sets data-spin-endpoint to the given endpoint', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/roulette/backlog/spin' });
  assert.match(html, /data-spin-endpoint="\/api\/roulette\/backlog\/spin"/);
});

test('renderRoulettePage includes a reel container, marker, spin button, and result/error areas', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/y' });
  assert.match(html, /id="roulette-reel"/);
  assert.match(html, /class="roulette-marker"/);
  assert.match(html, /class="roulette-spin-btn"/);
  assert.match(html, /id="roulette-result"/);
  assert.match(html, /id="roulette-error"/);
});

test('renderRoulettePage escapes the title', () => {
  const html = renderRoulettePage({ title: '<script>alert(1)</script>', spinEndpoint: '/api/y' });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('renderRoulettePage uses a default back-link text when not provided', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/y' });
  assert.match(html, /トップに戻る/);
});

test('renderRoulettePage uses a custom back-link text when provided', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/y', backLinkText: '一覧へ' });
  assert.match(html, /一覧へ/);
  assert.doesNotMatch(html, /トップに戻る/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test views/roulettePage.test.js`
Expected: FAIL — `Cannot find module './roulettePage.js'`

- [ ] **Step 3: Implement `web/views/roulettePage.js`**

```js
'use strict';
var html = require('../lib/html.js');

function renderRoulettePage(opts) {
  opts = opts || {};
  var title = html.escapeHtml(opts.title || '');
  var spinEndpoint = html.escapeHtml(opts.spinEndpoint || '');
  var backLinkText = html.escapeHtml(opts.backLinkText || 'トップに戻る');
  return '<section class="roulette-page" data-spin-endpoint="' + spinEndpoint + '">'
    + '<h2>' + title + '</h2>'
    + '<div class="roulette-reel-wrap">'
    + '<div class="roulette-reel" id="roulette-reel"></div>'
    + '<div class="roulette-marker"></div>'
    + '</div>'
    + '<button type="button" class="roulette-spin-btn">🎰 回す</button>'
    + '<div class="roulette-result" id="roulette-result"></div>'
    + '<p class="roulette-error" id="roulette-error"></p>'
    + '<p><a href="/">' + backLinkText + '</a></p>'
    + '</section>';
}

module.exports = { renderRoulettePage: renderRoulettePage };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test views/roulettePage.test.js`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add web/views/roulettePage.js web/views/roulettePage.test.js
git commit -m "Add shared roulette page markup"
```

---

## Task 4: `web/server.js` — roulette routes

**Files:**
- Modify: `web/server.js`
- Modify: `bot/.env.example`

**Interfaces:**
- Consumes: `roulette.pickWinner/buildSpinPayload` (Task 1), `backlogPool.fetchOwnedGames/filterBacklog` (Task 2), `roulettePage.renderRoulettePage` (Task 3), `recommendGames.fetchFeaturedPool/pickRandomGames` (existing, `scripts/recommend-games.js`, new require), `gamePool.pickRealGames` (existing, `bot/lib/gamePool.js`, new require), `steamLib.isRealGame/fetchReviewTexts/headerImageUrl` (existing, already required as `steamLib`).
- Produces: `GET /roulette/backlog`, `GET /roulette/recommend`, `POST /api/roulette/backlog/spin`, `POST /api/roulette/recommend/spin`.

This task has no new automated tests, matching this codebase's existing convention that `server.js` route handlers are untested (only the pure functions they call are tested). Task 7 covers manual E2E verification.

- [ ] **Step 1: Add the new requires**

In `web/server.js`, change:

```js
var topPage = require('./views/topPage.js');
var chatStore = require('./lib/chatStore.js');
var chatPrompt = require('./lib/chatPrompt.js');
var chatWidget = require('./views/chatWidget.js');
```

to:

```js
var topPage = require('./views/topPage.js');
var chatStore = require('./lib/chatStore.js');
var chatPrompt = require('./lib/chatPrompt.js');
var chatWidget = require('./views/chatWidget.js');
var roulette = require('./lib/roulette.js');
var backlogPool = require('./lib/backlogPool.js');
var roulettePage = require('./views/roulettePage.js');
var recommendGames = require('../scripts/recommend-games.js');
var gamePool = require('../bot/lib/gamePool.js');
```

- [ ] **Step 2: Add the page routes**

Add this code right after the `app.get('/analyze', ...)` block closes (before `async function buildChatGameContext(appid) {`):

```js
app.get('/roulette/backlog', function (req, res) {
  var body = roulettePage.renderRoulettePage({
    title: '🎰 積みゲールーレット',
    spinEndpoint: '/api/roulette/backlog/spin'
  });
  res.send(layout.renderLayout(body, {}));
});

app.get('/roulette/recommend', function (req, res) {
  var body = roulettePage.renderRoulettePage({
    title: '🎰 おすすめルーレット',
    spinEndpoint: '/api/roulette/recommend/spin'
  });
  res.send(layout.renderLayout(body, {}));
});
```

- [ ] **Step 3: Add the backlog spin route**

Add right after the routes from Step 2:

```js
var BACKLOG_MAX_MINUTES = 120;
var BACKLOG_MAX_CANDIDATES = 12;

app.post('/api/roulette/backlog/spin', async function (req, res) {
  try {
    var steamId64 = process.env.STEAM_ID64;
    var apiKey = process.env.STEAM_API_KEY;
    if (!steamId64 || !apiKey) {
      res.json({ error: 'not_configured' });
      return;
    }
    var owned = await backlogPool.fetchOwnedGames(steamId64, apiKey);
    var backlog = backlogPool.filterBacklog(owned, BACKLOG_MAX_MINUTES);
    if (!backlog.length) {
      res.json({ error: 'no_candidates' });
      return;
    }
    var shuffled = recommendGames.pickRandomGames(backlog, backlog.length);
    var candidates = shuffled.slice(0, BACKLOG_MAX_CANDIDATES);
    var winnerIndex = roulette.pickWinner(candidates);
    res.json(roulette.buildSpinPayload(candidates, winnerIndex));
  } catch (e) {
    console.error('/api/roulette/backlog/spin failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 4: Add the recommend spin route**

Add right after Step 3's route:

```js
var RECOMMEND_MAX_CANDIDATES = 10;
var RECOMMEND_MIN_REVIEWS = 3;

app.post('/api/roulette/recommend/spin', async function (req, res) {
  try {
    var pool = await recommendGames.fetchFeaturedPool();
    var shuffledPool = recommendGames.pickRandomGames(pool, pool.length);
    var realGames = await gamePool.pickRealGames(shuffledPool, RECOMMEND_MAX_CANDIDATES, steamLib.isRealGame, 25);
    if (!realGames.length) {
      res.json({ error: 'no_candidates' });
      return;
    }
    var candidates = realGames.map(function (g) {
      return { id: g.id, name: g.name, imageUrl: steamLib.headerImageUrl(g.id) };
    });

    // レビューが3件以上ある候補のインデックスだけを集め、その部分集合の中から当選を選ぶ
    // (せっかく回して当たったゲームがAI分析なしの価格だけカードだと寂しいため)。
    // 該当が1件も無ければ候補全体から均等ランダムで選ぶ。
    var reviewedIndexes = [];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var reviews = await steamLib.fetchReviewTexts(candidates[i].id, RECOMMEND_MIN_REVIEWS);
        if (reviews.length >= RECOMMEND_MIN_REVIEWS) reviewedIndexes.push(i);
      } catch (e) {
        // このゲームはレビュー取得に失敗しただけで、候補からは外れるだけ。全体は失敗させない。
      }
    }

    var winnerIndex;
    if (reviewedIndexes.length) {
      var pickedAmongReviewed = roulette.pickWinner(reviewedIndexes);
      winnerIndex = reviewedIndexes[pickedAmongReviewed];
    } else {
      winnerIndex = roulette.pickWinner(candidates);
    }

    res.json(roulette.buildSpinPayload(candidates, winnerIndex));
  } catch (e) {
    console.error('/api/roulette/recommend/spin failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 5: Add the `STEAM_API_KEY` placeholder to the env examples**

In `bot/.env.example`, change:

```
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CHAT_CHANNEL_ID=
STEAM_ID64=
ONEMIN_API_KEY=
```

to:

```
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CHAT_CHANNEL_ID=
STEAM_ID64=
STEAM_API_KEY=
ONEMIN_API_KEY=
```

Also open `web/.env` directly (not git-tracked, so this is a manual local edit, not part of the commit) and add a `STEAM_API_KEY=` line if it isn't already there, so local E2E testing in Task 7 can pick it up once the user fills in the value. Leave the value empty for now — the user fills it in themselves.

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

Run: `cd web && node --test`
Expected: PASS — all existing tests still green (this file has no dedicated tests, but confirm nothing else broke)

- [ ] **Step 7: Commit**

```bash
git add web/server.js bot/.env.example
git commit -m "Add roulette spin routes for backlog and recommend modes"
```

---

## Task 5: `web/views/layout.js` — reel styling, spin animation, and top-page links

**Files:**
- Modify: `web/views/layout.js`
- Modify: `web/views/layout.test.js`
- Modify: `web/views/topPage.js`
- Modify: `web/views/topPage.test.js`

**Interfaces:**
- Consumes: nothing new (pure CSS/JS additions plus two plain `<a>` links).
- Produces: the roulette pages rendered by Task 3/routed by Task 4 become visually styled and interactive; the top page links to both roulette pages.

- [ ] **Step 1: Write the failing tests**

In `web/views/layout.test.js`, add:

```js
test('renderLayout includes roulette reel styling', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-reel-wrap\{/);
  assert.match(page, /\.roulette-marker\{/);
});

test('renderLayout wires the roulette spin button to fetch the page-specific spin endpoint', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /roulette-spin-btn/);
  assert.match(page, /data-spin-endpoint/);
});
```

In `web/views/topPage.test.js`, add:

```js
test('renderTopPage includes links to both roulette pages', () => {
  const page = renderTopPage({ history: [], favorites: [] });
  assert.match(page, /href="\/roulette\/backlog"/);
  assert.match(page, /href="\/roulette\/recommend"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test views/layout.test.js views/topPage.test.js`
Expected: FAIL — none of the new content exists yet

- [ ] **Step 3: Add the roulette links to `web/views/topPage.js`**

Change:

```js
function renderTopPage(data) {
  data = data || {};
  var history = data.history || [];
  var favorites = data.favorites || [];
  var parts = [];

  parts.push('<section class="favorites">');
```

to:

```js
function renderTopPage(data) {
  data = data || {};
  var history = data.history || [];
  var favorites = data.favorites || [];
  var parts = [];

  parts.push('<p class="roulette-links"><a href="/roulette/backlog">🎰 積みゲールーレット</a> ・ '
    + '<a href="/roulette/recommend">🎰 おすすめルーレット</a></p>');

  parts.push('<section class="favorites">');
```

- [ ] **Step 4: Add the CSS to `web/views/layout.js`**

Add to the CSS string, after the existing `.chat-clear{...}` line (added by the earlier chat feature):

```js
    + '.roulette-page{margin-top:16px;background:#2a3f5a;padding:16px;border-radius:8px;text-align:center}'
    + '.roulette-reel-wrap{position:relative;height:270px;overflow:hidden;border-radius:8px;background:#1b2838;margin:16px auto;max-width:280px}'
    + '.roulette-reel{position:absolute;left:0;right:0;top:0}'
    + '.roulette-reel-item{height:90px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:4px}'
    + '.roulette-reel-item img{max-width:90%;max-height:80px;object-fit:cover;border-radius:4px}'
    + '.roulette-marker{position:absolute;top:90px;left:0;right:0;height:90px;border-top:3px solid #66c0f4;border-bottom:3px solid #66c0f4;pointer-events:none;box-sizing:border-box}'
    + '.roulette-spin-btn{padding:10px 24px;border-radius:4px;border:none;background:#66c0f4;cursor:pointer;min-height:44px;font-size:16px}'
    + '.roulette-spin-btn:disabled{opacity:0.6;cursor:default}'
    + '.roulette-result{margin-top:16px}'
    + '.roulette-result img{max-width:100%;border-radius:8px}'
    + '.roulette-error{color:#e05252}'
    + '.roulette-links{margin:8px 0}'
```

- [ ] **Step 5: Add the client-side spin animation JS to `web/views/layout.js`**

Add this right before the closing `'</script>'` of the existing inline script (after the `.chat-widget` forEach block added by the earlier chat feature, still inside the same `<script>` tag):

```js
    + 'document.querySelectorAll(".roulette-page").forEach(function(page){'
    + 'var endpoint=page.getAttribute("data-spin-endpoint");'
    + 'var reel=page.querySelector("#roulette-reel");'
    + 'var spinBtn=page.querySelector(".roulette-spin-btn");'
    + 'var resultEl=page.querySelector("#roulette-result");'
    + 'var errorEl=page.querySelector("#roulette-error");'
    + 'var ITEM_HEIGHT=90;'
    + 'var REPEAT=6;'
    + 'function resetButton(){spinBtn.disabled=false;spinBtn.textContent="🎰 回す";}'
    + 'function showError(msg){errorEl.textContent=msg;resetButton();}'
    + 'function spin(candidates,winnerIndex){'
    + 'reel.innerHTML="";'
    + 'var sequence=[];'
    + 'for(var r=0;r<REPEAT;r++){candidates.forEach(function(c){sequence.push(c);});}'
    + 'sequence.forEach(function(c){'
    + 'var item=document.createElement("div");'
    + 'item.className="roulette-reel-item";'
    + 'var img=document.createElement("img");'
    + 'img.src=c.imageUrl;'
    + 'img.alt=c.name;'
    + 'item.appendChild(img);'
    + 'reel.appendChild(item);'
    + '});'
    + 'var landingPos=(REPEAT-1)*candidates.length+winnerIndex;'
    + 'var targetY=-(landingPos*ITEM_HEIGHT-ITEM_HEIGHT);'
    + 'reel.style.transition="none";'
    + 'reel.style.transform="translateY(0px)";'
    + 'reel.offsetHeight;'
    + 'reel.style.transition="transform 4s cubic-bezier(0.15,0.85,0.35,1)";'
    + 'reel.style.transform="translateY("+targetY+"px)";'
    + 'reel.addEventListener("transitionend",function onEnd(){'
    + 'reel.removeEventListener("transitionend",onEnd);'
    + 'var winner=candidates[winnerIndex];'
    + 'resultEl.innerHTML="";'
    + 'var img=document.createElement("img");'
    + 'img.src=winner.imageUrl;'
    + 'img.alt=winner.name;'
    + 'var p=document.createElement("p");'
    + 'p.textContent="当選: "+winner.name;'
    + 'var a=document.createElement("a");'
    + 'a.href="/analyze?name="+encodeURIComponent(winner.name);'
    + 'a.textContent="詳しく見る";'
    + 'resultEl.appendChild(img);'
    + 'resultEl.appendChild(p);'
    + 'resultEl.appendChild(a);'
    + 'resetButton();'
    + '});'
    + '}'
    + 'spinBtn.addEventListener("click",function(){'
    + 'errorEl.textContent="";'
    + 'resultEl.innerHTML="";'
    + 'spinBtn.disabled=true;'
    + 'spinBtn.textContent="抽選中…";'
    + 'fetch(endpoint,{method:"POST"})'
    + '.then(function(r){return r.json();})'
    + '.then(function(d){'
    + 'if(d.error){'
    + 'var msg=d.error==="no_candidates"?"対象のゲームが見つかりませんでした(プロフィールが非公開の可能性があります)"'
    + ':d.error==="not_configured"?"積みゲー機能の設定が未完了です"'
    + ':"候補の取得に失敗しました。もう一度試してください";'
    + 'showError(msg);'
    + 'return;'
    + '}'
    + 'spin(d.candidates,d.winnerIndex);'
    + '})'
    + '.catch(function(){showError("候補の取得に失敗しました。もう一度試してください");});'
    + '});'
    + '});'
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd web && node --test`
Expected: PASS — all tests green (this touches shared `layout.js`/`topPage.js`, so run the full suite)

- [ ] **Step 7: Commit**

```bash
git add web/views/layout.js web/views/layout.test.js web/views/topPage.js web/views/topPage.test.js
git commit -m "Add roulette reel styling, spin animation, and top-page links"
```

---

## Task 6: Manual end-to-end verification with real data

**Files:** none (verification only; may produce a follow-up fix commit)

- [ ] **Step 1: Confirm `STEAM_API_KEY` is set**

```bash
cd web
grep STEAM_API_KEY .env
```

If it's empty, stop here and ask the user to fill in their Steam Web API key (from https://steamcommunity.com/dev/apikey) before continuing — the backlog mode cannot be tested without it. The recommend mode does not need this key and can be tested regardless.

- [ ] **Step 2: Start the server and exercise both spin endpoints**

```bash
cd web
set -a && source .env && set +a
PORT=3106 node server.js &
sleep 1

# Recommend mode (no STEAM_API_KEY needed)
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" -X POST http://127.0.0.1:3106/api/roulette/recommend/spin

# Backlog mode
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" -X POST http://127.0.0.1:3106/api/roulette/backlog/spin

# Page shells render
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" http://127.0.0.1:3106/roulette/backlog | grep -o 'data-spin-endpoint="[^"]*"'
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" http://127.0.0.1:3106/roulette/recommend | grep -o 'data-spin-endpoint="[^"]*"'

kill %1
```

Expected: both spin endpoints return JSON with a non-empty `candidates` array and an integer `winnerIndex` within range (or a documented `{"error": "..."}` if the backlog profile is genuinely private or has no games under the threshold — report exactly what came back either way, including candidate count and any error field). Both page-shell `curl`s show the correct `data-spin-endpoint` value.

- [ ] **Step 3: If verification revealed any bug, fix and re-verify**

If Step 2 surfaces a real defect (not just "the backlog happened to be empty because every owned game has over 2 hours logged" — that's expected behavior, not a bug), fix it, re-run the full test suite (`cd web && node --test`), and re-run the specific `curl` check that failed. Commit the fix separately with a description of what was wrong.

- [ ] **Step 4: Manual browser check of the animation**

Since the reel animation itself has no automated test coverage (project convention — no browser test infrastructure), open `/roulette/backlog` and `/roulette/recommend` in an actual browser, click "🎰 回す" on each, and confirm: the reel visibly scrolls and decelerates, lands with a candidate centered in the marker, and the revealed result matches the API's `winnerIndex` (compare against the `curl` output from Step 2, or open browser devtools' Network tab to see the actual spin response for that click). Report what was observed.

---

## Self-Review Notes

- **Spec coverage:** two independent pages sharing one view/animation (Tasks 3-5), server-decided winner via `pickWinner` (Task 1, used identically in both spin routes in Task 4), owned-games backlog with the 120-minute threshold (Task 2), review-aware winner bias for recommend mode reusing `pickAnalyzableGames`'s underlying data shape without duplicating its logic (Task 4 Step 4 — implemented directly with `reviewedIndexes` rather than importing `pickAnalyzableGames`, since the spec's exact selection rule — "≥3 reviews subset, `pickWinner` within it, fall back to the full set" — is different from `pickAnalyzableGames`'s "sort analyzable-first" behavior; this is a deliberate deviation from the spec's parenthetical mention of reusing that function, documented here so it isn't missed as an oversight), slot-machine vertical animation (Task 5), error handling for no-candidates/not-configured/fetch-failure (Task 4 routes + Task 5 client JS), top-page navigation links (Task 5). All spec decisions have a task.
- **Type consistency:** `roulette.pickWinner(candidates, rng)` (Task 1) is called with a plain array of index numbers in Task 4 Step 4's `reviewedIndexes` case — this works because `pickWinner` only reads `.length` and returns an index, so passing a non-object array is valid, but it's a slightly unusual call site; the inline comment in Task 4 Step 4 explains the index-translation step (`reviewedIndexes[pickedAmongReviewed]`) so a reviewer doesn't mistake it for a bug. `roulette.buildSpinPayload(candidates, winnerIndex)` (Task 1) is called with the exact same `candidates` array structure (`{id, name, imageUrl}`) built by both spin routes in Task 4. `roulettePage.renderRoulettePage({title, spinEndpoint, backLinkText})` (Task 3) is called with matching field names from both page routes in Task 4 Step 2. The client JS's `data-spin-endpoint` attribute (Task 3's markup) is read by Task 5's client JS via `page.getAttribute("data-spin-endpoint")` — matching names confirmed.
- **A real interface hazard caught during planning:** the spec's architecture section describes the recommend-mode winner selection as reusing `pickAnalyzableGames`, but that function's actual behavior (sort analyzable-first, return the first `n`) doesn't match what's needed here (pick one winner biased toward the reviewed subset, from a candidate list that must stay in its original order for the client's `winnerIndex` to make sense). Task 4 Step 4 implements the described *behavior* directly instead of the named function, and the Self-Review Notes above flag this explicitly rather than silently diverging from the spec's wording.
- **No placeholders:** every step has complete, runnable code, including the full client-side animation JS (no "TODO: add animation logic").
- **Consistency with prior work in this codebase:** repeats the pure/I/O split, the `rng`-injection pattern from `scripts/recommend-games.js`, the fetch-based no-build-tooling client JS style from the chat feature, and the "CSS + behavior in the same task that introduces the markup" approach from both the charts and chat plans.
