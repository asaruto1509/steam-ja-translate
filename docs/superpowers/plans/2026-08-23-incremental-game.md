# 積みゲー消化工場 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ルーレットとは完全に独立した新規ページ`/incremental`に、実際の積みゲーを「従業員」とする放置インクリメンタルゲーム(クリック+自動生成+オフライン進行+プレステージ)を追加する。

**Architecture:** サーバーは積みゲー一覧を返す軽量な`/api/incremental/roster`エンドポイントのみ持つ(既存の`backlogPool`を再利用、既存の`realGameCache`と同じ手口でプロセス内キャッシュ)。ゲーム状態(DP残高・従業員所持数・最終ティック時刻・累計DP・プレステージ倍率)は全てクライアント側localStorageで完結する。`web/views/incrementalPage.js`が1ファイルでマークアップと専用`<script>`の両方を返す、既存の`roulettePage.js`/`shopPage.js`と並ぶ独立ファイル。`web/views/layout.js`の共有巨大scriptブロックには一切触らない。

**Tech Stack:** Node.js + Express(既存)、バニラJS(ビルドツールなし、既存方針を踏襲)、`node:test`+`node:assert/strict`によるレンダリング結果への正規表現アサーション(既存の`roulettePage.test.js`/`layout.test.js`と同じ流儀)。

**Spec:** `docs/superpowers/specs/2026-08-23-incremental-game-design.md`

## Global Constants

- localStorageキー(すべて新規): `ja_trans_incremental_dp_v1`(DP残高) / `ja_trans_incremental_owned_v1`(従業員所持数、JSON配列長12) / `ja_trans_incremental_lasttick_v1`(最終ティック時刻ms) / `ja_trans_incremental_lifetimedp_v1`(累計獲得DP、プレステージでもリセットしない) / `ja_trans_incremental_prestige_v1`(現在のプレステージ倍率)
- 既存のルーレットクレジットキー(読み書き対象、変更しない): `ja_trans_roulette_credits_v1`
- 従業員tier数: **12固定**(`TIER_COUNT=12`)
- 交換レート: **10クレジット→1DP**、一方通行のみ(DP→クレジットは存在しない)
- オフライン進行の上限: **28800秒(8時間)**
- 既存の`RESET_KEYS`(ショップのデータリセット機能)には一切追加しない — インクリメンタル側は完全に別データ領域
- `bot/**`・`scripts/**`は一切変更しない(既存の標準制約)

---

### Task 1: 積みゲーロスターAPI + ページルート追加(サーバー側)

**Files:**
- Modify: `web/server.js`

**Interfaces:**
- Consumes: `backlogPool.fetchOwnedGames(steamId64, apiKey)` / `backlogPool.filterBacklog(games, maxMinutes)`(既存、`web/lib/backlogPool.js`、変更なし)
- Produces: `GET /api/incremental/roster` → `{ roster: [{id, name, imageUrl}, ...] }`(最大12件、取得不可時は`{ roster: [] }`)。`GET /incremental` → HTMLページ。後続タスクの`incrementalPage.renderIncrementalPage`がこのルートから呼ばれる。

- [ ] **Step 1: `web/server.js`の先頭のrequire群に`incrementalPage`を追加**

```js
var incrementalPage = require('./views/incrementalPage.js');
```

(この時点では`web/views/incrementalPage.js`はまだ存在しないため、Step 2でTask 2のファイルが必要になる。Task 2を先にダミーで作らず、Task 1はこのrequire行を書いた状態でTask 2完了後に動作確認する前提で進めて良い — Node.jsの`require`は該当ファイルが実在しないとサーバー起動時にエラーになるため、**Task 1の動作確認はTask 2完了後に行う**。)

- [ ] **Step 2: `/incremental`ページルートを追加**

`web/server.js`の`app.get('/shop', ...)`ブロックの直後に追加:

```js
app.get('/incremental', function (req, res) {
  res.send(layout.renderLayout(incrementalPage.renderIncrementalPage({}), {}));
});
```

- [ ] **Step 3: ロスターAPIのキャッシュ変数とルートを追加**

`web/server.js`の`var BACKLOG_MAX_MINUTES = 120;`の定義がある行の付近(積みゲー関連の定数がまとまっている場所)に追加:

```js
var INCREMENTAL_ROSTER_MAX = 12;
var INCREMENTAL_ROSTER_MAX_MINUTES = 120;
var incrementalRosterCache = null;
var INCREMENTAL_ROSTER_CACHE_TTL_MS = 60 * 60 * 1000;

app.get('/api/incremental/roster', async function (req, res) {
  try {
    var now = Date.now();
    if (incrementalRosterCache && (now - incrementalRosterCache.at) < INCREMENTAL_ROSTER_CACHE_TTL_MS) {
      res.json({ roster: incrementalRosterCache.roster });
      return;
    }
    var steamId64 = process.env.STEAM_ID64;
    var apiKey = process.env.STEAM_API_KEY;
    if (!steamId64 || !apiKey) {
      res.json({ roster: [] });
      return;
    }
    var owned = await backlogPool.fetchOwnedGames(steamId64, apiKey);
    var backlog = backlogPool.filterBacklog(owned, INCREMENTAL_ROSTER_MAX_MINUTES);
    var roster = backlog.slice(0, INCREMENTAL_ROSTER_MAX).map(function (g) {
      return { id: g.id, name: g.name, imageUrl: g.imageUrl };
    });
    incrementalRosterCache = { roster: roster, at: now };
    res.json({ roster: roster });
  } catch (e) {
    console.error('/api/incremental/roster failed:', e);
    res.status(500).json({ roster: [] });
  }
});
```

(`backlogPool`は既にファイル先頭でrequire済み。新規require不要。)

- [ ] **Step 4: このタスクの動作確認はTask 2完了後まで保留**

Task 2で`web/views/incrementalPage.js`を作成した後にまとめて確認する(Task 2のStep内に記載)。このタスク単体でのコミットは行わず、Task 2のコミットに含める。

---

### Task 2: `incrementalPage.js` — ページシェルのマークアップ + 状態復元スクリプト

**Files:**
- Create: `web/views/incrementalPage.js`
- Test: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: `web/lib/html.js`の`escapeHtml`(既存)
- Produces: `renderIncrementalPage(opts)`(`opts = {backLinkText}`)。返すHTML文字列内のDOM要素id: `#incremental-dp-value` / `#incremental-click-btn` / `#incremental-welcome-back` / `#incremental-tier-name-{i}` / `#incremental-tier-owned-{i}` / `#incremental-tier-cost-{i}` / `#incremental-tier-buy-{i}`(i=0〜11) / `#incremental-credits-available` / `#incremental-exchange-amount` / `#incremental-exchange-btn` / `#incremental-exchange-result` / `#incremental-prestige-btn` / `#incremental-prestige-mult-value`。ページ全体は`.incremental-page`クラス。以降のタスクはすべてこのファイルの`CLIENT_SCRIPT`変数に文字列を追記していく。

- [ ] **Step 1: 失敗するテストを書く**

`web/views/incrementalPage.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderIncrementalPage } = require('./incrementalPage.js');

test('renderIncrementalPage includes the page section and DP/prestige HUD', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /class="incremental-page"/);
  assert.match(html, /id="incremental-dp-value"/);
  assert.match(html, /id="incremental-prestige-mult-value"/);
  assert.match(html, /id="incremental-click-btn"/);
});

test('renderIncrementalPage renders 12 employee tier rows with owned/cost/buy elements', () => {
  const html = renderIncrementalPage({});
  for (let i = 0; i < 12; i++) {
    assert.match(html, new RegExp('id="incremental-tier-name-' + i + '"'));
    assert.match(html, new RegExp('id="incremental-tier-owned-' + i + '"'));
    assert.match(html, new RegExp('id="incremental-tier-cost-' + i + '"'));
    assert.match(html, new RegExp('id="incremental-tier-buy-' + i + '"'));
  }
  assert.equal((html.match(/class="incremental-tier-buy-btn"/g) || []).length, 12);
});

test('renderIncrementalPage includes the credit-exchange UI and prestige button', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /id="incremental-credits-available"/);
  assert.match(html, /id="incremental-exchange-amount"/);
  assert.match(html, /id="incremental-exchange-btn"/);
  assert.match(html, /id="incremental-exchange-result"/);
  assert.match(html, /id="incremental-prestige-btn"/);
});

test('renderIncrementalPage restores dp/owned/lastTick/lifetimeDp/prestigeMult from localStorage', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var DP_KEY="ja_trans_incremental_dp_v1";/);
  assert.match(html, /var OWNED_KEY="ja_trans_incremental_owned_v1";/);
  assert.match(html, /var LASTTICK_KEY="ja_trans_incremental_lasttick_v1";/);
  assert.match(html, /var LIFETIME_KEY="ja_trans_incremental_lifetimedp_v1";/);
  assert.match(html, /var PRESTIGE_KEY="ja_trans_incremental_prestige_v1";/);
  assert.match(html, /var TIER_COUNT=12;/);
});

test('renderIncrementalPage uses a default back-link text when not provided', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /トップに戻る/);
});

test('renderIncrementalPage uses a custom back-link text when provided', () => {
  const html = renderIncrementalPage({ backLinkText: '一覧へ' });
  assert.match(html, /一覧へ/);
  assert.doesNotMatch(html, /トップに戻る/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: FAIL(`Cannot find module './incrementalPage.js'`)

- [ ] **Step 3: `web/views/incrementalPage.js`を実装**

```js
'use strict';
var html = require('../lib/html.js');

var TIER_COUNT = 12;

function tierRowHtml(i) {
  return '<div class="incremental-tier" data-tier="' + i + '">'
    + '<span class="incremental-tier-name" id="incremental-tier-name-' + i + '">従業員' + (i + 1) + '</span>'
    + '<span class="incremental-tier-owned">所持: <span id="incremental-tier-owned-' + i + '">0</span></span>'
    + '<span class="incremental-tier-cost">コスト: <span id="incremental-tier-cost-' + i + '">0</span> DP</span>'
    + '<button type="button" class="incremental-tier-buy-btn" id="incremental-tier-buy-' + i + '">雇う</button>'
    + '</div>';
}

var CLIENT_SCRIPT = ''
  + '(function(){'
  + '"use strict";'
  + 'var DP_KEY="ja_trans_incremental_dp_v1";'
  + 'var OWNED_KEY="ja_trans_incremental_owned_v1";'
  + 'var LASTTICK_KEY="ja_trans_incremental_lasttick_v1";'
  + 'var LIFETIME_KEY="ja_trans_incremental_lifetimedp_v1";'
  + 'var PRESTIGE_KEY="ja_trans_incremental_prestige_v1";'
  + 'var CREDITS_KEY="ja_trans_roulette_credits_v1";'
  + 'var TIER_COUNT=12;'
  + 'function loadNumber(key,fallback){'
  + 'var raw=Number(localStorage.getItem(key));'
  + 'return (isFinite(raw)&&raw>=0)?raw:fallback;'
  + '}'
  + 'function loadOwned(){'
  + 'var stored=localStorage.getItem(OWNED_KEY);'
  + 'if(!stored)return new Array(TIER_COUNT).fill(0);'
  + 'try{'
  + 'var arr=JSON.parse(stored);'
  + 'if(!Array.isArray(arr)||arr.length!==TIER_COUNT)return new Array(TIER_COUNT).fill(0);'
  + 'return arr.map(function(n){return (isFinite(n)&&n>=0)?Math.floor(n):0;});'
  + '}catch(e){return new Array(TIER_COUNT).fill(0);}'
  + '}'
  + 'var dp=loadNumber(DP_KEY,0);'
  + 'var owned=loadOwned();'
  + 'var lastTick=loadNumber(LASTTICK_KEY,Date.now());'
  + 'var lifetimeDp=loadNumber(LIFETIME_KEY,0);'
  + 'var prestigeMult=loadNumber(PRESTIGE_KEY,1)||1;'
  + 'function saveState(){'
  + 'localStorage.setItem(DP_KEY,String(dp));'
  + 'localStorage.setItem(OWNED_KEY,JSON.stringify(owned));'
  + 'localStorage.setItem(LASTTICK_KEY,String(lastTick));'
  + 'localStorage.setItem(LIFETIME_KEY,String(lifetimeDp));'
  + 'localStorage.setItem(PRESTIGE_KEY,String(prestigeMult));'
  + '}'
  + 'var page=document.querySelector(".incremental-page");'
  + 'if(!page)return;'
  + 'var dpEl=page.querySelector("#incremental-dp-value");'
  + 'var prestigeMultEl=page.querySelector("#incremental-prestige-mult-value");'
  + 'function renderDp(){'
  + 'if(dpEl)dpEl.textContent=Math.floor(dp).toLocaleString();'
  + '}'
  + 'function renderPrestige(){'
  + 'if(prestigeMultEl)prestigeMultEl.textContent=prestigeMult.toFixed(2)+"倍";'
  + '}'
  + 'renderDp();'
  + 'renderPrestige();'
  + 'saveState();'
  + '})();';

function renderIncrementalPage(opts) {
  opts = opts || {};
  var backLinkText = html.escapeHtml(opts.backLinkText || 'トップに戻る');
  var tiersHtml = '';
  for (var i = 0; i < TIER_COUNT; i++) { tiersHtml += tierRowHtml(i); }
  return '<section class="incremental-page">'
    + '<h2>🏭 積みゲー消化工場</h2>'
    + '<p class="incremental-welcome-back" id="incremental-welcome-back"></p>'
    + '<div class="incremental-hud">'
    + '<div class="incremental-dp">💼 開発資金: <span id="incremental-dp-value">0</span> DP</div>'
    + '<div class="incremental-prestige">✨ 倍率: <span id="incremental-prestige-mult-value">1.00倍</span></div>'
    + '</div>'
    + '<button type="button" id="incremental-click-btn">🛠️ 作業する(+1 DP)</button>'
    + '<div class="incremental-tiers">' + tiersHtml + '</div>'
    + '<div class="incremental-exchange">'
    + '<p>🪙 ルーレット残高: <span id="incremental-credits-available">0</span></p>'
    + '<input type="number" id="incremental-exchange-amount" min="1" placeholder="交換するクレジット枚数">'
    + '<button type="button" id="incremental-exchange-btn">DPに交換(10枚→1DP)</button>'
    + '<p id="incremental-exchange-result"></p>'
    + '</div>'
    + '<button type="button" id="incremental-prestige-btn">🔄 新年度リセット(プレステージ)</button>'
    + '<p><a href="/">' + backLinkText + '</a></p>'
    + '</section>'
    + '<script>' + CLIENT_SCRIPT + '</script>';
}

module.exports = { renderIncrementalPage: renderIncrementalPage };
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: PASS(6 tests)

- [ ] **Step 5: Task 1のサーバールートが正しく動くか確認**

Run: `cd web && node -e "require('./server.js')"` をバックグラウンドで起動せず、まず`node -c server.js`で構文チェック。次に既存の`npm test`が壊れていないことを確認:

Run: `cd web && npm test`
Expected: 全テストPASS(既存267件 + このタスクで追加した6件)

- [ ] **Step 6: コミット(Task 1とTask 2をまとめて)**

```bash
git add web/server.js web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Add incremental game page shell, roster API, and state restoration"
```

---

### Task 3: クリック・自動ティック・オフライン進行

**Files:**
- Modify: `web/views/incrementalPage.js`
- Modify: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: Task 2の`dp` / `owned` / `lastTick` / `lifetimeDp` / `prestigeMult` / `saveState()` / `renderDp()` / `page`(すべて`CLIENT_SCRIPT`内のクロージャ変数、同じ`(function(){...})()`スコープ内に追記する)
- Produces: `tierBaseOutput(i)` / `totalOutputPerSec()` / `addDp(amount)` 関数。後続タスクが再利用する。

- [ ] **Step 1: 失敗するテストを追加**

`web/views/incrementalPage.test.js`に追記:

```js
test('renderIncrementalPage computes per-tier output and total output scaled by prestige, and ticks every second', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var TIER_BASE_OUTPUT=0\.1;/);
  assert.match(html, /var TIER_OUTPUT_TIER_MULT=6;/);
  assert.match(html, /function tierBaseOutput\(i\)\{return TIER_BASE_OUTPUT\*Math\.pow\(TIER_OUTPUT_TIER_MULT,i\);\}/);
  assert.match(html, /function totalOutputPerSec\(\)\{/);
  assert.match(html, /sum\*prestigeMult;/);
  assert.match(html, /setInterval\(function\(\)\{/);
  assert.match(html, /addDp\(totalOutputPerSec\(\)\);/);
});

test('renderIncrementalPage grants capped offline progress based on elapsed time since lastTick, and shows a welcome-back message', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var OFFLINE_CAP_SECONDS=28800;/);
  assert.match(html, /var elapsedSec=Math\.max\(0,Math\.min\(OFFLINE_CAP_SECONDS,\(nowMs-lastTick\)\/1000\)\);/);
  assert.match(html, /var offlineGain=totalOutputPerSec\(\)\*elapsedSec;/);
  assert.match(html, /welcomeEl\.textContent="おかえりなさい、\+"\+Math\.floor\(offlineGain\)\.toLocaleString\(\)\+" DP";/);
});

test('renderIncrementalPage adds DP on manual click, scaled by prestige', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var CLICK_BASE=1;/);
  assert.match(html, /clickBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /addDp\(CLICK_BASE\*prestigeMult\);/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: FAIL(3件、上記アサーションが未実装のため)

- [ ] **Step 3: `CLIENT_SCRIPT`を拡張**

`web/views/incrementalPage.js`の`CLIENT_SCRIPT`定義を編集する。`var prestigeMult=loadNumber(PRESTIGE_KEY,1)||1;`の直後、`function saveState(){`の直前に定数と関数を追加:

```js
  + 'var TIER_BASE_OUTPUT=0.1;'
  + 'var TIER_OUTPUT_TIER_MULT=6;'
  + 'var CLICK_BASE=1;'
  + 'var OFFLINE_CAP_SECONDS=28800;'
  + 'function tierBaseOutput(i){return TIER_BASE_OUTPUT*Math.pow(TIER_OUTPUT_TIER_MULT,i);}'
  + 'function totalOutputPerSec(){'
  + 'var sum=0;'
  + 'for(var i=0;i<TIER_COUNT;i++){sum+=owned[i]*tierBaseOutput(i);}'
  + 'return sum*prestigeMult;'
  + '}'
  + 'function addDp(amount){'
  + 'dp+=amount;'
  + 'lifetimeDp+=amount;'
  + '}'
```

`var prestigeMultEl=page.querySelector("#incremental-prestige-mult-value");`の直後、`function renderDp(){...}`定義の後に追加:

```js
  + 'var clickBtn=page.querySelector("#incremental-click-btn");'
  + 'var welcomeEl=page.querySelector("#incremental-welcome-back");'
```

`renderDp();` `renderPrestige();` `saveState();` の3行(現在の末尾)を、以下のブロックで置き換える(オフライン進行の計算→保存→描画→クリック/ティックのイベント登録という順序にするため):

```js
  + 'var nowMs=Date.now();'
  + 'var elapsedSec=Math.max(0,Math.min(OFFLINE_CAP_SECONDS,(nowMs-lastTick)/1000));'
  + 'if(elapsedSec>1){'
  + 'var offlineGain=totalOutputPerSec()*elapsedSec;'
  + 'if(offlineGain>0){'
  + 'addDp(offlineGain);'
  + 'if(welcomeEl)welcomeEl.textContent="おかえりなさい、+"+Math.floor(offlineGain).toLocaleString()+" DP";'
  + '}'
  + '}'
  + 'lastTick=nowMs;'
  + 'saveState();'
  + 'renderDp();'
  + 'renderPrestige();'
  + 'if(clickBtn){'
  + 'clickBtn.addEventListener("click",function(){'
  + 'addDp(CLICK_BASE*prestigeMult);'
  + 'saveState();'
  + 'renderDp();'
  + '});'
  + '}'
  + 'setInterval(function(){'
  + 'addDp(totalOutputPerSec());'
  + 'lastTick=Date.now();'
  + 'saveState();'
  + 'renderDp();'
  + '},1000);'
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: PASS(全9テスト)

- [ ] **Step 5: `npm test`全体を実行**

Run: `cd web && npm test`
Expected: 全テストPASS

- [ ] **Step 6: コミット**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Add click income, auto-tick, and capped offline progress to the incremental game"
```

---

### Task 4: 従業員(tier)の購入ロジック

**Files:**
- Modify: `web/views/incrementalPage.js`
- Modify: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: Task 2/3の`dp` / `owned` / `saveState()` / `renderDp()` / `page` / `TIER_COUNT`
- Produces: `tierBaseCost(i)` / `tierCost(i,ownedCount)` / `renderTiers()`。後続タスクの購入UI更新・ロスター名反映が`renderTiers()`を再利用する。

- [ ] **Step 1: 失敗するテストを追加**

```js
test('renderIncrementalPage computes exponential per-tier purchase cost and wires buy buttons', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var TIER_BASE_COST=15;/);
  assert.match(html, /var TIER_COST_TIER_MULT=6;/);
  assert.match(html, /var TIER_COST_GROWTH=1\.14;/);
  assert.match(html, /function tierBaseCost\(i\)\{return TIER_BASE_COST\*Math\.pow\(TIER_COST_TIER_MULT,i\);\}/);
  assert.match(html, /function tierCost\(i,ownedCount\)\{return tierBaseCost\(i\)\*Math\.pow\(TIER_COST_GROWTH,ownedCount\);\}/);
  assert.match(html, /function renderTiers\(\)\{/);
  assert.match(html, /tierEls\[i\]\.costEl\.textContent=Math\.ceil\(tierCost\(i,owned\[i\]\)\)\.toLocaleString\(\);/);
  assert.match(html, /var cost=tierCost\(i,owned\[i\]\);/);
  assert.match(html, /if\(dp<cost\)return;/);
  assert.match(html, /owned\[i\]\+\+;/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: FAIL(1件)

- [ ] **Step 3: `CLIENT_SCRIPT`を拡張**

`'function tierBaseOutput(i){return TIER_BASE_OUTPUT*Math.pow(TIER_OUTPUT_TIER_MULT,i);}'`の直前に追加:

```js
  + 'var TIER_BASE_COST=15;'
  + 'var TIER_COST_TIER_MULT=6;'
  + 'var TIER_COST_GROWTH=1.14;'
  + 'function tierBaseCost(i){return TIER_BASE_COST*Math.pow(TIER_COST_TIER_MULT,i);}'
  + 'function tierCost(i,ownedCount){return tierBaseCost(i)*Math.pow(TIER_COST_GROWTH,ownedCount);}'
```

`var welcomeEl=page.querySelector("#incremental-welcome-back");`の直後に追加:

```js
  + 'var tierEls=[];'
  + 'for(var ti=0;ti<TIER_COUNT;ti++){'
  + 'tierEls.push({'
  + 'nameEl:page.querySelector("#incremental-tier-name-"+ti),'
  + 'ownedEl:page.querySelector("#incremental-tier-owned-"+ti),'
  + 'costEl:page.querySelector("#incremental-tier-cost-"+ti),'
  + 'buyBtn:page.querySelector("#incremental-tier-buy-"+ti)'
  + '});'
  + '}'
  + 'function renderTiers(){'
  + 'for(var i=0;i<TIER_COUNT;i++){'
  + 'if(tierEls[i].ownedEl)tierEls[i].ownedEl.textContent=String(owned[i]);'
  + 'if(tierEls[i].costEl)tierEls[i].costEl.textContent=Math.ceil(tierCost(i,owned[i])).toLocaleString();'
  + '}'
  + '}'
```

既存の`+ 'renderDp();'` `+ 'renderPrestige();'`(オフライン進行ブロックの直後)の2行の後に`+ 'renderTiers();'`を追加。

`clickBtn`のイベントリスナー登録ブロックの直後(`setInterval(...)`の直前)に購入ハンドラを追加:

```js
  + 'tierEls.forEach(function(t,i){'
  + 'if(!t.buyBtn)return;'
  + 't.buyBtn.addEventListener("click",function(){'
  + 'var cost=tierCost(i,owned[i]);'
  + 'if(dp<cost)return;'
  + 'dp-=cost;'
  + 'owned[i]++;'
  + 'saveState();'
  + 'renderDp();'
  + 'renderTiers();'
  + '});'
  + '});'
```

`setInterval`のコールバックは変更しない(`renderDp();`のみのまま)。tierの所持数はティックでは変わらず購入時にしか変わらないため、`renderTiers()`は購入ハンドラ内の呼び出しだけで十分。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: PASS(全10テスト)

- [ ] **Step 5: `npm test`全体を実行**

Run: `cd web && npm test`
Expected: 全テストPASS

- [ ] **Step 6: コミット**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Add exponential employee purchase costs and buy-button wiring"
```

---

### Task 5: 積みゲーロスターの反映(tier名の実データ化)

**Files:**
- Modify: `web/views/incrementalPage.js`
- Modify: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: Task 4の`tierEls` / `TIER_COUNT`。Task 1の`GET /api/incremental/roster`。
- Produces: なし(末端機能)。

- [ ] **Step 1: 失敗するテストを追加**

```js
test('renderIncrementalPage fetches the backlog roster and overrides tier names, falling back to generic names on failure', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var FALLBACK_NAMES=\["従業員1","従業員2","従業員3","従業員4","従業員5","従業員6","従業員7","従業員8","従業員9","従業員10","従業員11","従業員12"\];/);
  assert.match(html, /fetch\("\/api\/incremental\/roster"\)\.then\(function\(r\)\{return r\.json\(\);\}\)\.then\(function\(d\)\{/);
  assert.match(html, /var roster=\(d&&d\.roster\)\|\|\[\];/);
  assert.match(html, /var label=\(roster\[i\]&&roster\[i\]\.name\)\?roster\[i\]\.name:FALLBACK_NAMES\[i\];/);
  assert.match(html, /\}\)\.catch\(function\(\)\{\}\);/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: FAIL(1件)

- [ ] **Step 3: `CLIENT_SCRIPT`を拡張**

`var CREDITS_KEY="ja_trans_roulette_credits_v1";`の直後に追加:

```js
  + 'var FALLBACK_NAMES=["従業員1","従業員2","従業員3","従業員4","従業員5","従業員6","従業員7","従業員8","従業員9","従業員10","従業員11","従業員12"];'
```

`tierEls.forEach(function(t,i){...});`(購入ハンドラのブロック)の直後、`setInterval(...)`の前に追加:

```js
  + 'fetch("/api/incremental/roster").then(function(r){return r.json();}).then(function(d){'
  + 'var roster=(d&&d.roster)||[];'
  + 'for(var ri=0;ri<TIER_COUNT;ri++){'
  + 'var label=(roster[ri]&&roster[ri].name)?roster[ri].name:FALLBACK_NAMES[ri];'
  + 'if(tierEls[ri].nameEl)tierEls[ri].nameEl.textContent=label;'
  + '}'
  + '}).catch(function(){});'
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: PASS(全11テスト)

- [ ] **Step 5: `npm test`全体を実行**

Run: `cd web && npm test`
Expected: 全テストPASS

- [ ] **Step 6: コミット**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Fetch the real backlog roster to label employee tiers, with a generic-name fallback"
```

---

### Task 6: クレジット→DP交換

**Files:**
- Modify: `web/views/incrementalPage.js`
- Modify: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: `CREDITS_KEY`(Task 2で定義済み) / `addDp` / `saveState` / `renderDp` / `page`
- Produces: なし(末端機能)。

- [ ] **Step 1: 失敗するテストを追加**

```js
test('renderIncrementalPage lets the player exchange roulette credits for DP at a fixed one-way rate', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var EXCHANGE_RATE=10;/);
  assert.match(html, /function loadRouletteCredits\(\)\{/);
  assert.match(html, /var raw=Number\(localStorage\.getItem\(CREDITS_KEY\)\);/);
  assert.match(html, /exchangeBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /if\(amount>have\)\{/);
  assert.match(html, /exchangeResultEl\.textContent="クレジットが足りません";/);
  assert.match(html, /localStorage\.setItem\(CREDITS_KEY,String\(have-amount\)\);/);
  assert.match(html, /addDp\(amount\/EXCHANGE_RATE\);/);
  // DP→クレジットの逆交換が存在しないことを保証する(一方通行の設計制約)
  assert.doesNotMatch(html, /localStorage\.getItem\(DP_KEY\)[^;]*CREDITS_KEY[^;]*setItem/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: FAIL(1件)

- [ ] **Step 3: `CLIENT_SCRIPT`を拡張**

`var OFFLINE_CAP_SECONDS=28800;`の直後に追加:

```js
  + 'var EXCHANGE_RATE=10;'
```

roster取得の`fetch(...)`ブロックの直後、`setInterval(...)`の前に追加:

```js
  + 'var exchangeInput=page.querySelector("#incremental-exchange-amount");'
  + 'var exchangeBtn=page.querySelector("#incremental-exchange-btn");'
  + 'var exchangeResultEl=page.querySelector("#incremental-exchange-result");'
  + 'var creditsAvailableEl=page.querySelector("#incremental-credits-available");'
  + 'function loadRouletteCredits(){'
  + 'var raw=Number(localStorage.getItem(CREDITS_KEY));'
  + 'return (isFinite(raw)&&raw>=0)?raw:0;'
  + '}'
  + 'function renderCreditsAvailable(){'
  + 'if(creditsAvailableEl)creditsAvailableEl.textContent=loadRouletteCredits().toLocaleString();'
  + '}'
  + 'renderCreditsAvailable();'
  + 'if(exchangeBtn){'
  + 'exchangeBtn.addEventListener("click",function(){'
  + 'var amount=Math.floor(Number(exchangeInput&&exchangeInput.value));'
  + 'if(!isFinite(amount)||amount<=0){'
  + 'if(exchangeResultEl)exchangeResultEl.textContent="交換枚数を入力してください";'
  + 'return;'
  + '}'
  + 'var have=loadRouletteCredits();'
  + 'if(amount>have){'
  + 'if(exchangeResultEl)exchangeResultEl.textContent="クレジットが足りません";'
  + 'return;'
  + '}'
  + 'localStorage.setItem(CREDITS_KEY,String(have-amount));'
  + 'addDp(amount/EXCHANGE_RATE);'
  + 'saveState();'
  + 'renderDp();'
  + 'renderCreditsAvailable();'
  + 'if(exchangeResultEl)exchangeResultEl.textContent=amount+"クレジットを"+(amount/EXCHANGE_RATE)+"DPに交換しました";'
  + '});'
  + '}'
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: PASS(全12テスト)

- [ ] **Step 5: `npm test`全体を実行**

Run: `cd web && npm test`
Expected: 全テストPASS

- [ ] **Step 6: コミット**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Add a one-way credits-to-DP exchange, with no reverse conversion"
```

---

### Task 7: プレステージ(新年度リセット)

**Files:**
- Modify: `web/views/incrementalPage.js`
- Modify: `web/views/incrementalPage.test.js`

**Interfaces:**
- Consumes: `dp` / `owned` / `lifetimeDp` / `prestigeMult` / `saveState` / `renderDp` / `renderTiers` / `renderPrestige` / `page` / `TIER_COUNT`
- Produces: なし(末端機能。これでゲームロジックは完成)。

- [ ] **Step 1: 失敗するテストを追加**

```js
test('renderIncrementalPage lets the player prestige-reset dp/owned for a permanent multiplier based on lifetime DP', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var PRESTIGE_COEF=0\.1;/);
  assert.match(html, /var PRESTIGE_DIVISOR=1000000;/);
  assert.match(html, /prestigeBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /if\(!window\.confirm\(/);
  assert.match(html, /dp=0;/);
  assert.match(html, /owned=new Array\(TIER_COUNT\)\.fill\(0\);/);
  assert.match(html, /prestigeMult=1\+PRESTIGE_COEF\*Math\.sqrt\(lifetimeDp\/PRESTIGE_DIVISOR\);/);
  // 累計DP(lifetimeDp)自体はプレステージでリセットしない(倍率計算の根拠として残す)
  assert.doesNotMatch(html, /lifetimeDp=0;/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: FAIL(1件)

- [ ] **Step 3: `CLIENT_SCRIPT`を拡張**

`var EXCHANGE_RATE=10;`の直後に追加:

```js
  + 'var PRESTIGE_COEF=0.1;'
  + 'var PRESTIGE_DIVISOR=1000000;'
```

交換機能ブロックの直後、`setInterval(...)`の前に追加:

```js
  + 'var prestigeBtn=page.querySelector("#incremental-prestige-btn");'
  + 'if(prestigeBtn){'
  + 'prestigeBtn.addEventListener("click",function(){'
  + 'if(!window.confirm("新年度リセットします。DPと従業員は0に戻りますが、永続倍率を獲得します。よろしいですか?"))return;'
  + 'dp=0;'
  + 'owned=new Array(TIER_COUNT).fill(0);'
  + 'prestigeMult=1+PRESTIGE_COEF*Math.sqrt(lifetimeDp/PRESTIGE_DIVISOR);'
  + 'saveState();'
  + 'renderDp();'
  + 'renderTiers();'
  + 'renderPrestige();'
  + '});'
  + '}'
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd web && npx node --test views/incrementalPage.test.js`
Expected: PASS(全13テスト)

- [ ] **Step 5: `npm test`全体を実行**

Run: `cd web && npm test`
Expected: 全テストPASS

- [ ] **Step 6: コミット**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Add prestige reset with a permanent output multiplier based on lifetime DP"
```

---

### Task 8: トップページに導線を追加

**Files:**
- Modify: `web/views/topPage.js`
- Modify: `web/views/topPage.test.js`

**Interfaces:**
- Consumes: なし
- Produces: なし(末端機能)。

- [ ] **Step 1: 失敗するテストを追加**

`web/views/topPage.test.js`の`'renderTopPage includes links to both roulette pages and the shop'`テストの直後に追加:

```js
test('renderTopPage includes a link to the incremental game', () => {
  const page = renderTopPage({ history: [], favorites: [] });
  assert.match(page, /href="\/incremental"/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd web && npx node --test views/topPage.test.js`
Expected: FAIL(1件)

- [ ] **Step 3: `web/views/topPage.js`を編集**

```js
  parts.push('<p class="roulette-links"><a href="/roulette/backlog">🎰 積みゲールーレット</a> ・ '
    + '<a href="/roulette/recommend">🎰 おすすめルーレット</a> ・ '
    + '<a href="/shop">🏪 ショップ</a> ・ '
    + '<a href="/incremental">🏭 積みゲー消化工場</a></p>');
```

(既存の`parts.push('<p class="roulette-links">...`の1文を上記に置き換える。)

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd web && npx node --test views/topPage.test.js`
Expected: PASS

- [ ] **Step 5: `npm test`全体を実行**

Run: `cd web && npm test`
Expected: 全テストPASS(これでゲーム本体の実装は完了)

- [ ] **Step 6: コミット**

```bash
git add web/views/topPage.js web/views/topPage.test.js
git commit -m "Link the incremental game from the top page"
```

---

### Task 9: 手動ブラウザ検証 + デプロイ

**Files:** なし(検証のみ)

**Interfaces:** なし

- [ ] **Step 1: 静的レンダリング + ローカルHTTPサーバーで起動**

このセッションで確立済みのワークフロー(scratchpadディレクトリに静的HTMLを書き出し、`http.createServer`で配信、ポートは使用後に必ず`taskkill`で解放)を使う:

```bash
node -e "
const { renderLayout } = require('./views/layout.js');
const { renderIncrementalPage } = require('./views/incrementalPage.js');
const fs = require('fs');
const html = renderLayout(renderIncrementalPage({}), {});
fs.writeFileSync('<scratchpad>/incremental_test.html', html);
"
```

- [ ] **Step 2: Chrome DevTools MCPでブラウザ確認**

以下を実際にクリック/入力して確認する:
1. 「🛠️ 作業する」ボタンを数回クリック → DP残高が増える
2. 従業員1体を購入 → 所持数が増え、コスト表示が指数的に上昇する
3. 1〜2秒待つ → DPが自動で増える(setIntervalのティック)
4. `localStorage.setItem('ja_trans_roulette_credits_v1','1000')`をコンソールから実行 → ページ再読込 → 交換UIに「1000」が表示される → 100クレジットを交換 → DPが+10増え、クレジット表示が900に減る
5. `localStorage.setItem('ja_trans_incremental_lasttick_v1', String(Date.now()-3600000))`(1時間前)をセットしてページ再読込 → 「おかえりなさい」メッセージとDP増加を確認
6. プレステージボタンをクリック → 確認ダイアログが出ることを確認 → 確認後、DPと所持数が0に戻り倍率が更新される
7. `/`(トップページ)から「🏭 積みゲー消化工場」リンクで`/incremental`に遷移できることを確認

- [ ] **Step 3: ポートを解放しタブを閉じる**

```bash
netstat -ano | grep ":<port>" | awk '{print $5}' | sort -u | xargs -r -I{} taskkill //F //PID {}
```

- [ ] **Step 4: 本番デプロイ**

```bash
git push origin main
ssh -i "C:\Users\raito\steam-ja-translate\SSH\ssh-key-2026-08-18.key" opc@140.83.80.109 \
  "cd steam-ja-translate && git pull origin main && sudo systemctl restart web-dashboard.service && sleep 2 && curl -s -o /dev/null -w 'healthz:%{http_code}\n' http://100.96.33.1:3000/healthz"
```

Expected: `healthz:200`

- [ ] **Step 5: 本番URLで最終確認**

VM上の`/incremental`にブラウザでアクセスし、Step 2の1〜3を本番環境でも簡易的に再確認する(積みゲーロスターAPIが実際の`STEAM_API_KEY`/`STEAM_ID64`で動作し、tier名が実際の積みゲー名に置き換わることを確認する — ローカル検証では`STEAM_API_KEY`が無い場合フォールバック名のままになるため、これは本番でしか確認できない)。
