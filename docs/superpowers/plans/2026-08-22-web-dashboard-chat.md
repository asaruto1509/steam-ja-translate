# Web Dashboard AI Chat Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a natural-language AI chat feature to the Steam Web Dashboard, with server-side persisted conversation history, usable both as a per-game follow-up chat on the analysis page and as a standalone chat on the top page.

**Architecture:** A shared chat engine (`web/lib/chatStore.js` for JSON-file persistence, `web/lib/chatPrompt.js` for prompt building, `web/views/chatWidget.js` for the HTML widget) is parameterized by a "scope" — either a Steam appid (game-specific conversation) or `null` (the single standalone conversation). Two new JSON API routes in `web/server.js` (`POST /chat/message`, `POST /chat/clear`) are driven by a small amount of new client-side vanilla JS (`fetch`-based, no build tooling) added to `web/views/layout.js`. This is the project's first interactive (non-form-reload) client script; the existing full-page loading overlay is explicitly excluded from chat forms so it doesn't interfere.

**Tech Stack:** Node.js (CommonJS, ES5-style: `var`/`function`, no `let`/`const`/arrow functions in implementation files — test files use `const`/arrow callbacks per existing convention), `node:test` + `node:assert/strict`, Express's built-in `express.json()` middleware (already available via the existing `express` dependency, no new package), vanilla browser JS with `fetch` (no framework, no build step).

**Spec:** `docs/superpowers/specs/2026-08-22-web-dashboard-chat-design.md`

## Global Constraints

- Implementation files use ES5-ish CommonJS style: `'use strict'`, `var`, `function` declarations — no `let`/`const`/arrow functions. This applies to browser-side JS embedded in `layout.js` too, since it lives inside an ES5-style implementation file. Test files use `const`/arrow-function callbacks (existing convention).
- Test framework is exclusively `node:test` + `node:assert/strict`.
- Pure logic functions (`chatStore.applyMessage`, `chatPrompt.buildChatPrompt`, `chatWidget.renderChatWidget`) are TDD-tested. Thin I/O wrappers (`chatStore`'s file I/O functions, `server.js` route handlers) are left untested, matching the existing pattern. Client-side browser JS has no test infrastructure in this project — it is verified manually via `curl` against the real running server (see Task 5's E2E step).
- `bot/**` is never modified. Only `bot/chat.js`'s `fetchChatReply` is reused, read-only (already required in `web/server.js` as `chatLib`). `bot/chat.js`'s `buildChatPrompt` is Discord-specific (雑談bot口調) and is NOT reused — a new Web-only prompt builder is created instead, the same way `web/lib/analysisPrompt.js` was created instead of reusing the Discord-flavored analysis prompt.
- Chat uses `fetchChatReply(prompt, apiKey, { webSearch: true })` — unlike the `/analyze` route's AI call, which uses `{ webSearch: false }`. This lets the AI look up information itself during a conversation.
- Conversation history persists in a new file, `web/data/chat-data.json`, separate from the existing `web/data/dashboard-data.json` (history/favorites). It lives in the same already-gitignored `web/data/` directory — no `.gitignore` change needed.
- Exactly one conversation per scope: one for `null`/`"standalone"`, and one per game appid. No multi-thread support.
- History cap is 30 messages per conversation (newest 30 kept, oldest dropped first) — a deliberately large increase over the Discord bot's `MAX_HISTORY = 6`, chosen because the whole history is re-embedded as prompt text on every call and unbounded growth would slow/cost more per message.
- If the AI call fails for any reason, the HTTP response still returns 200 with `reply` set to the fixed fallback text `'うまく返答を生成できなかった…'` (matching `bot/chat.js`'s existing fallback wording) — both the user's message and this fallback reply are still saved to history, so the conversation stays coherent. Client-side JS never needs to branch on HTTP status for this case.
- Messages longer than 2000 characters are truncated to the first 2000 characters before being used or stored (matches the existing bot's 2000-character reply cap). Empty (post-trim) messages are rejected with an HTTP 400 JSON error and never reach the AI or the history.
- No charting-library-style dependencies here — this is plain HTML/CSS/vanilla JS, matching the project's existing no-build-tooling philosophy as closely as an interactive feature allows.

---

## Task 1: `web/lib/chatStore.js` — chat conversation persistence

**Files:**
- Create: `web/lib/chatStore.js`
- Create: `web/lib/chatStore.test.js`

**Interfaces:**
- Consumes: nothing from other new files (only Node's built-in `fs`/`path`).
- Produces (consumed by Task 4's `server.js`):
  - `applyMessage(messages, entry, maxSize)` — pure. `messages` is `[{role, text, at}]`, `entry` is one such object, returns a new array with `entry` appended and trimmed to the last `maxSize` entries (oldest dropped first, chronological order preserved).
  - `getConversation(scope)` — `scope` is a Steam appid string, or `null`/`'standalone'` → returns `[{role, text, at}]` (always an array, `[]` if none exist).
  - `addMessage(scope, entry)` — appends `entry` to the given scope's conversation (via `applyMessage`, capped at 30) and persists it. Never throws.
  - `clearConversation(scope)` — empties the given scope's conversation and persists it. Never throws.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/chatStore.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyMessage } = require('./chatStore.js');

test('applyMessage appends the entry to the end of the list', () => {
  const result = applyMessage([{ role: 'user', text: 'a' }], { role: 'assistant', text: 'b' }, 30);
  assert.deepEqual(result, [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }]);
});

test('applyMessage trims to maxSize, dropping the oldest entries first', () => {
  const messages = [];
  for (let i = 0; i < 5; i++) messages.push({ role: 'user', text: 'm' + i });
  const result = applyMessage(messages, { role: 'user', text: 'new' }, 3);
  assert.deepEqual(result, [
    { role: 'user', text: 'm3' },
    { role: 'user', text: 'm4' },
    { role: 'user', text: 'new' }
  ]);
});

test('applyMessage works when starting from an empty list', () => {
  const result = applyMessage([], { role: 'user', text: 'first' }, 30);
  assert.deepEqual(result, [{ role: 'user', text: 'first' }]);
});

test('applyMessage does not mutate the input array', () => {
  const original = [{ role: 'user', text: 'a' }];
  applyMessage(original, { role: 'assistant', text: 'b' }, 30);
  assert.deepEqual(original, [{ role: 'user', text: 'a' }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/chatStore.test.js`
Expected: FAIL — `Cannot find module './chatStore.js'`

- [ ] **Step 3: Implement `web/lib/chatStore.js`**

```js
'use strict';
var fs = require('fs');
var path = require('path');

var DATA_DIR = path.join(__dirname, '..', 'data');
var DATA_FILE = path.join(DATA_DIR, 'chat-data.json');
var HISTORY_MAX_SIZE = 30;

function applyMessage(messages, entry, maxSize) {
  return messages.concat([entry]).slice(-maxSize);
}

function resolveKey(scope) {
  return (scope == null || scope === 'standalone') ? 'standalone' : String(scope);
}

function loadData() {
  try {
    var raw = fs.readFileSync(DATA_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    return {
      standalone: Array.isArray(parsed.standalone) ? parsed.standalone : [],
      byGame: (parsed.byGame && typeof parsed.byGame === 'object') ? parsed.byGame : {}
    };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('web dashboard chatStore: failed to load data:', e);
    }
    return { standalone: [], byGame: {} };
  }
}

function saveData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

function getConversation(scope) {
  var data = loadData();
  var key = resolveKey(scope);
  return key === 'standalone' ? data.standalone : (data.byGame[key] || []);
}

function addMessage(scope, entry) {
  try {
    var data = loadData();
    var key = resolveKey(scope);
    if (key === 'standalone') {
      data.standalone = applyMessage(data.standalone, entry, HISTORY_MAX_SIZE);
    } else {
      data.byGame[key] = applyMessage(data.byGame[key] || [], entry, HISTORY_MAX_SIZE);
    }
    saveData(data);
  } catch (e) {
    console.error('web dashboard chatStore: failed to add message:', e);
  }
}

function clearConversation(scope) {
  try {
    var data = loadData();
    var key = resolveKey(scope);
    if (key === 'standalone') {
      data.standalone = [];
    } else {
      delete data.byGame[key];
    }
    saveData(data);
  } catch (e) {
    console.error('web dashboard chatStore: failed to clear conversation:', e);
  }
}

module.exports = {
  applyMessage: applyMessage,
  getConversation: getConversation,
  addMessage: addMessage,
  clearConversation: clearConversation
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/chatStore.test.js`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/chatStore.js web/lib/chatStore.test.js
git commit -m "Add chat conversation persistence store"
```

---

## Task 2: `web/lib/chatPrompt.js` — chat AI prompt builder

**Files:**
- Create: `web/lib/chatPrompt.js`
- Create: `web/lib/chatPrompt.test.js`

**Interfaces:**
- Consumes: nothing from other new files.
- Produces (consumed by Task 4's `server.js`):
  - `buildChatPrompt(history, newMessage, gameContext)` — pure. `history` is `[{role: 'user'|'assistant', text}]`. `newMessage` is a string. `gameContext` is `{name, reviewSummaryText, categories}` or `null`/`undefined`. Returns the full prompt string to send to `fetchChatReply`.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/chatPrompt.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChatPrompt } = require('./chatPrompt.js');

test('buildChatPrompt renders history as ユーザー/AI lines followed by the new message', () => {
  const prompt = buildChatPrompt(
    [{ role: 'user', text: '前の質問' }, { role: 'assistant', text: '前の答え' }],
    '新しい質問',
    null
  );
  assert.match(prompt, /ユーザー: 前の質問/);
  assert.match(prompt, /AI: 前の答え/);
  assert.match(prompt, /ユーザー: 新しい質問/);
});

test('buildChatPrompt works with empty history', () => {
  const prompt = buildChatPrompt([], 'はじめまして', null);
  assert.match(prompt, /ユーザー: はじめまして/);
});

test('buildChatPrompt includes game context when provided', () => {
  const prompt = buildChatPrompt([], '質問', {
    name: 'Hollow Knight',
    reviewSummaryText: '95% (1,000件)',
    categories: ['シングルプレイヤー', 'コントローラー対応']
  });
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /95% \(1,000件\)/);
  assert.match(prompt, /シングルプレイヤー, コントローラー対応/);
});

test('buildChatPrompt omits the context section entirely when gameContext is null', () => {
  const prompt = buildChatPrompt([], '質問', null);
  assert.doesNotMatch(prompt, /というSteamゲーム/);
});

test('buildChatPrompt omits missing reviewSummaryText/categories gracefully', () => {
  const prompt = buildChatPrompt([], '質問', { name: 'Y', reviewSummaryText: null, categories: [] });
  assert.match(prompt, /「Y」というSteamゲーム/);
  assert.doesNotMatch(prompt, /レビュー評価: null/);
  assert.doesNotMatch(prompt, /タグ: /);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test lib/chatPrompt.test.js`
Expected: FAIL — `Cannot find module './chatPrompt.js'`

- [ ] **Step 3: Implement `web/lib/chatPrompt.js`**

```js
'use strict';

function buildContextLine(gameContext) {
  if (!gameContext) return '';
  var parts = ['「' + gameContext.name + '」というSteamゲームについての会話です。'];
  if (gameContext.reviewSummaryText) {
    parts.push('レビュー評価: ' + gameContext.reviewSummaryText + '。');
  }
  if (gameContext.categories && gameContext.categories.length) {
    parts.push('タグ: ' + gameContext.categories.join(', ') + '。');
  }
  return parts.join('') + '\n\n';
}

function buildChatPrompt(history, newMessage, gameContext) {
  var lines = (history || []).map(function (m) {
    return (m.role === 'assistant' ? 'AI' : 'ユーザー') + ': ' + m.text;
  });
  lines.push('ユーザー: ' + newMessage);
  return 'あなたはSteamゲームに詳しい、落ち着いた口調のアシスタントです。自然な日本語で会話に応じてください。\n\n'
    + buildContextLine(gameContext)
    + '会話:\n' + lines.join('\n') + '\nAI:';
}

module.exports = { buildChatPrompt: buildChatPrompt };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test lib/chatPrompt.test.js`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add web/lib/chatPrompt.js web/lib/chatPrompt.test.js
git commit -m "Add web-only chat prompt builder"
```

---

## Task 3: `web/views/chatWidget.js` — chat widget HTML rendering

**Files:**
- Create: `web/views/chatWidget.js`
- Create: `web/views/chatWidget.test.js`

**Interfaces:**
- Consumes: `html.escapeHtml(str)` from `web/lib/html.js` (existing).
- Produces (consumed by Task 4's `server.js`):
  - `renderChatWidget(scope, messages)` — `scope` is a Steam appid string or `null`. `messages` is `[{role, text, at}]` (from Task 1's `chatStore.getConversation`). Returns an HTML string: a `<section class="chat-widget" data-scope="...">` containing the message list, an input form (`class="chat-form"`, input `class="chat-input"`), and a clear button (`class="chat-clear"`).

- [ ] **Step 1: Write the failing tests**

Create `web/views/chatWidget.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderChatWidget } = require('./chatWidget.js');

test('renderChatWidget shows an empty-state message when there are no messages', () => {
  const html = renderChatWidget(null, []);
  assert.match(html, /まだ会話がありません/);
});

test('renderChatWidget renders user and assistant messages with distinct classes', () => {
  const html = renderChatWidget(null, [
    { role: 'user', text: 'こんにちは' },
    { role: 'assistant', text: 'やあ' }
  ]);
  assert.match(html, /class="chat-message chat-message-user">こんにちは/);
  assert.match(html, /class="chat-message chat-message-assistant">やあ/);
});

test('renderChatWidget escapes message text', () => {
  const html = renderChatWidget(null, [{ role: 'user', text: '<script>alert(1)</script>' }]);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('renderChatWidget sets data-scope to the given appid', () => {
  const html = renderChatWidget('367520', []);
  assert.match(html, /data-scope="367520"/);
});

test('renderChatWidget sets an empty data-scope when scope is null', () => {
  const html = renderChatWidget(null, []);
  assert.match(html, /data-scope=""/);
});

test('renderChatWidget includes a form and a clear button', () => {
  const html = renderChatWidget(null, []);
  assert.match(html, /class="chat-form"/);
  assert.match(html, /class="chat-clear"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test views/chatWidget.test.js`
Expected: FAIL — `Cannot find module './chatWidget.js'`

- [ ] **Step 3: Implement `web/views/chatWidget.js`**

```js
'use strict';
var html = require('../lib/html.js');

function renderMessage(m) {
  var roleClass = m.role === 'assistant' ? 'chat-message-assistant' : 'chat-message-user';
  return '<div class="chat-message ' + roleClass + '">' + html.escapeHtml(m.text) + '</div>';
}

function renderChatWidget(scope, messages) {
  messages = messages || [];
  var scopeAttr = html.escapeHtml(scope == null ? '' : scope);
  var body = messages.length
    ? messages.map(renderMessage).join('')
    : '<p class="empty">まだ会話がありません。</p>';
  return '<section class="chat-widget" data-scope="' + scopeAttr + '">'
    + '<div class="chat-messages">' + body + '</div>'
    + '<form class="chat-form">'
    + '<input type="text" class="chat-input" placeholder="メッセージを入力" required>'
    + '<button type="submit">送信</button>'
    + '</form>'
    + '<button type="button" class="chat-clear">会話をクリア</button>'
    + '</section>';
}

module.exports = { renderChatWidget: renderChatWidget };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test views/chatWidget.test.js`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add web/views/chatWidget.js web/views/chatWidget.test.js
git commit -m "Add chat widget HTML rendering"
```

---

## Task 4: `web/server.js` — chat routes and page wiring

**Files:**
- Modify: `web/server.js`

**Interfaces:**
- Consumes: `chatStore.getConversation/addMessage/clearConversation` (Task 1), `chatPrompt.buildChatPrompt` (Task 2), `chatWidget.renderChatWidget` (Task 3), `chatLib.fetchChatReply` (existing, `bot/chat.js`, already required as `chatLib`), `steamLib.fetchPriceDetail/fetchReviewSummary/fetchGameContext` (existing, already required as `steamLib`).
- Produces: `POST /chat/message` and `POST /chat/clear` JSON routes; `GET /` and `GET /analyze` now embed the chat widget in their rendered HTML.

This task has no new automated tests, matching this codebase's existing convention that `server.js` route handlers are untested (only the pure functions they call are tested).

- [ ] **Step 1: Add the new requires**

In `web/server.js`, add these lines after the existing `var topPage = require('./views/topPage.js');` (line 14):

```js
var chatStore = require('./lib/chatStore.js');
var chatPrompt = require('./lib/chatPrompt.js');
var chatWidget = require('./views/chatWidget.js');
```

- [ ] **Step 2: Add the JSON body-parser middleware**

Change:

```js
app.use(authLib.createBasicAuthMiddleware(process.env.WEB_DASHBOARD_USER, process.env.WEB_DASHBOARD_PASS));
app.use(express.urlencoded({ extended: false }));
```

to:

```js
app.use(authLib.createBasicAuthMiddleware(process.env.WEB_DASHBOARD_USER, process.env.WEB_DASHBOARD_PASS));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
```

- [ ] **Step 3: Embed the standalone chat widget on the top page**

Change:

```js
app.get('/', function (req, res) {
  var body = topPage.renderTopPage({ history: store.getHistory(), favorites: store.getFavorites() });
  res.send(layout.renderLayout(body, {}));
});
```

to:

```js
app.get('/', function (req, res) {
  var body = topPage.renderTopPage({ history: store.getHistory(), favorites: store.getFavorites() })
    + chatWidget.renderChatWidget(null, chatStore.getConversation(null));
  res.send(layout.renderLayout(body, {}));
});
```

- [ ] **Step 4: Embed the game-scoped chat widget on the analysis page**

Change:

```js
    var vm = viewModel.buildAnalysisViewModel(result);
    var body = analysisPage.renderAnalysisPage(vm);
    res.send(layout.renderLayout(body, { query: name }));
```

to:

```js
    var vm = viewModel.buildAnalysisViewModel(result);
    var body = analysisPage.renderAnalysisPage(vm);
    if (result.found) {
      body += chatWidget.renderChatWidget(vm.appid, chatStore.getConversation(vm.appid));
    }
    res.send(layout.renderLayout(body, { query: name }));
```

- [ ] **Step 5: Add the chat routes**

Add this code right after the `app.get('/analyze', ...)` block closes (before `app.post('/favorites/add', ...)`):

```js
async function buildChatGameContext(appid) {
  try {
    var results = await Promise.all([
      steamLib.fetchPriceDetail(appid),
      steamLib.fetchReviewSummary(appid),
      steamLib.fetchGameContext(appid)
    ]);
    var priceDetail = results[0];
    var reviewSummary = results[1];
    var context = results[2];
    if (!priceDetail) return null;
    return {
      name: priceDetail.name,
      reviewSummaryText: reviewSummary ? (reviewSummary.positivePct + '% (' + reviewSummary.totalReviews.toLocaleString() + '件)') : null,
      categories: context ? context.categories : []
    };
  } catch (e) {
    return null;
  }
}

app.post('/chat/message', async function (req, res) {
  try {
    var scope = (typeof req.body.scope === 'string' && req.body.scope) ? req.body.scope : null;
    var rawMessage = typeof req.body.message === 'string' ? req.body.message : '';
    var message = rawMessage.trim().slice(0, 2000);
    if (!message) {
      res.status(400).json({ error: 'empty message' });
      return;
    }

    var gameContext = scope ? await buildChatGameContext(scope) : null;
    var history = chatStore.getConversation(scope);
    var prompt = chatPrompt.buildChatPrompt(history, message, gameContext);

    var reply;
    try {
      reply = await chatLib.fetchChatReply(prompt, process.env.ONEMIN_API_KEY, { webSearch: true });
    } catch (e) {
      reply = '';
    }
    if (!reply) reply = 'うまく返答を生成できなかった…';

    var now = Date.now();
    chatStore.addMessage(scope, { role: 'user', text: message, at: now });
    chatStore.addMessage(scope, { role: 'assistant', text: reply, at: now });

    res.json({ reply: reply });
  } catch (e) {
    console.error('/chat/message failed:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

app.post('/chat/clear', function (req, res) {
  var scope = (typeof req.body.scope === 'string' && req.body.scope) ? req.body.scope : null;
  chatStore.clearConversation(scope);
  res.json({ ok: true });
});
```

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

Run: `cd web && node --test`
Expected: PASS — all existing tests still green (this file has no dedicated tests, but confirm nothing else broke)

- [ ] **Step 7: Commit**

```bash
git add web/server.js
git commit -m "Add chat routes and embed the chat widget on the top and analysis pages"
```

---

## Task 5: `web/views/layout.js` — chat styling, client-side JS, and end-to-end verification

**Files:**
- Modify: `web/views/layout.js`
- Modify: `web/views/layout.test.js`

**Interfaces:**
- Consumes: nothing new (pure CSS/JS additions to the existing layout wrapper).
- Produces: the chat widgets rendered by Task 3/embedded by Task 4 become visually styled and interactive in the browser.

- [ ] **Step 1: Write the failing tests**

In `web/views/layout.test.js`, add:

```js
test('renderLayout includes chat widget styling', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.chat-widget\{/);
  assert.match(page, /\.chat-message-user\{/);
  assert.match(page, /\.chat-message-assistant\{/);
});

test('renderLayout excludes chat forms from the full-page loading overlay', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /form:not\(\.chat-form\)/);
});

test('renderLayout wires chat widgets to POST /chat/message and /chat/clear via fetch', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /fetch\("\/chat\/message"/);
  assert.match(page, /fetch\("\/chat\/clear"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test views/layout.test.js`
Expected: FAIL — none of the new CSS/script content exists yet

- [ ] **Step 3: Implement the changes**

In `web/views/layout.js`, add to the CSS string (after `.similar-games th,.similar-games td{padding:4px 8px;text-align:left;border-bottom:1px solid #2a3f5a}'`):

```js
    + '.chat-widget{margin-top:16px;background:#2a3f5a;padding:12px;border-radius:8px}'
    + '.chat-messages{display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;margin-bottom:8px}'
    + '.chat-message{padding:8px 12px;border-radius:8px;max-width:85%;white-space:pre-wrap}'
    + '.chat-message-user{align-self:flex-end;background:#66c0f4;color:#1b2838}'
    + '.chat-message-assistant{align-self:flex-start;background:#1b2838}'
    + '.chat-form{display:flex;gap:8px}'
    + '.chat-input{flex:1;padding:8px;border-radius:4px;border:none;min-height:44px;font-size:16px}'
    + '.chat-form button{padding:8px 16px;border-radius:4px;border:none;background:#66c0f4;cursor:pointer;min-height:44px;font-size:16px}'
    + '.chat-clear{margin-top:8px;padding:8px 16px;border-radius:4px;border:1px solid #66c0f4;background:none;color:#66c0f4;cursor:pointer;min-height:44px;font-size:14px}'
```

Then replace the entire existing `<script>...</script>` block:

```js
    + '<script>'
    + 'document.querySelectorAll("form").forEach(function(form){'
    + 'form.addEventListener("submit",function(){'
    + 'document.body.classList.add("loading");'
    + 'var btn=this.querySelector("button");'
    + 'if(btn){btn.disabled=true;}'
    + '});'
    + '});'
    + '</script>'
```

with:

```js
    + '<script>'
    + 'document.querySelectorAll("form:not(.chat-form)").forEach(function(form){'
    + 'form.addEventListener("submit",function(){'
    + 'document.body.classList.add("loading");'
    + 'var btn=this.querySelector("button");'
    + 'if(btn){btn.disabled=true;}'
    + '});'
    + '});'
    + 'document.querySelectorAll(".chat-widget").forEach(function(widget){'
    + 'var scope=widget.getAttribute("data-scope")||null;'
    + 'var messagesEl=widget.querySelector(".chat-messages");'
    + 'var form=widget.querySelector(".chat-form");'
    + 'var input=widget.querySelector(".chat-input");'
    + 'var clearBtn=widget.querySelector(".chat-clear");'
    + 'function addBubble(role,text){'
    + 'var empty=messagesEl.querySelector(".empty");'
    + 'if(empty){empty.remove();}'
    + 'var div=document.createElement("div");'
    + 'div.className="chat-message chat-message-"+role;'
    + 'div.textContent=text;'
    + 'messagesEl.appendChild(div);'
    + 'messagesEl.scrollTop=messagesEl.scrollHeight;'
    + 'return div;'
    + '}'
    + 'form.addEventListener("submit",function(e){'
    + 'e.preventDefault();'
    + 'var message=input.value.trim();'
    + 'if(!message){return;}'
    + 'addBubble("user",message);'
    + 'input.value="";'
    + 'var submitBtn=form.querySelector("button");'
    + 'input.disabled=true;'
    + 'if(submitBtn){submitBtn.disabled=true;}'
    + 'var loadingBubble=addBubble("assistant","…");'
    + 'fetch("/chat/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scope:scope,message:message})})'
    + '.then(function(r){return r.json();})'
    + '.then(function(d){loadingBubble.textContent=d.reply||"うまく返答を生成できなかった…";})'
    + '.catch(function(){loadingBubble.textContent="通信エラーが発生しました";})'
    + '.finally(function(){input.disabled=false;if(submitBtn){submitBtn.disabled=false;}input.focus();});'
    + '});'
    + 'clearBtn.addEventListener("click",function(){'
    + 'fetch("/chat/clear",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scope:scope})})'
    + '.then(function(){messagesEl.innerHTML="";var p=document.createElement("p");p.className="empty";p.textContent="まだ会話がありません。";messagesEl.appendChild(p);});'
    + '});'
    + '});'
    + '</script>'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test`
Expected: PASS — all tests green (this touches the shared layout file, so run the full suite)

- [ ] **Step 5: Commit**

```bash
git add web/views/layout.js web/views/layout.test.js
git commit -m "Add chat widget styling and client-side fetch-based chat interaction"
```

- [ ] **Step 6: Manual end-to-end verification with real data**

`web/.env` already has a working `ONEMIN_API_KEY`, so the full AI chat round-trip can be exercised locally.

```bash
cd web
set -a && source .env && set +a
PORT=3104 node server.js &
sleep 1

# Standalone chat: send a message
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" -X POST -H "Content-Type: application/json" \
  -d '{"scope":null,"message":"こんにちは"}' http://127.0.0.1:3104/chat/message

# Confirm it persisted and shows up on reload
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" http://127.0.0.1:3104/ | grep -o 'class="chat-message chat-message-user">[^<]*'

# Game-scoped chat: send a message scoped to a real appid (Hollow Knight)
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" -X POST -H "Content-Type: application/json" \
  -d '{"scope":"367520","message":"このゲームの魅力は?"}' http://127.0.0.1:3104/chat/message

curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" "http://127.0.0.1:3104/analyze?name=Hollow%20Knight" | grep -o 'class="chat-widget" data-scope="[^"]*"'

# Clear both conversations
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" -X POST -H "Content-Type: application/json" -d '{"scope":null}' http://127.0.0.1:3104/chat/clear
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" -X POST -H "Content-Type: application/json" -d '{"scope":"367520"}' http://127.0.0.1:3104/chat/clear
curl -s -u "$WEB_DASHBOARD_USER:$WEB_DASHBOARD_PASS" http://127.0.0.1:3104/ | grep -o 'まだ会話がありません'

kill %1
```

Expected: the first `/chat/message` call returns a JSON `{"reply": "..."}` with non-empty text; the standalone reply appears embedded in `GET /` afterward; the game-scoped `/chat/message` call also succeeds and `GET /analyze?name=Hollow%20Knight` shows `class="chat-widget" data-scope="367520"` (or whatever appid Hollow Knight actually resolves to — report the real value seen); after clearing both, `GET /` shows the empty-state text again. Report exactly what came back either way. If `web/data/chat-data.json` didn't exist before this step, delete it afterward to avoid polluting local state.

- [ ] **Step 7: If verification revealed any bug, fix and re-verify**

If the manual verification in Step 6 surfaces a real defect (not just "the AI's reply was generic" — that's expected AI behavior, not a bug), fix it, re-run the full test suite, and re-run the specific `curl` check that failed. Commit the fix separately with a description of what was wrong.

---

## Self-Review Notes

- **Spec coverage:** shared chat engine for both scopes (Tasks 1-4), fetch-based async UX (Task 5), server-side JSON persistence (Task 1), single-conversation-per-scope (Task 1's `resolveKey`), game context injection (Task 4's `buildChatGameContext`), AI web search enabled (Task 4's `{webSearch: true}`), 30-message history cap (Task 1's `HISTORY_MAX_SIZE`), graceful AI-failure fallback (Task 4), message length/emptiness validation (Task 4). All spec decisions have a task.
- **Type consistency:** `chatStore.getConversation(scope)`/`addMessage(scope, entry)`/`clearConversation(scope)` (Task 1) are called identically from `server.js` (Task 4). `chatPrompt.buildChatPrompt(history, newMessage, gameContext)` (Task 2) is called with exactly `(chatStore.getConversation(scope), message, gameContext)` from Task 4, matching parameter order and shape. `chatWidget.renderChatWidget(scope, messages)` (Task 3) is called with `(null, chatStore.getConversation(null))` and `(vm.appid, chatStore.getConversation(vm.appid))` from Task 4 — both matching the `(scope, messages)` signature. The `{role, text}` message shape is consistent across all three modules and the client-side JS's request/response bodies.
- **A real interface hazard caught during planning:** the existing `layout.js` inline script bound the full-page "分析中…" loading overlay to *every* form's submit event. Left unchanged, submitting the new chat form would have triggered that overlay and never dismissed it (since the chat form never navigates away). Task 5 explicitly changes the selector to `form:not(.chat-form)` and gives the chat widget its own lightweight per-message loading bubble instead — this is called out here so it isn't missed as "just a CSS addition."
- **No placeholders:** every step has complete, runnable code, including the full client-side JS (no "TODO: add fetch logic").
- **Consistency with prior work in this codebase:** repeats the pure/I/O split and the sync-`fs`-JSON-file persistence pattern established by `web/lib/store.js`, and — like the previous (charts) plan — bakes CSS and behavior into the same task that introduces the markup, rather than deferring it.
