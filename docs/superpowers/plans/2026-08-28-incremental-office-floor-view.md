# 見下ろし型「職場」ビュー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/incremental`ページの「積みゲー従業員」パネルの上に、所持している従業員テイアが見下ろし視点の職場内をランダムに歩き回る装飾ビューを追加する。

**Architecture:** 既存パターンを踏襲し、新規ファイルは作らない。`web/views/incrementalPage.js`のHTMLテンプレート・`CLIENT_STYLE`・`CLIENT_SCRIPT`(1つの巨大な文字列として組み立てられクライアントに埋め込まれるIIFE)にそれぞれ追記する。キャラはCSSの`box-shadow`ピクセルグリッドで描くドット絵風、色は既存`TIER_THUMB_PALETTE`を再利用。

**Tech Stack:** Node.js (`node:test`/`node:assert/strict`)、素のDOM操作JS(フレームワークなし)、Node組み込み`vm`モジュール(新規のDOM実行スモークテスト用)。

**Spec:** `docs/superpowers/specs/2026-08-28-incremental-office-floor-view-design.md`

## Global Constraints

- 新規ファイルは作らない(テストファイルを除く) — spec「Architecture」節より
- 既存の従業員リストUI・ゲームロジック(雇用/所持数/コスト計算)には一切手を入れない — spec「Non-Goals」より
- テイアごとに最大1体、装飾用途のみ(状態を書き込まない、`owned[]`を読むだけ) — spec「Goals」「Data Flow」より
- 新規に追加するクライアント側コードが依存する変数(`page`, `owned`, `TIER_THUMB_PALETTE`相当)がすでに代入済みの位置に挿入すること。挿入位置は`tierEls`ループ(`web/views/incrementalPage.js`の`for(var ti=0;ti<TIER_COUNT;ti++){...}`)より後、`setInterval`のtickループより前 — spec「Architecture」節の教訓より
- 生成されたクライアントスクリプトは、正規表現テストが全て通っていても実機で例外を投げることがある(過去に2回実際に発生)。挙動を変えるタスクは必ずNode `vm`実行スモークテストも実行してから完了とする — spec「Testing」節より

---

## File Structure

- **Modify: `web/views/incrementalPage.js`** — HTMLテンプレート(`renderIncrementalPage`)に職場パネルのマークアップを追加、`CLIENT_STYLE`に職場パネルのCSSを追加、`CLIENT_SCRIPT`に職場ビューのキャラ生成・移動ロジックを追加、`renderTiers()`から新関数を呼ぶよう1行追加
- **Modify: `web/views/incrementalPage.test.js`** — 新規HTML構造・新規クライアント関数の存在を確認する正規表現テストを追加
- **Create: `web/views/incrementalPage.smoke.test.js`** — 生成された`CLIENT_SCRIPT`をNode `vm`+最小DOMスタブ上で実際に実行し、例外を投げずに完走することを確認するテスト。今後この機能追加に限らず、`incrementalPage.js`のクライアントスクリプトが変わるたびに実行される回帰防止用の共通テスト

---

### Task 1: DOM実行スモークテストの土台を作る

このタスクは新機能を何も追加しない。現状の(変更前の)`CLIENT_SCRIPT`が実際のDOM相当の環境で例外を投げずに実行できることを確認するテストだけを先に用意し、以降のタスクの安全網にする。

**Files:**
- Create: `web/views/incrementalPage.smoke.test.js`

**Interfaces:**
- Consumes: `renderIncrementalPage(opts)`(`web/views/incrementalPage.js`の既存エクスポート、`<script>...</script>`を含むHTML文字列を返す)
- Produces: なし(このタスクはテストのみ。後続タスクはこのファイルを変更しない)

- [ ] **Step 1: スモークテストファイルを新規作成する**

`web/views/incrementalPage.smoke.test.js`:

```js
'use strict';
const test = require('node:test');
const vm = require('node:vm');
const { renderIncrementalPage } = require('./incrementalPage.js');

function makeEl() {
  const el = {
    classList: { add() {}, remove() {} },
    style: {},
    children: [],
    addEventListener() {},
    appendChild(child) { el.children.push(child); },
    remove() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    click() {},
    clientWidth: 300,
    clientHeight: 160,
  };
  Object.defineProperty(el, 'textContent', { get() { return ''; }, set() {} });
  Object.defineProperty(el, 'offsetWidth', { get() { return 0; } });
  return el;
}

function extractClientScript(html) {
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('renderIncrementalPage output has no <script> block');
  return m[1];
}

function runClientScriptInSandbox(script) {
  const storage = {};
  const localStorageStub = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  };
  const pageEl = makeEl();
  pageEl.querySelector = () => makeEl();
  const documentStub = {
    querySelector: (sel) => (sel === '.incremental-page' ? pageEl : makeEl()),
    createElement: () => makeEl(),
  };
  const sandbox = {
    document: documentStub,
    localStorage: localStorageStub,
    window: { AudioContext: undefined, webkitAudioContext: undefined, confirm: () => true },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    Date,
    Math,
    console,
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    isFinite,
    Number,
    String,
    Array,
    Object,
    Boolean,
    JSON,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'incremental-client-script.js' });
}

test('the generated incremental client script runs to completion without throwing', () => {
  const html = renderIncrementalPage({});
  const script = extractClientScript(html);
  runClientScriptInSandbox(script);
});

module.exports = { makeEl, extractClientScript, runClientScriptInSandbox };
```

- [ ] **Step 2: テストを実行して通ることを確認する**

Run: `node --test web/views/incrementalPage.smoke.test.js`
Expected: PASS(1 test)。もし現状のコードがすでに壊れている場合はここで失敗する — その場合はこのタスクを止めて報告する(このタスクの目的は「現状を壊さないこと」の確認であり、既存バグの修正はスコープ外)。

- [ ] **Step 3: コミット**

```bash
git add web/views/incrementalPage.smoke.test.js
git commit -m "Add a DOM-execution smoke test for the incremental client script"
```

---

### Task 2: 職場パネルの静的HTML/CSSを追加する

キャラはまだ出さない。空の職場パネル(枠+デスク装飾)だけを追加し、レイアウトを確定させる。

**Files:**
- Modify: `web/views/incrementalPage.js:557` (`CLIENT_STYLE`の末尾、`incrementalSkills.SKILL_STYLE`の直前)
- Modify: `web/views/incrementalPage.js:593` (`renderIncrementalPage`内、従業員リストパネルの直前)
- Test: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: なし
- Produces: HTML要素`#incremental-office-floor`(空のコンテナ、Task 3以降がここにキャラのdivを追加する)

- [ ] **Step 1: 失敗するテストを書く**

`web/views/incrementalPage.test.js`の末尾に追加:

```js
test('renderIncrementalPage includes an office floor panel above the employee list', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /id="incremental-office-floor"/);
  assert.match(html, /class="incremental-office-floor"/);
  const floorIndex = html.indexOf('id="incremental-office-floor"');
  const tiersPanelIndex = html.indexOf('class="incremental-tiers"');
  assert.ok(floorIndex > 0 && tiersPanelIndex > 0 && floorIndex < tiersPanelIndex,
    'office floor panel must appear before the employee tier list panel');
});

test('CLIENT_STYLE styles the office floor panel and desk decorations', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /\.incremental-office-floor\{[^}]*position:relative/);
  assert.match(html, /\.incremental-office-desk\{/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node --test web/views/incrementalPage.test.js`
Expected: FAIL — `id="incremental-office-floor"`が見つからない

- [ ] **Step 3: CSSを追加する**

`web/views/incrementalPage.js:557`付近、`+ incrementalSkills.SKILL_STYLE;`の直前に挿入:

```js
  + '.incremental-office-floor{position:relative;height:160px;border:3px solid #3b2a1a;border-radius:12px;'
  + 'background:#e7dcc4;overflow:hidden;margin-bottom:4px}'
  + '.incremental-office-desk{position:absolute;width:26px;height:16px;background:#c9a06a;'
  + 'border:2px solid #3b2a1a;border-radius:3px}'
  + '.office-char{position:absolute;width:3px;height:3px;background:transparent}'
```

- [ ] **Step 4: HTMLを追加する**

`web/views/incrementalPage.js:593`、`+ '<div class="incremental-panel">'`(積みゲー従業員パネルの開始)の直前に挿入:

```js
    + '<div class="incremental-panel">'
    + '<div class="incremental-panel-title">' + ICON_PERSON + '職場</div>'
    + '<div class="incremental-office-floor" id="incremental-office-floor">'
    + '<div class="incremental-office-desk" style="left:10%;top:20%"></div>'
    + '<div class="incremental-office-desk" style="left:45%;top:55%"></div>'
    + '<div class="incremental-office-desk" style="left:78%;top:15%"></div>'
    + '</div>'
    + '</div>'
```

(この直後に既存の`+ '<div class="incremental-panel">' + '<div class="incremental-panel-title">' + ICON_PERSON + '積みゲー従業員</div>' ...`ブロックがそのまま続く)

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `node --test web/views/incrementalPage.test.js web/views/incrementalPage.smoke.test.js`
Expected: 全てPASS

- [ ] **Step 6: コミット**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Add the empty office-floor panel above the employee list"
```

---

### Task 3: 所持テイアに応じたキャラのドット絵を描画する

`owned[]`を見て、所持テイアごとに1体、ドット絵風のキャラを職場パネル内にランダムな位置で生成する。まだ動かない(静止)。

**Files:**
- Modify: `web/views/incrementalPage.js:188-189` (`tierEls`ループの直後、`incrementalSkills.buildSkillClientScript()`の直前)
- Modify: `web/views/incrementalPage.js` (`function renderTiers(){...}`の本体、現在の行190付近)
- Test: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: `TIER_THUMB_PALETTE`(モジュールスコープ変数、`web/views/incrementalPage.js:8`)、`owned[]`(クライアントスクリプト内の既存var)、`page`(既存var、`#incremental-office-floor`の親)
- Produces: クライアント関数`renderOfficeFloor()`(所持テイア構成からキャラdivを全消去→再構築)、`officeChars`(クライアント側var、生成済みキャラ要素の配列。Task 4の移動ロジックがこれを読む)

- [ ] **Step 1: 失敗するテストを書く**

`web/views/incrementalPage.test.js`の末尾に追加:

```js
test('the client script defines renderOfficeFloor, keyed off owned[] and TIER_THUMB_PALETTE', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function renderOfficeFloor\(\)\{/);
  assert.match(html, /var TIER_THUMB_PALETTE=\[/);
  assert.match(html, /if\(owned\[i\]<=0\)continue;/);
});

test('renderTiers() also refreshes the office floor so hiring/prestige keep it in sync', () => {
  const html = renderIncrementalPage({});
  // renderTiers()'s own for-loop closes with a "}" before this call, so the
  // match must cross a brace: use a non-greedy [\s\S]*? instead of [^}]*.
  assert.match(html, /function renderTiers\(\)\{[\s\S]*?renderOfficeFloor\(\);\}/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node --test web/views/incrementalPage.test.js`
Expected: FAIL — `renderOfficeFloor`が見つからない

- [ ] **Step 3: キャラ生成ロジックを追加する**

`web/views/incrementalPage.js:188-189`、`+ '}'`(`tierEls`ループを閉じる行)と`+ incrementalSkills.buildSkillClientScript()`の間に挿入:

```js
  + 'var TIER_THUMB_PALETTE=' + JSON.stringify(TIER_THUMB_PALETTE) + ';'
  + 'var officeFloorEl=page.querySelector("#incremental-office-floor");'
  + 'var officeChars=[];'
  + 'var CHAR_PIXELS=[[2,0],[3,0],[2,1],[3,1],[1,2],[2,2],[3,2],[4,2],[1,3],[2,3],[3,3],[4,3],[1,4],[2,4],[3,4],[4,4],[1,5],[2,5],[3,5],[4,5],[1,6],[4,6]];'
  + 'var CHAR_PX=3;'
  + 'var CHAR_W=5*CHAR_PX;'
  + 'var CHAR_H=7*CHAR_PX;'
  + 'function charBoxShadow(color){'
  + 'return CHAR_PIXELS.map(function(p){return (p[0]*CHAR_PX)+"px "+(p[1]*CHAR_PX)+"px 0 0 "+color;}).join(",");'
  + '}'
  + 'function renderOfficeFloor(){'
  + 'if(!officeFloorEl)return;'
  + 'officeChars.forEach(function(el){el.remove();});'
  + 'officeChars=[];'
  + 'var maxX=Math.max(0,officeFloorEl.clientWidth-CHAR_W);'
  + 'var maxY=Math.max(0,officeFloorEl.clientHeight-CHAR_H);'
  + 'for(var i=0;i<TIER_COUNT;i++){'
  + 'if(owned[i]<=0)continue;'
  + 'var color=TIER_THUMB_PALETTE[i%TIER_THUMB_PALETTE.length];'
  + 'var el=document.createElement("div");'
  + 'el.className="office-char";'
  + 'el.style.boxShadow=charBoxShadow(color);'
  + 'el.style.left=Math.floor(Math.random()*maxX)+"px";'
  + 'el.style.top=Math.floor(Math.random()*maxY)+"px";'
  + 'officeFloorEl.appendChild(el);'
  + 'officeChars.push(el);'
  + '}'
  + '}'
```

- [ ] **Step 4: `renderTiers()`から呼ぶ**

`function renderTiers(){for(var i=0;i<TIER_COUNT;i++){...}}`の本体末尾(閉じ`}'`の直前)に`+ 'renderOfficeFloor();'`を追加し、初期描画時にも呼ばれるようにする:

```js
  + 'function renderTiers(){'
  + 'for(var i=0;i<TIER_COUNT;i++){'
  + 'if(tierEls[i].ownedEl)tierEls[i].ownedEl.textContent=String(owned[i]);'
  + 'if(tierEls[i].costEl)tierEls[i].costEl.textContent=Math.ceil(tierCost(i,owned[i])).toLocaleString();'
  + '}'
  + 'renderOfficeFloor();'
  + '}'
```

(`renderTiers()`は既存コードで初期ロード時・購入時・auto-buy時・プレステージ時に呼ばれているので、これだけで職場ビューが全ての所持数変化タイミングで再計算される)

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `node --test web/views/incrementalPage.test.js web/views/incrementalPage.smoke.test.js`
Expected: 全てPASS。スモークテストが通ることを必ず確認する(`document.createElement`スタブは`clientWidth`/`clientHeight`を返すのでここで例外が出ないはず)。

- [ ] **Step 6: コミット**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Render one office-floor character per owned employee tier"
```

---

### Task 4: キャラをランダムに歩き回らせる

Task 3で生成した`officeChars`を、一定間隔でランダムな座標に向けてCSS transitionで移動させる。

**Files:**
- Modify: `web/views/incrementalPage.js:557`付近(`.office-char`のCSSルール)
- Modify: `web/views/incrementalPage.js`(Task 3で追加した`renderOfficeFloor()`の直後)
- Test: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: `officeChars`(Task 3で定義したクライアント側var)、`officeFloorEl`(Task 3で定義)
- Produces: クライアント関数`stepOfficeChars()`(全キャラに新しいランダム座標を設定)、1500ms間隔の`setInterval`

- [ ] **Step 1: 失敗するテストを書く**

`web/views/incrementalPage.test.js`の末尾に追加:

```js
test('the client script walks office characters to a new random spot every 1.5s', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function stepOfficeChars\(\)\{/);
  assert.match(html, /setInterval\(stepOfficeChars,1500\);/);
});

test('CLIENT_STYLE gives office characters a smooth walking transition', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /\.office-char\{[^}]*transition:left 1\.5s linear,top 1\.5s linear/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node --test web/views/incrementalPage.test.js`
Expected: FAIL — `stepOfficeChars`が見つからない

- [ ] **Step 3: `.office-char`のCSSにtransitionを追加する**

Task 2で追加した行を書き換える(`web/views/incrementalPage.js:557`付近):

```js
  + '.office-char{position:absolute;width:3px;height:3px;background:transparent;'
  + 'transition:left 1.5s linear,top 1.5s linear}'
```

- [ ] **Step 4: 移動ロジックを追加する**

Task 3で追加した`renderOfficeFloor(){...}`関数定義の直後に挿入:

```js
  + 'function stepOfficeChars(){'
  + 'if(!officeFloorEl)return;'
  + 'var maxX=Math.max(0,officeFloorEl.clientWidth-CHAR_W);'
  + 'var maxY=Math.max(0,officeFloorEl.clientHeight-CHAR_H);'
  + 'officeChars.forEach(function(el){'
  + 'el.style.left=Math.floor(Math.random()*maxX)+"px";'
  + 'el.style.top=Math.floor(Math.random()*maxY)+"px";'
  + '});'
  + '}'
  + 'setInterval(stepOfficeChars,1500);'
```

(職場パネルがDOM上になければ`officeFloorEl`は`null`のはずで、`stepOfficeChars()`は`if(!officeFloorEl)return;`で即座に抜ける。`officeChars`が空配列でも`forEach`は何もしないので安全)

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `node --test web/views/incrementalPage.test.js web/views/incrementalPage.smoke.test.js`
Expected: 全てPASS

- [ ] **Step 6: フルテストスイートを実行する**

Run: `npm test`
Expected: 全テストPASS(この機能追加前の既存テストを含む)

- [ ] **Step 7: コミット**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Walk office-floor characters to a new random spot every 1.5s"
```

---

## Final Verification

全タスク完了後:

1. `npm test` で全テストPASSを確認
2. superpowers:requesting-code-review でこのブランチ全体(Task 1のベースコミット〜最終コミット)をレビュー
3. 実機(本番 or ローカル)で`/incremental`を開き、コンソールに例外が出ないこと、職場パネルにキャラが表示され1.5秒おきに位置が変わることを目視確認する(このタスクで最も再発させたくないバグは「テストは全部通っているのに実機だけ落ちる」なので、目視確認は省略しない)
