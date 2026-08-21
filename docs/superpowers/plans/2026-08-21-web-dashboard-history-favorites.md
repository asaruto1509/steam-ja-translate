# Web Dashboard Search History & Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic search history and manual favorites (bookmarks) to the Steam Web Dashboard, backed by a single JSON file, so the user can revisit previously analyzed games without retyping the name.

**Architecture:** A new `web/lib/store.js` module owns all persistence (a JSON file at `web/data/dashboard-data.json`, never committed to git). Pure array-transform functions inside it are TDD-tested; the thin file-I/O wrapper around them is untested, matching this codebase's existing convention for I/O layers (`gameAnalysis.js`, route handlers). The top page (`/`) gains a real view module listing history/favorites; the analysis page gains a favorite-toggle form; `server.js` wires everything together with two new POST routes.

**Tech Stack:** Node.js (CommonJS, ES5-style: `var`/`function`, no `let`/`const`/arrow functions in implementation files — test files use `const`/arrow callbacks per existing convention), Express 4 (`express.urlencoded` is built in, no new dependency), `node:test` + `node:assert/strict`, synchronous `fs` (single-user, low write frequency — no concurrency library needed).

**Spec:** `docs/superpowers/specs/2026-08-21-web-dashboard-history-favorites-design.md`

## Global Constraints

- Implementation files use ES5-ish CommonJS style: `'use strict'`, `var`, `function` declarations — no `let`/`const`/arrow functions. Test files use `const`/arrow-function callbacks (existing convention, not a violation).
- Test framework is exclusively `node:test` + `node:assert/strict`.
- Pure logic functions are TDD-tested (RED→GREEN). Thin I/O wrappers (file reads/writes, Express route handlers) are left untested, matching the existing pattern in `gameAnalysis.js` and `server.js`.
- `bot/**` is never modified — only `require()`'d read-only. This feature does not need to touch it at all.
- No new npm dependencies. `express.urlencoded` ships with the already-installed Express 4.19.
- `web/data/dashboard-data.json` is live user data on the VM, not source — it must be gitignored, never committed.
- History caps at 30 entries (oldest dropped first); re-searching an already-present game moves it to the front instead of duplicating.
- Favorites/history entries are added or removed only from the analysis page (`/analyze`) via POST forms — the top page is read-only display + links back into `/analyze?name=...`.

---

## Task 1: `web/lib/store.js` — persistence layer

**Files:**
- Create: `web/lib/store.js`
- Create: `web/lib/store.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces (used by Task 3's server.js wiring, and available now):
  - `applyHistoryEntry(history, entry, maxSize)` → new array — pure
  - `applyFavoriteAdd(favorites, entry)` → new array — pure
  - `applyFavoriteRemove(favorites, appid)` → new array — pure
  - `isFavorited(favorites, appid)` → boolean — pure
  - `addHistoryEntry(entry)` → void — I/O, entry is `{appid, name, searchedAt}`
  - `addFavorite(entry)` → void — I/O, entry is `{appid, name, addedAt}`
  - `removeFavorite(appid)` → void — I/O
  - `getHistory()` → array — I/O
  - `getFavorites()` → array — I/O

- [ ] **Step 1: Write the failing tests for the pure functions**

Create `web/lib/store.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyHistoryEntry, applyFavoriteAdd, applyFavoriteRemove, isFavorited } = require('./store.js');

test('applyHistoryEntry adds a new entry to the front', () => {
  const result = applyHistoryEntry([], { appid: '1', name: 'Game A' }, 30);
  assert.deepEqual(result, [{ appid: '1', name: 'Game A' }]);
});

test('applyHistoryEntry moves a re-searched game to the front instead of duplicating', () => {
  const history = [{ appid: '2', name: 'Game B' }, { appid: '1', name: 'Game A' }];
  const result = applyHistoryEntry(history, { appid: '1', name: 'Game A' }, 30);
  assert.deepEqual(result, [{ appid: '1', name: 'Game A' }, { appid: '2', name: 'Game B' }]);
});

test('applyHistoryEntry truncates to maxSize', () => {
  const history = [{ appid: '2', name: 'B' }, { appid: '3', name: 'C' }];
  const result = applyHistoryEntry(history, { appid: '1', name: 'A' }, 2);
  assert.deepEqual(result, [{ appid: '1', name: 'A' }, { appid: '2', name: 'B' }]);
});

test('applyFavoriteAdd appends a new favorite', () => {
  const result = applyFavoriteAdd([], { appid: '1', name: 'Game A' });
  assert.deepEqual(result, [{ appid: '1', name: 'Game A' }]);
});

test('applyFavoriteAdd does not duplicate an already-favorited appid', () => {
  const favorites = [{ appid: '1', name: 'Game A' }];
  const result = applyFavoriteAdd(favorites, { appid: '1', name: 'Game A (dup)' });
  assert.deepEqual(result, [{ appid: '1', name: 'Game A' }]);
});

test('applyFavoriteRemove removes the matching appid', () => {
  const favorites = [{ appid: '1', name: 'Game A' }, { appid: '2', name: 'Game B' }];
  const result = applyFavoriteRemove(favorites, '1');
  assert.deepEqual(result, [{ appid: '2', name: 'Game B' }]);
});

test('applyFavoriteRemove leaves the array unchanged when appid is not present', () => {
  const favorites = [{ appid: '1', name: 'Game A' }];
  const result = applyFavoriteRemove(favorites, '999');
  assert.deepEqual(result, favorites);
});

test('isFavorited returns true when the appid is in the list', () => {
  assert.equal(isFavorited([{ appid: '1', name: 'Game A' }], '1'), true);
});

test('isFavorited returns false when the appid is not in the list', () => {
  assert.equal(isFavorited([{ appid: '1', name: 'Game A' }], '2'), false);
});

test('isFavorited returns false for an empty list', () => {
  assert.equal(isFavorited([], '1'), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/store.test.js`
Expected: FAIL — `Cannot find module './store.js'`

- [ ] **Step 3: Implement `web/lib/store.js`**

```js
'use strict';
var fs = require('fs');
var path = require('path');

var DATA_DIR = path.join(__dirname, '..', 'data');
var DATA_FILE = path.join(DATA_DIR, 'dashboard-data.json');
var HISTORY_MAX_SIZE = 30;

function applyHistoryEntry(history, entry, maxSize) {
  var filtered = history.filter(function (h) { return h.appid !== entry.appid; });
  filtered.unshift(entry);
  return filtered.slice(0, maxSize);
}

function applyFavoriteAdd(favorites, entry) {
  var exists = favorites.some(function (f) { return f.appid === entry.appid; });
  return exists ? favorites : favorites.concat([entry]);
}

function applyFavoriteRemove(favorites, appid) {
  return favorites.filter(function (f) { return f.appid !== appid; });
}

function isFavorited(favorites, appid) {
  return favorites.some(function (f) { return f.appid === appid; });
}

function loadData() {
  try {
    var raw = fs.readFileSync(DATA_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    return {
      history: Array.isArray(parsed.history) ? parsed.history : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : []
    };
  } catch (e) {
    return { history: [], favorites: [] };
  }
}

function saveData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

function addHistoryEntry(entry) {
  try {
    var data = loadData();
    saveData({ history: applyHistoryEntry(data.history, entry, HISTORY_MAX_SIZE), favorites: data.favorites });
  } catch (e) {
    console.error('web dashboard store: failed to save history entry:', e);
  }
}

function addFavorite(entry) {
  try {
    var data = loadData();
    saveData({ history: data.history, favorites: applyFavoriteAdd(data.favorites, entry) });
  } catch (e) {
    console.error('web dashboard store: failed to add favorite:', e);
  }
}

function removeFavorite(appid) {
  try {
    var data = loadData();
    saveData({ history: data.history, favorites: applyFavoriteRemove(data.favorites, appid) });
  } catch (e) {
    console.error('web dashboard store: failed to remove favorite:', e);
  }
}

function getHistory() {
  return loadData().history;
}

function getFavorites() {
  return loadData().favorites;
}

module.exports = {
  applyHistoryEntry: applyHistoryEntry,
  applyFavoriteAdd: applyFavoriteAdd,
  applyFavoriteRemove: applyFavoriteRemove,
  isFavorited: isFavorited,
  addHistoryEntry: addHistoryEntry,
  addFavorite: addFavorite,
  removeFavorite: removeFavorite,
  getHistory: getHistory,
  getFavorites: getFavorites
};
```

Note on concurrency: all file I/O here is synchronous (`readFileSync`/`writeFileSync`). Since Node is single-threaded and none of these functions contain an `await` point between the read and the write, each call's read-modify-write completes atomically with respect to the event loop — no interleaving is possible even under concurrent requests, so no write queue or lock is needed for this single-user, low-frequency use case.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/store.test.js`
Expected: PASS — all 10 tests green

- [ ] **Step 5: Gitignore the data file**

Add this line to the end of `.gitignore` (repo root):

```
web/data/
```

- [ ] **Step 6: Commit**

```bash
git add web/lib/store.js web/lib/store.test.js .gitignore
git commit -m "Add JSON-file persistence for web dashboard history and favorites"
```

---

## Task 2: `web/views/topPage.js` — history/favorites list view

**Files:**
- Create: `web/views/topPage.js`
- Create: `web/views/topPage.test.js`

**Interfaces:**
- Consumes: `html.escapeHtml(str)` from `web/lib/html.js` (existing)
- Produces: `renderTopPage(data)` → HTML string, where `data` is `{history: [{appid, name, ...}], favorites: [{appid, name, ...}]}` (same entry shape Task 1's `store.js` produces)

- [ ] **Step 1: Write the failing tests**

Create `web/views/topPage.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTopPage } = require('./topPage.js');

test('renderTopPage shows an empty-history message when history is empty', () => {
  const page = renderTopPage({ history: [], favorites: [] });
  assert.match(page, /検索するとここに履歴が表示されます/);
});

test('renderTopPage shows an empty-favorites message when favorites is empty', () => {
  const page = renderTopPage({ history: [], favorites: [] });
  assert.match(page, /まだお気に入りはありません/);
});

test('renderTopPage lists history entries as links to /analyze with the name in the query string', () => {
  const page = renderTopPage({ history: [{ appid: '1', name: 'Hollow Knight' }], favorites: [] });
  assert.match(page, /href="\/analyze\?name=Hollow%20Knight"/);
  assert.match(page, /Hollow Knight/);
});

test('renderTopPage lists favorite entries as links to /analyze', () => {
  const page = renderTopPage({ history: [], favorites: [{ appid: '2', name: 'Celeste' }] });
  assert.match(page, /href="\/analyze\?name=Celeste"/);
  assert.match(page, /Celeste/);
});

test('renderTopPage escapes game names', () => {
  const page = renderTopPage({ history: [{ appid: '1', name: '<script>alert(1)</script>' }], favorites: [] });
  assert.doesNotMatch(page, /<script>alert\(1\)<\/script>/);
});

test('renderTopPage handles a missing history/favorites input without throwing', () => {
  assert.doesNotThrow(() => renderTopPage({}));
  assert.doesNotThrow(() => renderTopPage());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test views/topPage.test.js`
Expected: FAIL — `Cannot find module './topPage.js'`

- [ ] **Step 3: Implement `web/views/topPage.js`**

```js
'use strict';
var html = require('../lib/html.js');

function renderEntryLink(entry) {
  return '<li><a href="/analyze?name=' + encodeURIComponent(entry.name) + '">'
    + html.escapeHtml(entry.name) + '</a></li>';
}

function renderTopPage(data) {
  data = data || {};
  var history = data.history || [];
  var favorites = data.favorites || [];
  var parts = [];

  parts.push('<section class="favorites">');
  parts.push('<h2>★ お気に入り</h2>');
  if (favorites.length) {
    parts.push('<ul>' + favorites.map(renderEntryLink).join('') + '</ul>');
  } else {
    parts.push('<p class="empty">まだお気に入りはありません。</p>');
  }
  parts.push('</section>');

  parts.push('<section class="history">');
  parts.push('<h2>最近検索したゲーム</h2>');
  if (history.length) {
    parts.push('<ul>' + history.map(renderEntryLink).join('') + '</ul>');
  } else {
    parts.push('<p class="empty">検索するとここに履歴が表示されます。</p>');
  }
  parts.push('</section>');

  return parts.join('');
}

module.exports = { renderTopPage: renderTopPage };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test views/topPage.test.js`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add web/views/topPage.js web/views/topPage.test.js
git commit -m "Add top page view listing search history and favorites"
```

---

## Task 3: `web/lib/viewModel.js` — pass through `isFavorite`

**Files:**
- Modify: `web/lib/viewModel.js`
- Modify: `web/lib/viewModel.test.js`

**Interfaces:**
- Consumes: `result.isFavorite` (boolean, optional — set by Task 5's server.js wiring; may be absent, e.g. when the game wasn't found)
- Produces: `vm.isFavorite` (boolean, always `true` or `false`, never `undefined`) — consumed by Task 4's `analysisPage.js`

- [ ] **Step 1: Write the failing tests**

In `web/lib/viewModel.test.js`, add (before the final `treats a non-array categories...` test, or anywhere after the existing tests):

```js
test('buildAnalysisViewModel passes through isFavorite as true', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    isFavorite: true
  });
  assert.equal(vm.isFavorite, true);
});

test('buildAnalysisViewModel defaults isFavorite to false when not provided', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null
  });
  assert.equal(vm.isFavorite, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/viewModel.test.js`
Expected: FAIL — `vm.isFavorite` is `undefined`, not `true`/`false`

- [ ] **Step 3: Implement the change**

In `web/lib/viewModel.js`, inside `buildAnalysisViewModel`'s returned `vm` object literal (the block that currently ends with `analysis: null`), add one field:

```js
    playerCountText: formatPlayerCount(result.playerCount),
    achievementInfo: formatAchievementStats(result.achievementStats),
    isFavorite: result.isFavorite === true,
    analysis: null
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/viewModel.test.js`
Expected: PASS — all 15 tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/viewModel.js web/lib/viewModel.test.js
git commit -m "Pass isFavorite through the analysis view model"
```

---

## Task 4: `web/views/analysisPage.js` — favorite toggle button

**Files:**
- Modify: `web/views/analysisPage.js`
- Modify: `web/views/analysisPage.test.js`

**Interfaces:**
- Consumes: `vm.isFavorite` (boolean, from Task 3), `vm.appid`, `vm.name` (existing fields)
- Produces: a `<form>` posting to `/favorites/add` (when `vm.isFavorite` is `false`) or `/favorites/remove` (when `true`), each carrying hidden `appid` and `name` fields — consumed by Task 5's new POST routes

- [ ] **Step 1: Write the failing tests**

In `web/views/analysisPage.test.js`, add (before the final `escapes the game name` test):

```js
test('renderAnalysisPage shows an add-to-favorites button when not favorited', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false
  });
  assert.match(result, /action="\/favorites\/add"/);
  assert.doesNotMatch(result, /action="\/favorites\/remove"/);
});

test('renderAnalysisPage shows a remove-from-favorites button when favorited', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: true
  });
  assert.match(result, /action="\/favorites\/remove"/);
  assert.doesNotMatch(result, /action="\/favorites\/add"/);
});

test('renderAnalysisPage includes the appid and name in the favorite form', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Hollow Knight', appid: '367520', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false
  });
  assert.match(result, /name="appid" value="367520"/);
  assert.match(result, /name="name" value="Hollow Knight"/);
});

test('renderAnalysisPage escapes the name in the favorite form', () => {
  const result = renderAnalysisPage({
    notFound: false, name: '<script>alert(1)</script>', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false
  });
  assert.doesNotMatch(result, /<script>alert\(1\)<\/script>/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test views/analysisPage.test.js`
Expected: FAIL — no `action="/favorites/..."` markup exists yet

- [ ] **Step 3: Implement the change**

In `web/views/analysisPage.js`, right after the `<h2>` line (`parts.push('<h2><a href="' + storeUrl + '">' + html.escapeHtml(vm.name) + '</a></h2>');`), insert:

```js
  if (vm.isFavorite) {
    parts.push('<form method="POST" action="/favorites/remove" class="favorite-form">'
      + '<input type="hidden" name="appid" value="' + html.escapeHtml(vm.appid) + '">'
      + '<input type="hidden" name="name" value="' + html.escapeHtml(vm.name) + '">'
      + '<button type="submit">★ お気に入り解除</button></form>');
  } else {
    parts.push('<form method="POST" action="/favorites/add" class="favorite-form">'
      + '<input type="hidden" name="appid" value="' + html.escapeHtml(vm.appid) + '">'
      + '<input type="hidden" name="name" value="' + html.escapeHtml(vm.name) + '">'
      + '<button type="submit">☆ お気に入りに追加</button></form>');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test views/analysisPage.test.js`
Expected: PASS — all 15 tests green

- [ ] **Step 5: Commit**

```bash
git add web/views/analysisPage.js web/views/analysisPage.test.js
git commit -m "Add favorite toggle button to the analysis page"
```

---

## Task 5: `web/server.js` — wire history, favorites, and the two POST routes

**Files:**
- Modify: `web/server.js`

**Interfaces:**
- Consumes: `store.getHistory()`, `store.getFavorites()`, `store.addHistoryEntry(entry)`, `store.addFavorite(entry)`, `store.removeFavorite(appid)`, `store.isFavorited(favorites, appid)` (Task 1); `topPage.renderTopPage(data)` (Task 2); `vm.isFavorite` support in `viewModel.buildAnalysisViewModel` (Task 3) and `analysisPage.renderAnalysisPage` (Task 4)
- Produces: `GET /` now shows history/favorites; `GET /analyze` records history and computes favorite state; `POST /favorites/add` and `POST /favorites/remove` — no other module depends on these (route handlers are the top of the dependency graph)

This task has no new automated tests, matching this codebase's existing convention: route handlers in `server.js` have never had dedicated tests (only the pure `lib/`/`views/` modules they call are tested). Verification here is manual, via `curl`, at the end of the task.

- [ ] **Step 1: Add the `store` and `topPage` requires**

In `web/server.js`, add to the requires at the top of the file:

```js
var store = require('./lib/store.js');
var topPage = require('./views/topPage.js');
```

- [ ] **Step 2: Add the urlencoded body-parser middleware**

Immediately after the existing `app.use(authLib.createBasicAuthMiddleware(...))` line, add:

```js
app.use(express.urlencoded({ extended: false }));
```

- [ ] **Step 3: Rewrite the `GET /` handler to show history and favorites**

Replace:

```js
app.get('/', function (req, res) {
  res.send(layout.renderLayout('<p>ゲーム名を検索してください。</p>', {}));
});
```

with:

```js
app.get('/', function (req, res) {
  var body = topPage.renderTopPage({ history: store.getHistory(), favorites: store.getFavorites() });
  res.send(layout.renderLayout(body, {}));
});
```

- [ ] **Step 4: Record history and compute favorite state in `GET /analyze`**

In the `app.get('/analyze', ...)` handler, right after the line `var result = await gameAnalysis.fetchGameAnalysis(name, deps);` and before `var vm = viewModel.buildAnalysisViewModel(result);`, insert:

```js
    if (result.found) {
      store.addHistoryEntry({ appid: result.found.id, name: result.found.name, searchedAt: Date.now() });
      result.isFavorite = store.isFavorited(store.getFavorites(), result.found.id);
    }
```

- [ ] **Step 5: Add the two favorites POST routes**

Add these after the `GET /analyze` handler and before the `if (require.main === module)` block:

```js
app.post('/favorites/add', function (req, res) {
  var appid = typeof req.body.appid === 'string' ? req.body.appid : '';
  var name = typeof req.body.name === 'string' ? req.body.name : '';
  if (appid && name) {
    store.addFavorite({ appid: appid, name: name, addedAt: Date.now() });
    res.redirect('/analyze?name=' + encodeURIComponent(name));
    return;
  }
  res.redirect('/');
});

app.post('/favorites/remove', function (req, res) {
  var appid = typeof req.body.appid === 'string' ? req.body.appid : '';
  var name = typeof req.body.name === 'string' ? req.body.name : '';
  if (appid) {
    store.removeFavorite(appid);
  }
  res.redirect(name ? '/analyze?name=' + encodeURIComponent(name) : '/');
});
```

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

Run: `cd web && node --test`
Expected: PASS — all tests green (the new store/topPage/viewModel/analysisPage tests plus every pre-existing test)

- [ ] **Step 7: Manual end-to-end verification**

Start the server locally with a throwaway data directory (it will be created automatically):

```bash
cd web
WEB_DASHBOARD_USER=test WEB_DASHBOARD_PASS=test BIND_HOST=127.0.0.1 PORT=3102 node server.js &
```

Then verify the full flow:

```bash
# 1. Top page starts with empty history/favorites
curl -s -u test:test http://127.0.0.1:3102/ | grep -o 'まだお気に入りはありません\|検索するとここに履歴が表示されます'

# 2. Analyzing a game records history and shows an "add" button
curl -s -u test:test "http://127.0.0.1:3102/analyze?name=Hollow%20Knight" -o /tmp/analyze1.html
grep -o 'action="/favorites/add"' /tmp/analyze1.html
grep -o 'name="appid" value="[0-9]*"' /tmp/analyze1.html

# 3. Top page now shows it in history
curl -s -u test:test http://127.0.0.1:3102/ | grep -o 'Hollow Knight'

# 4. Adding to favorites redirects back and flips the button to "remove"
APPID=$(grep -o 'name="appid" value="[0-9]*"' /tmp/analyze1.html | grep -o '[0-9]*')
curl -s -u test:test -X POST -d "appid=$APPID&name=Hollow Knight" http://127.0.0.1:3102/favorites/add -o /tmp/after-add.html -L
grep -o 'action="/favorites/remove"' /tmp/after-add.html

# 5. Top page now shows it in favorites too
curl -s -u test:test http://127.0.0.1:3102/ | grep -c 'Hollow Knight'

# 6. Removing it flips the button back
curl -s -u test:test -X POST -d "appid=$APPID&name=Hollow Knight" http://127.0.0.1:3102/favorites/remove -o /tmp/after-remove.html -L
grep -o 'action="/favorites/add"' /tmp/after-remove.html
```

Expected: step 1 shows both empty messages; step 2 shows the add button and a numeric appid; step 3 shows "Hollow Knight"; step 4 shows the remove button after adding; step 5 count is 2 (history + favorites); step 6 shows the add button again after removing.

Clean up afterward: stop the background server process, and delete the throwaway `web/data/dashboard-data.json` this test run created (it's gitignored and untracked, so this is just tidying a local file, not a git operation).

- [ ] **Step 8: Commit**

```bash
git add web/server.js
git commit -m "Wire up search history and favorites routes in the web dashboard"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section has a task — persistence (`Task 1`), top page display (`Task 2`), view model passthrough (`Task 3`), favorite button (`Task 4`), route wiring including the POST/Redirect/GET pattern and history-on-search (`Task 5`). The gitignore requirement is folded into Task 1 since that's the task that creates the data directory.
- **Simplification vs. spec:** the spec's data-flow section mentions serializing writes; because the implementation uses synchronous `fs` calls with no `await` between read and write, a promise-based write queue turned out to be unnecessary (sync code can't interleave on a single thread). This is a strict simplification, not a behavior change — noted inline in Task 1.
- **Type consistency:** entry shape `{appid, name, searchedAt|addedAt}` is used identically in `store.js` (Task 1), `topPage.js`'s `renderEntryLink` (Task 2, reads `.name`), and `server.js`'s wiring (Task 5, constructs the entries). `vm.isFavorite` is boolean end-to-end: `result.isFavorite === true` (Task 3) → `vm.isFavorite` (Task 4's `if (vm.isFavorite)`).
- **No placeholders:** every step has complete, runnable code — no TBD/TODO markers.
