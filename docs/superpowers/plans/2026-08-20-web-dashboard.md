# Webダッシュボード(ゲーム分析v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ゲーム名を検索してSteam公開データ+AI分析(判定/カテゴリ星評価/良い点悪い点/向いてる人)をブラウザで見られる、Basic認証+Tailscaleで秘匿された個人用Webダッシュボードを新設する。

**Architecture:** 新規トップレベル`web/`フォルダにExpress常駐プロセスを追加。`bot/lib/steam.js`・`bot/chat.js`・`bot/commands/review.js`の既存の純粋関数をrequireで読み取り専用再利用し、ロジックを二重管理しない。ビルド工程なしのサーバーサイドレンダリング(素のHTML文字列組み立て)。

**Tech Stack:** Node.js (CommonJS, `var`ベースのES5寄りスタイル、既存コードベースに合わせる) + Express + `node:test`(標準テストランナー)。新規依存はexpressのみ。

**Spec:** `docs/superpowers/specs/2026-08-20-web-dashboard-design.md`

## Global Constraints

- `scripts/*.js`・`bot/**`のファイルは一切変更しない(読み取り専用でrequireするのみ)
- AIモデルは`qwen3-8b`固定(`bot/chat.js`の`fetchChatReply`がすでにこの制約を持つ、web側で変更しない)
- コードスタイルは既存`bot/`と同じ`'use strict'` + `var` + CommonJS `require`/`module.exports`に統一する(`let`/`const`/アロー関数/importは使わない)
- 純粋関数(HTML組み立て・データ整形・認証情報比較)は`node:test`でTDDユニットテスト必須。I/O層(Expressルートハンドラ、外部API呼び出しの組み立て関数)は既存`bot/`の`handleXCommand`系と同じく自動テスト対象外、手動確認で代替する
- 新規依存は`express`のみ。ビルドツール・テンプレートエンジン・フロントエンドフレームワークは追加しない
- 環境変数はsystemdの`EnvironmentFile`で渡す方針を踏襲する(`dotenv`パッケージは追加しない、既存`bot/`もdotenv未使用)

---

## Task 1: web/プロジェクトの雛形とヘルスチェック起動

**Files:**
- Create: `web/package.json`
- Create: `web/server.js`
- Create: `web/.gitignore`(既にルートの`.gitignore`が`node_modules/`と`.env`を全体カバー済みのため、実は不要 — 作成しない)

**Interfaces:**
- Produces: `web/server.js`が`GET /healthz`で`200 OK`を返すExpressアプリ。後続タスクがこのファイルにルートを追記していく

- [ ] **Step 1: package.jsonを作成**

`web/package.json`:
```json
{
  "name": "steam-web-dashboard",
  "version": "1.0.0",
  "private": true,
  "description": "Steamゲーム分析Webダッシュボード(個人用)",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.19.0"
  }
}
```

- [ ] **Step 2: 依存をインストール**

Run: `cd web && npm install`
Expected: `node_modules/`と`package-lock.json`が生成される(どちらもルートの`.gitignore`で`node_modules/`はコミット対象外、`package-lock.json`はコミットする)

- [ ] **Step 3: 最小のserver.jsを作成**

`web/server.js`:
```js
'use strict';
var express = require('express');

var PORT = process.env.PORT || 3000;
var HOST = process.env.BIND_HOST || '127.0.0.1';

var app = express();

app.get('/healthz', function (req, res) {
  res.type('text/plain').send('ok');
});

if (require.main === module) {
  app.listen(PORT, HOST, function () {
    console.log('web dashboard listening on ' + HOST + ':' + PORT);
  });
}

module.exports = { app: app };
```

- [ ] **Step 4: 手動起動確認**

Run: `cd web && node server.js`
別ターミナルで: `curl http://127.0.0.1:3000/healthz`
Expected: `ok`が返る。確認後Ctrl+Cでプロセス停止

- [ ] **Step 5: コミット**

```bash
git add web/package.json web/package-lock.json web/server.js
git commit -m "Scaffold web dashboard project with health check route"
```

---

## Task 2: HTMLエスケープ関数

**Files:**
- Create: `web/lib/html.js`
- Test: `web/lib/html.test.js`

**Interfaces:**
- Produces: `escapeHtml(str)` — 任意の値を受け取り、HTML特殊文字(`& < > " '`)をエスケープした文字列を返す純粋関数。`null`/`undefined`は空文字列として扱う

- [ ] **Step 1: 失敗するテストを書く**

`web/lib/html.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml } = require('./html.js');

test('escapeHtml escapes html special characters', () => {
  assert.equal(escapeHtml('<script>alert("hi")</script>'), '&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;');
});

test('escapeHtml escapes ampersand and single quote', () => {
  assert.equal(escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
});

test('escapeHtml treats null/undefined as empty string', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml passes through plain text unchanged', () => {
  assert.equal(escapeHtml('Hollow Knight'), 'Hollow Knight');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd web && node --test lib/html.test.js`
Expected: FAIL、`Cannot find module './html.js'`

- [ ] **Step 3: 実装**

`web/lib/html.js`:
```js
'use strict';

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml: escapeHtml };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd web && node --test lib/html.test.js`
Expected: PASS(4件)

- [ ] **Step 5: コミット**

```bash
git add web/lib/html.js web/lib/html.test.js
git commit -m "Add escapeHtml helper for web dashboard"
```

---

## Task 3: Basic認証の認証情報チェック関数

**Files:**
- Create: `web/lib/auth.js`
- Test: `web/lib/auth.test.js`

**Interfaces:**
- Produces: `checkCredentials(user, pass, expectedUser, expectedPass)` — 4引数がすべて一致した場合のみ`true`を返す純粋関数。`createBasicAuthMiddleware(expectedUser, expectedPass)` — `checkCredentials`を使うExpressミドルウェアを返すファクトリ関数(I/O、自動テスト対象外)

- [ ] **Step 1: 失敗するテストを書く**

`web/lib/auth.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCredentials } = require('./auth.js');

test('checkCredentials returns true when user and pass match', () => {
  assert.equal(checkCredentials('raito', 'himitsu', 'raito', 'himitsu'), true);
});

test('checkCredentials returns false when password does not match', () => {
  assert.equal(checkCredentials('raito', 'wrong', 'raito', 'himitsu'), false);
});

test('checkCredentials returns false when user does not match', () => {
  assert.equal(checkCredentials('other', 'himitsu', 'raito', 'himitsu'), false);
});

test('checkCredentials returns false when given non-string input', () => {
  assert.equal(checkCredentials(undefined, undefined, 'raito', 'himitsu'), false);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd web && node --test lib/auth.test.js`
Expected: FAIL、`Cannot find module './auth.js'`

- [ ] **Step 3: 実装**

`web/lib/auth.js`:
```js
'use strict';

function checkCredentials(user, pass, expectedUser, expectedPass) {
  return typeof user === 'string' && typeof pass === 'string'
    && user === expectedUser && pass === expectedPass;
}

function parseBasicAuthHeader(header) {
  var match = /^Basic (.+)$/.exec(header || '');
  if (!match) return null;
  var decoded = Buffer.from(match[1], 'base64').toString('utf8');
  var sep = decoded.indexOf(':');
  if (sep === -1) return { user: decoded, pass: '' };
  return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
}

function createBasicAuthMiddleware(expectedUser, expectedPass) {
  return function (req, res, next) {
    var creds = parseBasicAuthHeader(req.headers.authorization);
    if (creds && checkCredentials(creds.user, creds.pass, expectedUser, expectedPass)) {
      next();
      return;
    }
    res.set('WWW-Authenticate', 'Basic realm="dashboard"');
    res.status(401).send('Authentication required');
  };
}

module.exports = {
  checkCredentials: checkCredentials,
  createBasicAuthMiddleware: createBasicAuthMiddleware
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd web && node --test lib/auth.test.js`
Expected: PASS(4件)

- [ ] **Step 5: コミット**

```bash
git add web/lib/auth.js web/lib/auth.test.js
git commit -m "Add HTTP Basic Auth credential check for web dashboard"
```

---

## Task 4: 共通レイアウト(検索フォーム込み)

**Files:**
- Create: `web/views/layout.js`
- Test: `web/views/layout.test.js`

**Interfaces:**
- Consumes: `escapeHtml(str)` from `web/lib/html.js`(Task 2)
- Produces: `renderLayout(bodyHtml, opts)` — `bodyHtml`(文字列)を`<main>`内に埋め込んだ完全なHTMLページ文字列を返す純粋関数。`opts.query`(省略可、文字列)が渡された場合は検索ボックスの初期値としてエスケープして埋め込む

- [ ] **Step 1: 失敗するテストを書く**

`web/views/layout.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderLayout } = require('./layout.js');

test('renderLayout embeds the body html inside the page', () => {
  const page = renderLayout('<p>hello</p>', {});
  assert.match(page, /<p>hello<\/p>/);
  assert.match(page, /<!doctype html>/i);
});

test('renderLayout includes a search form pointing at /analyze', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /action="\/analyze"/);
  assert.match(page, /name="name"/);
});

test('renderLayout escapes the query value in the search box', () => {
  const page = renderLayout('<p>x</p>', { query: '<script>' });
  assert.doesNotMatch(page, /value="<script>"/);
  assert.match(page, /value="&lt;script&gt;"/);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd web && node --test views/layout.test.js`
Expected: FAIL、`Cannot find module './layout.js'`

- [ ] **Step 3: 実装**

`web/views/layout.js`:
```js
'use strict';
var html = require('../lib/html.js');

function renderLayout(bodyHtml, opts) {
  opts = opts || {};
  var query = opts.query || '';
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Steamゲーム分析</title>'
    + '<style>'
    + 'body{font-family:sans-serif;max-width:720px;margin:0 auto;padding:16px;background:#1b2838;color:#c7d5e0}'
    + 'a{color:#66c0f4}'
    + '.search-form{display:flex;gap:8px;margin:16px 0}'
    + '.search-form input{flex:1;padding:8px;border-radius:4px;border:none}'
    + '.search-form button{padding:8px 16px;border-radius:4px;border:none;background:#66c0f4;cursor:pointer}'
    + '.game-card{background:#2a3f5a;padding:16px;border-radius:8px}'
    + '.orig{text-decoration:line-through;opacity:0.6}'
    + '</style></head><body>'
    + '<header><h1>🎮 Steamゲーム分析</h1>'
    + '<form method="GET" action="/analyze" class="search-form">'
    + '<input type="text" name="name" placeholder="ゲーム名で検索" value="' + html.escapeHtml(query) + '" required>'
    + '<button type="submit">分析する</button>'
    + '</form></header>'
    + '<main>' + bodyHtml + '</main>'
    + '</body></html>';
}

module.exports = { renderLayout: renderLayout };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd web && node --test views/layout.test.js`
Expected: PASS(3件)

- [ ] **Step 5: コミット**

```bash
git add web/views/layout.js web/views/layout.test.js
git commit -m "Add shared layout with search form for web dashboard"
```

---

## Task 5: 分析結果の表示用データ整形(ビューモデル)

**Files:**
- Create: `web/lib/viewModel.js`
- Test: `web/lib/viewModel.test.js`

**Interfaces:**
- Produces: `buildAnalysisViewModel(result)` — 後述Task 7の`fetchGameAnalysis`が返す形と同じ形の`result`オブジェクトを受け取り、表示用に整形したビューモデルを返す純粋関数。
  - 入力`result`の形: `{ found: {id, name} | null, priceDetail: {finalPrice, originalPrice, discountPercent} | null, reviewSummary: {positivePct, totalReviews} | null, gameContext: {genres: string[], categories: string[]} | null, analysis: {verdict, reason, categories: [{name, stars}], pros: string[], cons: string[], audienceFor: string[], audienceAgainst: string[]} | null }`(`bot/commands/review.js`の`parseAnalysis`が返すJSON構造と同じ)
  - 戻り値の形: `found:false`の場合は`{ notFound: true }`のみ。見つかった場合は`{ notFound: false, name, appid, priceHtml, reviewSummaryText, genres, categories, analysis: {verdict, reason, categoryLines: [{name, stars}], pros, cons, audienceFor, audienceAgainst} | null }`(`categoryLines`の`stars`は`★★★☆☆`形式の文字列)

- [ ] **Step 1: 失敗するテストを書く**

`web/lib/viewModel.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnalysisViewModel } = require('./viewModel.js');

test('buildAnalysisViewModel marks notFound when no game matched', () => {
  const vm = buildAnalysisViewModel({ found: null });
  assert.equal(vm.notFound, true);
});

test('buildAnalysisViewModel formats a free game price', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Free Game' },
    priceDetail: { finalPrice: 0, originalPrice: 0, discountPercent: 0 },
    reviewSummary: null,
    gameContext: null,
    analysis: null
  });
  assert.equal(vm.notFound, false);
  assert.equal(vm.priceHtml, '無料');
});

test('buildAnalysisViewModel formats a discounted price with strikethrough', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Sale Game' },
    priceDetail: { finalPrice: 1000, originalPrice: 2000, discountPercent: 50 },
    reviewSummary: null,
    gameContext: null,
    analysis: null
  });
  assert.match(vm.priceHtml, /¥2,000/);
  assert.match(vm.priceHtml, /¥1,000/);
  assert.match(vm.priceHtml, /-50%/);
});

test('buildAnalysisViewModel shows no-price message when priceDetail is null', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'No Price Game' },
    priceDetail: null,
    reviewSummary: null,
    gameContext: null,
    analysis: null
  });
  assert.equal(vm.priceHtml, '価格情報なし');
});

test('buildAnalysisViewModel formats review summary text', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Reviewed Game' },
    priceDetail: null,
    reviewSummary: { positivePct: 92, totalReviews: 1500 },
    gameContext: null,
    analysis: null
  });
  assert.equal(vm.reviewSummaryText, '92% (1,500件)');
});

test('buildAnalysisViewModel leaves analysis null when not provided', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'No Analysis Game' },
    priceDetail: null,
    reviewSummary: null,
    gameContext: null,
    analysis: null
  });
  assert.equal(vm.analysis, null);
});

test('buildAnalysisViewModel converts analysis categories into star strings', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Analyzed Game' },
    priceDetail: null,
    reviewSummary: null,
    gameContext: null,
    analysis: {
      verdict: '買い',
      reason: '安定して面白い',
      categories: [{ name: 'ゲームプレイ', stars: 4 }, { name: 'ストーリー', stars: null }],
      pros: ['操作感が良い'],
      cons: ['ボリューム不足'],
      audienceFor: ['アクション好き'],
      audienceAgainst: []
    }
  });
  assert.equal(vm.analysis.verdict, '買い');
  assert.deepEqual(vm.analysis.categoryLines, [{ name: 'ゲームプレイ', stars: '★★★★☆' }]);
  assert.deepEqual(vm.analysis.pros, ['操作感が良い']);
  assert.deepEqual(vm.analysis.audienceAgainst, []);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd web && node --test lib/viewModel.test.js`
Expected: FAIL、`Cannot find module './viewModel.js'`

- [ ] **Step 3: 実装**

`web/lib/viewModel.js`:
```js
'use strict';

function starsLine(stars) {
  var n = Math.max(0, Math.min(5, stars || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function formatPriceHtml(detail) {
  if (!detail) return '価格情報なし';
  if (detail.finalPrice === 0) return '無料';
  if (detail.discountPercent > 0) {
    return '<span class="orig">¥' + detail.originalPrice.toLocaleString() + '</span> → <strong>¥'
      + detail.finalPrice.toLocaleString() + '</strong> (-' + detail.discountPercent + '%)';
  }
  return '¥' + detail.finalPrice.toLocaleString();
}

function buildAnalysisViewModel(result) {
  if (!result.found) {
    return { notFound: true };
  }

  var vm = {
    notFound: false,
    name: result.found.name,
    appid: result.found.id,
    priceHtml: formatPriceHtml(result.priceDetail),
    reviewSummaryText: result.reviewSummary
      ? result.reviewSummary.positivePct + '% (' + result.reviewSummary.totalReviews.toLocaleString() + '件)'
      : 'レビュー情報なし',
    genres: (result.gameContext && result.gameContext.genres) || [],
    categories: (result.gameContext && result.gameContext.categories) || [],
    analysis: null
  };

  if (result.analysis) {
    var a = result.analysis;
    vm.analysis = {
      verdict: a.verdict || '判定不明',
      reason: a.reason || '',
      categoryLines: (a.categories || [])
        .filter(function (c) { return c && typeof c.stars === 'number'; })
        .map(function (c) { return { name: c.name, stars: starsLine(c.stars) }; }),
      pros: a.pros || [],
      cons: a.cons || [],
      audienceFor: a.audienceFor || [],
      audienceAgainst: a.audienceAgainst || []
    };
  }

  return vm;
}

module.exports = { buildAnalysisViewModel: buildAnalysisViewModel };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd web && node --test lib/viewModel.test.js`
Expected: PASS(7件)

- [ ] **Step 5: コミット**

```bash
git add web/lib/viewModel.js web/lib/viewModel.test.js
git commit -m "Add analysis view model builder for web dashboard"
```

---

## Task 6: 分析結果ページのHTML組み立て

**Files:**
- Create: `web/views/analysisPage.js`
- Test: `web/views/analysisPage.test.js`

**Interfaces:**
- Consumes: `escapeHtml(str)` from `web/lib/html.js`(Task 2)。ビューモデルの形はTask 5の`buildAnalysisViewModel`の戻り値と同じ
- Produces: `renderAnalysisPage(viewModel)` — ビューモデルを受け取り`<main>`に埋め込む本文HTML文字列を返す純粋関数

- [ ] **Step 1: 失敗するテストを書く**

`web/views/analysisPage.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderAnalysisPage } = require('./analysisPage.js');

test('renderAnalysisPage shows a not-found message', () => {
  const html = renderAnalysisPage({ notFound: true });
  assert.match(html, /見つからなかった/);
});

test('renderAnalysisPage shows the game name, price, and review summary', () => {
  const html = renderAnalysisPage({
    notFound: false,
    name: 'Hollow Knight',
    appid: '367520',
    priceHtml: '¥1,500',
    reviewSummaryText: '96% (10,000件)',
    genres: ['アクション'],
    categories: [],
    analysis: null
  });
  assert.match(html, /Hollow Knight/);
  assert.match(html, /¥1,500/);
  assert.match(html, /96% \(10,000件\)/);
  assert.match(html, /アクション/);
});

test('renderAnalysisPage shows an unavailable message when analysis is null', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null
  });
  assert.match(html, /AI分析は利用できませんでした/);
});

test('renderAnalysisPage renders verdict, category stars, pros, and cons', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [],
    analysis: {
      verdict: '買い',
      reason: '面白い',
      categoryLines: [{ name: 'ゲームプレイ', stars: '★★★★☆' }],
      pros: ['操作感が良い'],
      cons: ['ボリューム不足'],
      audienceFor: ['アクション好き'],
      audienceAgainst: []
    }
  });
  assert.match(html, /買い/);
  assert.match(html, /★★★★☆/);
  assert.match(html, /操作感が良い/);
  assert.match(html, /ボリューム不足/);
  assert.match(html, /アクション好き/);
});

test('renderAnalysisPage escapes the game name', () => {
  const html = renderAnalysisPage({
    notFound: false, name: '<script>alert(1)</script>', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null
  });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd web && node --test views/analysisPage.test.js`
Expected: FAIL、`Cannot find module './analysisPage.js'`

- [ ] **Step 3: 実装**

`web/views/analysisPage.js`:
```js
'use strict';
var html = require('../lib/html.js');

function renderAnalysisPage(vm) {
  if (vm.notFound) {
    return '<p class="not-found">見つからなかった…</p>';
  }

  var parts = [];
  parts.push('<article class="game-card">');
  parts.push('<h2>' + html.escapeHtml(vm.name) + '</h2>');
  parts.push('<p class="price">💴 ' + vm.priceHtml + '</p>');
  parts.push('<p class="reviews">💬 ' + html.escapeHtml(vm.reviewSummaryText) + '</p>');

  var tags = vm.genres.concat(vm.categories);
  if (tags.length) {
    parts.push('<p class="tags">🏷️ ' + html.escapeHtml(tags.join(', ')) + '</p>');
  }

  if (vm.analysis) {
    var a = vm.analysis;
    parts.push('<section class="analysis">');
    parts.push('<h3>' + html.escapeHtml(a.verdict) + '</h3>');
    if (a.reason) parts.push('<p>' + html.escapeHtml(a.reason) + '</p>');
    if (a.categoryLines.length) {
      parts.push('<ul class="category-stars">' + a.categoryLines.map(function (c) {
        return '<li>' + html.escapeHtml(c.name) + ' ' + c.stars + '</li>';
      }).join('') + '</ul>');
    }
    if (a.pros.length) {
      parts.push('<div class="pros"><h4>✓ 良い点</h4><ul>' + a.pros.map(function (p) {
        return '<li>' + html.escapeHtml(p) + '</li>';
      }).join('') + '</ul></div>');
    }
    if (a.cons.length) {
      parts.push('<div class="cons"><h4>✗ 悪い点</h4><ul>' + a.cons.map(function (c) {
        return '<li>' + html.escapeHtml(c) + '</li>';
      }).join('') + '</ul></div>');
    }
    if (a.audienceFor.length) parts.push('<p>👍 ' + html.escapeHtml(a.audienceFor.join(', ')) + '</p>');
    if (a.audienceAgainst.length) parts.push('<p>👎 ' + html.escapeHtml(a.audienceAgainst.join(', ')) + '</p>');
    parts.push('</section>');
  } else {
    parts.push('<p class="analysis-unavailable">AI分析は利用できませんでした</p>');
  }

  parts.push('</article>');
  return parts.join('');
}

module.exports = { renderAnalysisPage: renderAnalysisPage };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd web && node --test views/analysisPage.test.js`
Expected: PASS(5件)

- [ ] **Step 5: コミット**

```bash
git add web/views/analysisPage.js web/views/analysisPage.test.js
git commit -m "Add analysis result page rendering for web dashboard"
```

---

## Task 7: ゲーム分析オーケストレーション(I/O)

**Files:**
- Create: `web/lib/gameAnalysis.js`

**Interfaces:**
- Consumes: 依存注入(`deps`)で受け取る関数群 — `searchGame(name)`, `fetchPriceDetail(appid)`, `fetchReviewSummary(appid)`, `fetchGameContext(appid)`, `fetchReviewTexts(appid, count)`(すべて`bot/lib/steam.js`由来)、`fetchChatReply(prompt, apiKey, options)`(`bot/chat.js`由来)、`buildAnalysisPrompt(gameName, reviewTexts, gameContext)`・`parseAnalysis(text)`(`bot/commands/review.js`由来)、`apiKey`(文字列 or undefined)
- Produces: `fetchGameAnalysis(name, deps)` — `Promise<{ found: {id,name}|null, priceDetail, reviewSummary, gameContext, analysis }>`。この形はTask 5の`buildAnalysisViewModel`の入力形と一致する
- **自動テスト対象外**(I/O層、既存`bot/commands/*.js`の`handleXCommand`系と同じ方針)

- [ ] **Step 1: 実装**

`web/lib/gameAnalysis.js`:
```js
'use strict';

async function fetchGameAnalysis(name, deps) {
  var found = await deps.searchGame(name);
  if (!found) {
    return { found: null, priceDetail: null, reviewSummary: null, gameContext: null, analysis: null };
  }

  var priceDetail = await deps.fetchPriceDetail(found.id);
  var reviewSummary = await deps.fetchReviewSummary(found.id);
  var gameContext = await deps.fetchGameContext(found.id);
  var analysis = null;

  if (deps.apiKey) {
    var reviews = await deps.fetchReviewTexts(found.id, 15);
    if (reviews.length) {
      var prompt = deps.buildAnalysisPrompt(found.name, reviews, gameContext);
      var raw = await deps.fetchChatReply(prompt, deps.apiKey, { webSearch: false });
      analysis = deps.parseAnalysis(raw);
    }
  }

  return { found: found, priceDetail: priceDetail, reviewSummary: reviewSummary, gameContext: gameContext, analysis: analysis };
}

module.exports = { fetchGameAnalysis: fetchGameAnalysis };
```

- [ ] **Step 2: 手動でI/Oを確認(実際のSteam公開APIに対して)**

Run:
```bash
cd web
node -e "
const steamLib = require('../bot/lib/steam.js');
const { fetchGameAnalysis } = require('./lib/gameAnalysis.js');
fetchGameAnalysis('Hollow Knight', {
  searchGame: steamLib.searchGame,
  fetchPriceDetail: steamLib.fetchPriceDetail,
  fetchReviewSummary: steamLib.fetchReviewSummary,
  fetchGameContext: steamLib.fetchGameContext,
  fetchReviewTexts: steamLib.fetchReviewTexts,
  fetchChatReply: async () => '{}',
  buildAnalysisPrompt: () => '',
  parseAnalysis: () => null,
  apiKey: null
}).then(r => console.log(JSON.stringify(r, null, 2)));
"
```
Expected: `found`に`{id, name}`が入り、`priceDetail`・`reviewSummary`・`gameContext`が埋まったJSONが出力される(`apiKey: null`なので`analysis`は`null`のまま)

- [ ] **Step 3: コミット**

```bash
git add web/lib/gameAnalysis.js
git commit -m "Add game analysis orchestration for web dashboard"
```

---

## Task 8: サーバーへのルート配線(認証・検索フォーム・分析結果・robots.txt)

**Files:**
- Modify: `web/server.js`

**Interfaces:**
- Consumes: すべての先行タスクの成果物 — `web/lib/auth.js`, `web/lib/html.js`(間接的に), `web/lib/viewModel.js`, `web/lib/gameAnalysis.js`, `web/views/layout.js`, `web/views/analysisPage.js`。加えて`bot/lib/steam.js`, `bot/chat.js`, `bot/commands/review.js`を新たにrequireする
- **自動テスト対象外**(I/O層)。手動確認で代替する

- [ ] **Step 1: server.jsにルートを追記**

`web/server.js`を以下の内容に置き換える(Task 1の`/healthz`は残す):
```js
'use strict';
var express = require('express');
var authLib = require('./lib/auth.js');
var layout = require('./views/layout.js');
var analysisPage = require('./views/analysisPage.js');
var viewModel = require('./lib/viewModel.js');
var gameAnalysis = require('./lib/gameAnalysis.js');
var steamLib = require('../bot/lib/steam.js');
var chatLib = require('../bot/chat.js');
var reviewLib = require('../bot/commands/review.js');

var PORT = process.env.PORT || 3000;
var HOST = process.env.BIND_HOST || '127.0.0.1';

var app = express();

app.get('/healthz', function (req, res) {
  res.type('text/plain').send('ok');
});

app.get('/robots.txt', function (req, res) {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

app.use(authLib.createBasicAuthMiddleware(process.env.WEB_DASHBOARD_USER, process.env.WEB_DASHBOARD_PASS));

app.get('/', function (req, res) {
  res.send(layout.renderLayout('<p>ゲーム名を検索してください。</p>', {}));
});

app.get('/analyze', async function (req, res) {
  var name = (req.query.name || '').trim();
  if (!name) {
    res.send(layout.renderLayout('<p class="error">ゲーム名を入力してください。</p>', {}));
    return;
  }
  try {
    var deps = {
      searchGame: steamLib.searchGame,
      fetchPriceDetail: steamLib.fetchPriceDetail,
      fetchReviewSummary: steamLib.fetchReviewSummary,
      fetchGameContext: steamLib.fetchGameContext,
      fetchReviewTexts: steamLib.fetchReviewTexts,
      fetchChatReply: chatLib.fetchChatReply,
      buildAnalysisPrompt: reviewLib.buildAnalysisPrompt,
      parseAnalysis: reviewLib.parseAnalysis,
      apiKey: process.env.ONEMIN_API_KEY
    };
    var result = await gameAnalysis.fetchGameAnalysis(name, deps);
    var vm = viewModel.buildAnalysisViewModel(result);
    var body = analysisPage.renderAnalysisPage(vm);
    res.send(layout.renderLayout(body, { query: name }));
  } catch (e) {
    console.error('/analyze failed: ' + e.message);
    res.status(500).send(layout.renderLayout('<p class="error">エラーが発生しました。</p>', { query: name }));
  }
});

if (require.main === module) {
  app.listen(PORT, HOST, function () {
    console.log('web dashboard listening on ' + HOST + ':' + PORT);
  });
}

module.exports = { app: app };
```

- [ ] **Step 2: 手動起動して認証を確認**

```bash
cd web
WEB_DASHBOARD_USER=testuser WEB_DASHBOARD_PASS=testpass node server.js
```
別ターミナルで:
```bash
curl -i http://127.0.0.1:3000/           # 401を確認
curl -i -u testuser:testpass http://127.0.0.1:3000/           # 200と検索フォームHTMLを確認
curl -i -u testuser:testpass "http://127.0.0.1:3000/analyze?name=Hollow%20Knight"   # 200と分析結果HTMLを確認
curl -i http://127.0.0.1:3000/robots.txt  # 認証不要で200、Disallow: / を確認
```
Expected: 上記コメント通りの結果。確認後Ctrl+Cでプロセス停止

- [ ] **Step 3: コミット**

```bash
git add web/server.js
git commit -m "Wire up game analysis routes with Basic Auth for web dashboard"
```

---

## Task 9: systemdユニットファイルとVMへのデプロイ

**Files:**
- Create: `web/web-dashboard.service`

**Interfaces:**
- Produces: VM上の`systemctl`で管理される常駐サービス定義。既存`bot/steam-discord-bot.service`と同じ形式

- [ ] **Step 1: systemdユニットファイルを作成**

`web/web-dashboard.service`:
```ini
[Unit]
Description=Steam Web Dashboard
After=network.target

[Service]
Type=simple
User=opc
Group=opc
WorkingDirectory=/home/opc/steam-ja-translate/web
EnvironmentFile=/home/opc/steam-ja-translate/web/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: コミット**

```bash
git add web/web-dashboard.service
git commit -m "Add systemd unit for web dashboard"
```

- [ ] **Step 3: リモートに変更が無いか確認してからpush**

```bash
git fetch origin
git status
```
Expected: `Your branch is ahead of 'origin/main'`のみ(リモート側に新しいコミットが無いこと)。もし新しいコミットがあれば先にrebase/mergeする

- [ ] **Step 4: push**

```bash
git push origin main
```

- [ ] **Step 5: VMにデプロイ(この時点でTailscaleがVM・自分の端末に導入済みで、VM上のTailscale IPが判明している前提)**

SSHでVMに接続:
```bash
ssh -i "SSH/ssh-key-2026-08-18.key" opc@140.83.80.109
```

VM上で:
```bash
cd ~/steam-ja-translate
git pull
cd web
npm install
```

`.env`を作成(VM上、値は自分で用意する):
```
WEB_DASHBOARD_USER=<自分で決める>
WEB_DASHBOARD_PASS=<自分で決める>
BIND_HOST=<tailscale ip -4の出力>
PORT=3000
ONEMIN_API_KEY=<既存botの.envと同じ値を使い回してよい>
STEAM_ID64=<将来のウィッシュリスト機能用、今は空でも可>
```

サービスを配置して起動:
```bash
sudo cp web-dashboard.service /etc/systemd/system/web-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable --now web-dashboard
sleep 2
sudo systemctl is-active web-dashboard
```
Expected: `active`が出力される

- [ ] **Step 6: 自分の端末(Tailscale接続済み)のブラウザから最終確認**

`http://<TailscaleのVM側IP>:3000/` にアクセスし、Basic認証プロンプトが出ることを確認 → ID/PW入力 → 検索フォームが表示されることを確認 → 実在するゲーム名で検索し、価格・レビュー・AI分析が表示されることを確認

---

## Self-Review Notes

- **Spec covレッジ**: 背景/決定事項(独立サイト・v1範囲・技術選定・既存コード再利用・Basic認証・Tailscale秘匿・ホスティング・デプロイ)は全てTask 1, 3, 8, 9でカバー。アーキテクチャ図の全コンポーネント(`server.js`, `lib/auth.js`, `lib/gameAnalysis.js`, `views/*.js`)はTask 1〜8で作成。データフロー5ステップはTask 7(3-4)・Task 8(検索→表示)でカバー。エラー処理(API失敗時の非クラッシュ・500ハンドラ)はTask 7(analysis nullフォールバック)とTask 8(try/catch)でカバー。テスト方針(純粋関数TDD・I/O層対象外)は全タスクで踏襲。事前準備(Tailscale等)はTask 9 Step 5に反映
- **プレースホルダ**: なし、全ステップに実コード記載済み
- **型/シグネチャ一貫性**: `fetchGameAnalysis`の戻り値の形(Task 7)と`buildAnalysisViewModel`の入力の形(Task 5)は一致させた。`renderAnalysisPage`(Task 6)が期待するビューモデルの形は`buildAnalysisViewModel`の戻り値と一致させた
