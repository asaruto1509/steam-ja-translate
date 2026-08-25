# 積みゲー消化工場 スキルツリー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permanent, 3-branch/20-node skill tree to the incremental game, funded by a new Skill Point (SP) resource earned from prestige resets, achievement unlocks, and a DP research-investment action.

**Architecture:** All skill-tree game data (node definitions) and pure calculation logic live once in a new sibling module, `web/views/incrementalSkills.js`, as real (non-string) JS functions — so they can be unit-tested directly with `node:test`. `incrementalPage.js` composes that module's exported HTML/CSS fragments and its client-script fragment (produced by calling `.toString()` on the exported pure functions and splicing that source into the page's existing single-IIFE client script) into its own output, and wires the exported pure functions into its existing formulas (tier output, tier cost, click power, offline cap, exchange rates, bonus frequency/value, prestige multiplier).

**Tech Stack:** Plain Node.js (no framework), `node:test` + `node:assert/strict`, vanilla client-side JS (no build step — the client script is authored as literal JS source, either as string-concatenated fragments matching this file's existing convention, or as real functions whose `.toString()` is spliced in).

**Spec:** `docs/superpowers/specs/2026-08-25-incremental-skill-tree-design.md`

## Global Constraints

- Skill tree data and derived-multiplier functions are defined **exactly once**, in `web/views/incrementalSkills.js` — never duplicated as a second hand-written copy in `incrementalPage.js`'s string-literal client script.
- The skill tree (`sp`, `skillLevels`, `researchUses`) is **never reset by prestige** — it is not added to any reset/clear path.
- `DP_TO_CREDITS_DAILY_CAP` (300 credits/day anti-inflation cap, from the prior roulette-economy work) must **not** be changed by any skill node — only the *rate* (how much DP a credit conversion costs) may improve.
- Every new/changed piece of client-script text must keep the existing `new Function(extractedScript)` syntax-validity test (in `incrementalPage.test.js`) passing.
- Follow the existing code style in `web/views/incrementalPage.js`: `'use strict'`, string-concatenated `CLIENT_SCRIPT`/`CLIENT_STYLE` built with `+=`-style chained `+`, `var` (not `let`/`const`) inside the client script, 2-space indent in the Node-side module code.
- All new localStorage keys use the existing naming convention: `ja_trans_incremental_<name>_v1`.

---

## File Structure

- **Create:** `web/views/incrementalSkills.js` — skill tree node data, pure derived-multiplier functions, HTML/CSS fragment builders, and the client-script fragment builder. This is the single source of truth for all skill-tree game data and logic.
- **Create:** `web/views/incrementalSkills.test.js` — direct unit tests (real function calls, not regex) against the exports above.
- **Modify:** `web/views/incrementalPage.js` — requires `incrementalSkills.js`; composes its HTML/CSS/script fragments into the page; adds SP/skillLevels/researchUses state; wires the pure functions into existing formulas; wires the two remaining unique effects (auto-buy tick, auto-collect-bonus timeout) directly (these touch page-only state like `owned`/`bonusEl` that has no reason to live in the shared module); wires SP grants at prestige and achievement-unlock.
- **Modify:** `web/views/incrementalPage.test.js` — regex-style assertions (matching this file's existing convention) confirming the new wiring is present in the rendered output.

---

### Task 1: Skill tree data + pure multiplier functions (`incrementalSkills.js`)

**Files:**
- Create: `web/views/incrementalSkills.js`
- Test: `web/views/incrementalSkills.test.js`

**Interfaces:**
- Produces (used by Task 2, 4, 5, 6, 7 and by `incrementalPage.js`):
  - `SKILL_BRANCHES: { production: Node[], management: Node[], luck: Node[] }` where `Node = {cost: number, label: string, kind: string, value: number|string}`
  - `BRANCH_ORDER: string[]` — `['production', 'management', 'luck']`
  - `BRANCH_LABELS: { production: string, management: string, luck: string }`
  - `computeOutputMult(skillLevels): number`
  - `computeCostMult(skillLevels): number`
  - `computeClickMult(skillLevels): number`
  - `computeOfflineBonusSeconds(skillLevels): number`
  - `computeExchangeMult(skillLevels): number`
  - `computeBonusIntervalMult(skillLevels): number`
  - `computeBonusValueMult(skillLevels): number`
  - `computePrestigeCoefMult(skillLevels): number`
  - `hasAutoBuy(skillLevels): boolean`
  - `hasOfflineBoost(skillLevels): boolean`
  - `hasAutoCollectBonus(skillLevels): boolean`
  - `nextNodeCost(skillLevels, branchId): number|null`
  - `isNodeUnlockable(skillLevels, branchId, sp): boolean`
  - where `skillLevels = {production: number, management: number, luck: number}` (each 0..branch.length, how many nodes are unlocked in that branch, in order).

- [ ] **Step 1: Write the failing test**

Create `web/views/incrementalSkills.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const skills = require('./incrementalSkills.js');

test('SKILL_BRANCHES has exactly 3 branches with the documented node counts', () => {
  assert.deepEqual(skills.BRANCH_ORDER, ['production', 'management', 'luck']);
  assert.equal(skills.SKILL_BRANCHES.production.length, 7);
  assert.equal(skills.SKILL_BRANCHES.management.length, 7);
  assert.equal(skills.SKILL_BRANCHES.luck.length, 6);
});

test('every branch has non-decreasing node costs and ends with a unique-kind capstone', () => {
  skills.BRANCH_ORDER.forEach((b) => {
    const nodes = skills.SKILL_BRANCHES[b];
    for (let i = 1; i < nodes.length; i++) {
      assert.ok(nodes[i].cost >= nodes[i - 1].cost, `${b} node ${i} cost must not decrease`);
    }
    assert.equal(nodes[nodes.length - 1].kind, 'unique', `${b} must end with a unique-effect node`);
  });
});

test('computeOutputMult sums only production outputMult nodes as unlocked levels increase', () => {
  const none = { production: 0, management: 0, luck: 0 };
  const some = { production: 2, management: 0, luck: 0 }; // both outputMult nodes (+0.05 each)
  const withCostNode = { production: 3, management: 0, luck: 0 }; // + a costMult node, must not affect output
  const all = { production: 7, management: 0, luck: 0 };
  assert.equal(skills.computeOutputMult(none), 1);
  assert.equal(skills.computeOutputMult(some), 1.1);
  assert.equal(skills.computeOutputMult(withCostNode), 1.1);
  assert.equal(Math.round(skills.computeOutputMult(all) * 100) / 100, 1.25);
});

test('computeCostMult sums only production costMult nodes', () => {
  const all = { production: 7, management: 0, luck: 0 };
  assert.equal(Math.round(skills.computeCostMult(all) * 100) / 100, 0.94);
});

test('computeClickMult sums only management clickMult nodes', () => {
  const all = { production: 0, management: 7, luck: 0 };
  assert.equal(skills.computeClickMult(all), 4);
});

test('computeOfflineBonusSeconds sums management offlineHours nodes in seconds', () => {
  const all = { production: 0, management: 7, luck: 0 };
  assert.equal(skills.computeOfflineBonusSeconds(all), 12 * 3600);
});

test('computeExchangeMult sums management exchangeMult nodes', () => {
  const all = { production: 0, management: 7, luck: 0 };
  assert.equal(Math.round(skills.computeExchangeMult(all) * 100) / 100, 1.1);
});

test('computeBonusIntervalMult sums luck bonusIntervalMult nodes and never drops below 0.2', () => {
  const none = { production: 0, management: 0, luck: 0 };
  const all = { production: 0, management: 0, luck: 6 };
  assert.equal(skills.computeBonusIntervalMult(none), 1);
  assert.equal(Math.round(skills.computeBonusIntervalMult(all) * 100) / 100, 0.6);
});

test('computeBonusValueMult sums luck bonusValueMult nodes', () => {
  const all = { production: 0, management: 0, luck: 6 };
  assert.equal(Math.round(skills.computeBonusValueMult(all) * 100) / 100, 1.5);
});

test('computePrestigeCoefMult sums luck prestigeCoefMult nodes', () => {
  const all = { production: 0, management: 0, luck: 6 };
  assert.equal(Math.round(skills.computePrestigeCoefMult(all) * 100) / 100, 1.2);
});

test('hasAutoBuy/hasOfflineBoost/hasAutoCollectBonus are true only when their branch is fully unlocked', () => {
  const none = { production: 0, management: 0, luck: 0 };
  const almostProd = { production: 6, management: 0, luck: 0 };
  const fullProd = { production: 7, management: 0, luck: 0 };
  const fullMgmt = { production: 0, management: 7, luck: 0 };
  const fullLuck = { production: 0, management: 0, luck: 6 };
  assert.equal(skills.hasAutoBuy(none), false);
  assert.equal(skills.hasAutoBuy(almostProd), false);
  assert.equal(skills.hasAutoBuy(fullProd), true);
  assert.equal(skills.hasOfflineBoost(fullMgmt), true);
  assert.equal(skills.hasAutoCollectBonus(fullLuck), true);
});

test('nextNodeCost returns the next unlockable node cost, or null when the branch is complete', () => {
  const start = { production: 0, management: 0, luck: 0 };
  const mid = { production: 3, management: 0, luck: 0 };
  const done = { production: 7, management: 0, luck: 0 };
  assert.equal(skills.nextNodeCost(start, 'production'), 1);
  assert.equal(skills.nextNodeCost(mid, 'production'), 3);
  assert.equal(skills.nextNodeCost(done, 'production'), null);
});

test('isNodeUnlockable checks both that a next node exists and the player can afford it', () => {
  const start = { production: 0, management: 0, luck: 0 };
  const done = { production: 7, management: 0, luck: 0 };
  assert.equal(skills.isNodeUnlockable(start, 'production', 0), false);
  assert.equal(skills.isNodeUnlockable(start, 'production', 1), true);
  assert.equal(skills.isNodeUnlockable(done, 'production', 999), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/views/incrementalSkills.test.js`
Expected: FAIL — `Cannot find module './incrementalSkills.js'`

- [ ] **Step 3: Write minimal implementation**

Create `web/views/incrementalSkills.js`:

```js
'use strict';

var SKILL_BRANCHES = {
  production: [
    { cost: 1, label: '効率化研修', kind: 'outputMult', value: 0.05 },
    { cost: 2, label: '効率化研修II', kind: 'outputMult', value: 0.05 },
    { cost: 2, label: '資材ルート開拓', kind: 'costMult', value: -0.03 },
    { cost: 3, label: '効率化研修III', kind: 'outputMult', value: 0.05 },
    { cost: 3, label: '資材ルート開拓II', kind: 'costMult', value: -0.03 },
    { cost: 5, label: '効率化研修IV', kind: 'outputMult', value: 0.10 },
    { cost: 8, label: '自動発注システム', kind: 'unique', value: 'autoBuy' }
  ],
  management: [
    { cost: 1, label: '作業効率UP', kind: 'clickMult', value: 0.5 },
    { cost: 2, label: '作業効率UPII', kind: 'clickMult', value: 0.5 },
    { cost: 2, label: 'オフライン稼働延長', kind: 'offlineHours', value: 4 },
    { cost: 3, label: '為替交渉術', kind: 'exchangeMult', value: 0.10 },
    { cost: 3, label: 'オフライン稼働延長II', kind: 'offlineHours', value: 8 },
    { cost: 5, label: '作業効率UPIII', kind: 'clickMult', value: 2.0 },
    { cost: 8, label: '秘書雇用', kind: 'unique', value: 'offlineBoost' }
  ],
  luck: [
    { cost: 1, label: '強運の勘', kind: 'bonusIntervalMult', value: -0.20 },
    { cost: 2, label: '商才', kind: 'bonusValueMult', value: 0.25 },
    { cost: 3, label: '強運の勘II', kind: 'bonusIntervalMult', value: -0.20 },
    { cost: 3, label: '永続経営術', kind: 'prestigeCoefMult', value: 0.20 },
    { cost: 4, label: '商才II', kind: 'bonusValueMult', value: 0.25 },
    { cost: 7, label: '幸運の従業員', kind: 'unique', value: 'autoCollectBonus' }
  ]
};

var BRANCH_ORDER = ['production', 'management', 'luck'];
var BRANCH_LABELS = { production: '生産ライン強化', management: '経営戦略', luck: '強運' };

function computeOutputMult(skillLevels) {
  var sum = 0;
  var nodes = SKILL_BRANCHES.production;
  for (var i = 0; i < skillLevels.production; i++) {
    if (nodes[i].kind === 'outputMult') sum += nodes[i].value;
  }
  return 1 + sum;
}

function computeCostMult(skillLevels) {
  var sum = 0;
  var nodes = SKILL_BRANCHES.production;
  for (var i = 0; i < skillLevels.production; i++) {
    if (nodes[i].kind === 'costMult') sum += nodes[i].value;
  }
  return 1 + sum;
}

function computeClickMult(skillLevels) {
  var sum = 0;
  var nodes = SKILL_BRANCHES.management;
  for (var i = 0; i < skillLevels.management; i++) {
    if (nodes[i].kind === 'clickMult') sum += nodes[i].value;
  }
  return 1 + sum;
}

function computeOfflineBonusSeconds(skillLevels) {
  var sum = 0;
  var nodes = SKILL_BRANCHES.management;
  for (var i = 0; i < skillLevels.management; i++) {
    if (nodes[i].kind === 'offlineHours') sum += nodes[i].value;
  }
  return sum * 3600;
}

function computeExchangeMult(skillLevels) {
  var sum = 0;
  var nodes = SKILL_BRANCHES.management;
  for (var i = 0; i < skillLevels.management; i++) {
    if (nodes[i].kind === 'exchangeMult') sum += nodes[i].value;
  }
  return 1 + sum;
}

function computeBonusIntervalMult(skillLevels) {
  var sum = 0;
  var nodes = SKILL_BRANCHES.luck;
  for (var i = 0; i < skillLevels.luck; i++) {
    if (nodes[i].kind === 'bonusIntervalMult') sum += nodes[i].value;
  }
  return Math.max(0.2, 1 + sum);
}

function computeBonusValueMult(skillLevels) {
  var sum = 0;
  var nodes = SKILL_BRANCHES.luck;
  for (var i = 0; i < skillLevels.luck; i++) {
    if (nodes[i].kind === 'bonusValueMult') sum += nodes[i].value;
  }
  return 1 + sum;
}

function computePrestigeCoefMult(skillLevels) {
  var sum = 0;
  var nodes = SKILL_BRANCHES.luck;
  for (var i = 0; i < skillLevels.luck; i++) {
    if (nodes[i].kind === 'prestigeCoefMult') sum += nodes[i].value;
  }
  return 1 + sum;
}

function hasAutoBuy(skillLevels) {
  return skillLevels.production >= SKILL_BRANCHES.production.length;
}

function hasOfflineBoost(skillLevels) {
  return skillLevels.management >= SKILL_BRANCHES.management.length;
}

function hasAutoCollectBonus(skillLevels) {
  return skillLevels.luck >= SKILL_BRANCHES.luck.length;
}

function nextNodeCost(skillLevels, branchId) {
  var nodes = SKILL_BRANCHES[branchId];
  var level = skillLevels[branchId];
  if (level >= nodes.length) return null;
  return nodes[level].cost;
}

function isNodeUnlockable(skillLevels, branchId, sp) {
  var cost = nextNodeCost(skillLevels, branchId);
  return cost !== null && sp >= cost;
}

module.exports = {
  SKILL_BRANCHES: SKILL_BRANCHES,
  BRANCH_ORDER: BRANCH_ORDER,
  BRANCH_LABELS: BRANCH_LABELS,
  computeOutputMult: computeOutputMult,
  computeCostMult: computeCostMult,
  computeClickMult: computeClickMult,
  computeOfflineBonusSeconds: computeOfflineBonusSeconds,
  computeExchangeMult: computeExchangeMult,
  computeBonusIntervalMult: computeBonusIntervalMult,
  computeBonusValueMult: computeBonusValueMult,
  computePrestigeCoefMult: computePrestigeCoefMult,
  hasAutoBuy: hasAutoBuy,
  hasOfflineBoost: hasOfflineBoost,
  hasAutoCollectBonus: hasAutoCollectBonus,
  nextNodeCost: nextNodeCost,
  isNodeUnlockable: isNodeUnlockable
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/views/incrementalSkills.test.js`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add web/views/incrementalSkills.js web/views/incrementalSkills.test.js
git commit -m "Add skill tree node data and pure derived-multiplier functions"
```

---

### Task 2: Skill panel markup + styles, composed into the page

**Files:**
- Modify: `web/views/incrementalSkills.js` (add `renderSkillPanelHtml`, `SKILL_STYLE`)
- Modify: `web/views/incrementalPage.js:1-2` (require), `:486-547` (composition)
- Test: `web/views/incrementalSkills.test.js` (append), `web/views/incrementalPage.test.js` (append)

**Interfaces:**
- Consumes: `SKILL_BRANCHES`, `BRANCH_ORDER`, `BRANCH_LABELS` from Task 1.
- Produces: `renderSkillPanelHtml(): string` (static HTML, node ids `incremental-skill-node-<branch>-<i>` / `incremental-skill-bead-<branch>-<i>` / `incremental-skill-cost-<branch>-<i>`, plus `incremental-sp-value`, `incremental-research-btn`, `incremental-research-cost`), `SKILL_STYLE: string` — both consumed by Task 4's client-script wiring (element ids must match) and by `incrementalPage.js`.

- [ ] **Step 1: Write the failing test**

Append to `web/views/incrementalSkills.test.js`:

```js
test('renderSkillPanelHtml renders every node with matching bead/cost ids and the SP/research HUD', () => {
  const html = skills.renderSkillPanelHtml();
  skills.BRANCH_ORDER.forEach((b) => {
    skills.SKILL_BRANCHES[b].forEach((n, i) => {
      assert.match(html, new RegExp('id="incremental-skill-node-' + b + '-' + i + '"'));
      assert.match(html, new RegExp('id="incremental-skill-bead-' + b + '-' + i + '"'));
      assert.match(html, new RegExp('id="incremental-skill-cost-' + b + '-' + i + '"'));
      assert.match(html, new RegExp(n.label));
    });
  });
  assert.match(html, /id="incremental-sp-value"/);
  assert.match(html, /id="incremental-research-btn"/);
  assert.match(html, /id="incremental-research-cost"/);
});

test('SKILL_STYLE styles the skill node beads and lock/unlock/affordable states', () => {
  assert.match(skills.SKILL_STYLE, /\.incremental-skill-node-bead\{/);
  assert.match(skills.SKILL_STYLE, /\.incremental-skill-node\.is-unlocked/);
  assert.match(skills.SKILL_STYLE, /\.incremental-skill-node\.is-affordable/);
  assert.match(skills.SKILL_STYLE, /\.incremental-skill-node\.is-locked/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/views/incrementalSkills.test.js`
Expected: FAIL — `skills.renderSkillPanelHtml is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `web/views/incrementalSkills.js`, just before `module.exports`:

```js
function renderSkillPanelHtml() {
  var branchesHtml = BRANCH_ORDER.map(function (b) {
    var nodesHtml = SKILL_BRANCHES[b].map(function (n, i) {
      return '<button type="button" class="incremental-skill-node" id="incremental-skill-node-' + b + '-' + i + '">'
        + '<span class="incremental-skill-node-bead" id="incremental-skill-bead-' + b + '-' + i + '"></span>'
        + '<span class="incremental-skill-node-label">' + n.label + '</span>'
        + '<span class="incremental-skill-node-cost" id="incremental-skill-cost-' + b + '-' + i + '">' + n.cost + ' SP</span>'
        + '</button>';
    }).join('');
    return '<div class="incremental-skill-branch" data-branch="' + b + '">'
      + '<div class="incremental-skill-branch-title">' + BRANCH_LABELS[b] + '</div>'
      + '<div class="incremental-skill-nodes">' + nodesHtml + '</div>'
      + '</div>';
  }).join('');
  return '<div class="incremental-panel incremental-skills">'
    + '<div class="incremental-panel-title">🌳 スキルツリー</div>'
    + '<div class="incremental-skills-hud">'
    + '<div class="incremental-chip incremental-sp"><div><div class="incremental-chip-label">SP</div>'
    + '<div class="incremental-chip-value"><span id="incremental-sp-value">0</span></div></div></div>'
    + '<button type="button" id="incremental-research-btn">🔬 研究にDPを投資(<span id="incremental-research-cost">500</span> DP)</button>'
    + '</div>'
    + '<div class="incremental-skill-branches">' + branchesHtml + '</div>'
    + '</div>';
}

var SKILL_STYLE = ''
  + '.incremental-skills-hud{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}'
  + '.incremental-sp{background:#e3f7d8}'
  + '#incremental-research-btn{padding:9px 16px;border-radius:12px;border:3px solid #3b2a1a;background:#a8d8b9;color:#1f3d1a;'
  + 'box-shadow:3px 3px 0 #3b2a1a;cursor:pointer;min-height:40px;font-size:13px;font-weight:800;font-family:inherit}'
  + '.incremental-skill-branches{display:flex;gap:16px;flex-wrap:wrap}'
  + '.incremental-skill-branch{flex:1;min-width:160px}'
  + '.incremental-skill-branch-title{font-size:13px;font-weight:800;text-align:center;margin-bottom:8px}'
  + '.incremental-skill-nodes{display:flex;flex-direction:column;align-items:center;gap:4px}'
  + '.incremental-skill-node{display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;'
  + 'cursor:pointer;padding:6px 4px;font-family:inherit;width:100%}'
  + '.incremental-skill-node-bead{width:28px;height:28px;border-radius:50%;border:3px solid #3b2a1a;background:#e7dcc4;'
  + 'display:block;position:relative}'
  + '.incremental-skill-node:not(:first-child) .incremental-skill-node-bead::before{content:"";position:absolute;'
  + 'top:-14px;left:50%;transform:translateX(-50%);width:3px;height:14px;background:#3b2a1a}'
  + '.incremental-skill-node.is-unlocked .incremental-skill-node-bead{background:#7bc86c}'
  + '.incremental-skill-node.is-affordable .incremental-skill-node-bead{background:#ffd75e}'
  + '.incremental-skill-node.is-next .incremental-skill-node-bead{opacity:0.7}'
  + '.incremental-skill-node.is-locked .incremental-skill-node-bead{opacity:0.35}'
  + '.incremental-skill-node-label{font-size:10px;font-weight:700;text-align:center}'
  + '.incremental-skill-node-cost{font-size:10px;font-weight:700;color:#8a6a3a}';
```

Then update `module.exports` in the same file to add:

```js
  renderSkillPanelHtml: renderSkillPanelHtml,
  SKILL_STYLE: SKILL_STYLE,
```

Now wire it into `incrementalPage.js`. Modify line 2 (`var html = require('../lib/html.js');`):

```js
var html = require('../lib/html.js');
var incrementalSkills = require('./incrementalSkills.js');
```

Modify the style composition — find (around line 484):

```js
  + '@keyframes incrementalBonusFloat{0%{transform:translateY(0)}100%{transform:translateY(-6px)}}';
```

Replace with:

```js
  + '@keyframes incrementalBonusFloat{0%{transform:translateY(0)}100%{transform:translateY(-6px)}}'
  + incrementalSkills.SKILL_STYLE;
```

Modify the markup composition — find (around line 540, right after the exchange panel's closing div, before the prestige wrap):

```js
    + '<p id="incremental-dp2credits-result"></p>'
    + '</div>'
    + '<div class="incremental-prestige-wrap">'
```

Replace with:

```js
    + '<p id="incremental-dp2credits-result"></p>'
    + '</div>'
    + incrementalSkills.renderSkillPanelHtml()
    + '<div class="incremental-prestige-wrap">'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/views/incrementalSkills.test.js web/views/incrementalPage.test.js`
Expected: PASS (all existing incrementalPage tests still pass unchanged; new incrementalSkills tests pass)

- [ ] **Step 5: Add incrementalPage.test.js coverage and commit**

Append to `web/views/incrementalPage.test.js`:

```js
test('renderIncrementalPage includes the skill tree panel from incrementalSkills.js', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /incremental-panel incremental-skills/);
  assert.match(html, /id="incremental-sp-value"/);
  assert.match(html, /id="incremental-research-btn"/);
  assert.match(html, /id="incremental-skill-node-production-0"/);
  assert.match(html, /id="incremental-skill-node-management-0"/);
  assert.match(html, /id="incremental-skill-node-luck-0"/);
  assert.match(html, /\.incremental-skill-node-bead\{/);
});
```

Run: `node --test web/views/incrementalPage.test.js`
Expected: PASS

```bash
git add web/views/incrementalSkills.js web/views/incrementalSkills.test.js web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Render the skill tree panel (static markup + styles) into the incremental page"
```

---

### Task 3: SP/skillLevels/researchUses state in `incrementalPage.js`

**Files:**
- Modify: `web/views/incrementalPage.js:25-90` (state keys, loaders, `saveState`)
- Test: `web/views/incrementalPage.test.js` (append)

**Interfaces:**
- Produces (used by Task 4, 5, 6, 7): client-script vars `sp` (number), `skillLevels` (`{production,management,luck}`), `researchUses` (number), `autoBuyTimer` (number, seconds accumulator for Task 6), and their localStorage keys `SP_KEY`, `SKILLS_KEY`, `RESEARCH_USES_KEY`. `saveState()` persists all three (not `autoBuyTimer`, which is a transient in-memory counter, not persisted).

- [ ] **Step 1: Write the failing test**

Append to `web/views/incrementalPage.test.js`:

```js
test('renderIncrementalPage loads and persists sp/skillLevels/researchUses state, never resetting them on prestige', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var SP_KEY="ja_trans_incremental_sp_v1";/);
  assert.match(html, /var SKILLS_KEY="ja_trans_incremental_skills_v1";/);
  assert.match(html, /var RESEARCH_USES_KEY="ja_trans_incremental_research_uses_v1";/);
  assert.match(html, /var sp=loadNumber\(SP_KEY,0\);/);
  assert.match(html, /var researchUses=loadNumber\(RESEARCH_USES_KEY,0\);/);
  assert.match(html, /function loadSkillLevels\(\)\{/);
  assert.match(html, /var skillLevels=loadSkillLevels\(\);/);
  assert.match(html, /localStorage\.setItem\(SP_KEY,String\(sp\)\);/);
  assert.match(html, /localStorage\.setItem\(SKILLS_KEY,JSON\.stringify\(skillLevels\)\);/);
  assert.match(html, /localStorage\.setItem\(RESEARCH_USES_KEY,String\(researchUses\)\);/);
  // prestige handler must not touch sp/skillLevels/researchUses
  const prestigeHandlerMatch = html.match(/prestigeBtn\.addEventListener\("click",function\(\)\{[\s\S]*?\}\);/);
  assert.ok(prestigeHandlerMatch, 'expected to find the prestige click handler');
  assert.doesNotMatch(prestigeHandlerMatch[0], /skillLevels=/);
  assert.doesNotMatch(prestigeHandlerMatch[0], /^sp=/m);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/views/incrementalPage.test.js`
Expected: FAIL — `SP_KEY` etc. not found in rendered output

- [ ] **Step 3: Write minimal implementation**

Modify `web/views/incrementalPage.js` — find (around line 30-34):

```js
  + 'var CREDITS_KEY="ja_trans_roulette_credits_v1";'
  + 'var DP2CREDITS_KEY="ja_trans_incremental_dp2credits_v1";'
  + 'var SOUND_KEY="ja_trans_incremental_sound_v1";'
  + 'var FALLBACK_NAMES=["従業員1","従業員2","従業員3","従業員4","従業員5","従業員6","従業員7","従業員8","従業員9","従業員10","従業員11","従業員12"];'
  + 'var TIER_COUNT=12;'
```

Replace with:

```js
  + 'var CREDITS_KEY="ja_trans_roulette_credits_v1";'
  + 'var DP2CREDITS_KEY="ja_trans_incremental_dp2credits_v1";'
  + 'var SOUND_KEY="ja_trans_incremental_sound_v1";'
  + 'var SP_KEY="ja_trans_incremental_sp_v1";'
  + 'var SKILLS_KEY="ja_trans_incremental_skills_v1";'
  + 'var RESEARCH_USES_KEY="ja_trans_incremental_research_uses_v1";'
  + 'var FALLBACK_NAMES=["従業員1","従業員2","従業員3","従業員4","従業員5","従業員6","従業員7","従業員8","従業員9","従業員10","従業員11","従業員12"];'
  + 'var TIER_COUNT=12;'
```

Find (around line 50-54):

```js
  + 'var dp=loadNumber(DP_KEY,0);'
  + 'var owned=loadOwned();'
  + 'var lastTick=loadNumber(LASTTICK_KEY,Date.now());'
  + 'var lifetimeDp=loadNumber(LIFETIME_KEY,0);'
  + 'var prestigeMult=loadNumber(PRESTIGE_KEY,1);'
```

Replace with:

```js
  + 'var dp=loadNumber(DP_KEY,0);'
  + 'var owned=loadOwned();'
  + 'var lastTick=loadNumber(LASTTICK_KEY,Date.now());'
  + 'var lifetimeDp=loadNumber(LIFETIME_KEY,0);'
  + 'var prestigeMult=loadNumber(PRESTIGE_KEY,1);'
  + 'var SKILL_BRANCH_LENGTHS={production:' + incrementalSkills.SKILL_BRANCHES.production.length + ',management:' + incrementalSkills.SKILL_BRANCHES.management.length + ',luck:' + incrementalSkills.SKILL_BRANCHES.luck.length + '};'
  + 'function loadSkillLevels(){'
  + 'var stored=localStorage.getItem(SKILLS_KEY);'
  + 'var fallback={production:0,management:0,luck:0};'
  + 'if(!stored)return fallback;'
  + 'try{'
  + 'var obj=JSON.parse(stored);'
  + 'if(!obj||typeof obj!=="object")return fallback;'
  + 'var out={};'
  + 'Object.keys(fallback).forEach(function(b){'
  + 'var n=obj[b];'
  + 'var max=SKILL_BRANCH_LENGTHS[b];'
  + 'out[b]=(isFinite(n)&&n>=0)?Math.min(max,Math.floor(n)):0;'
  + '});'
  + 'return out;'
  + '}catch(e){return fallback;}'
  + '}'
  + 'var sp=loadNumber(SP_KEY,0);'
  + 'var skillLevels=loadSkillLevels();'
  + 'var researchUses=loadNumber(RESEARCH_USES_KEY,0);'
  + 'var autoBuyTimer=0;'
```

Find (the `saveState` function, around line 84-90):

```js
  + 'function saveState(){'
  + 'localStorage.setItem(DP_KEY,String(dp));'
  + 'localStorage.setItem(OWNED_KEY,JSON.stringify(owned));'
  + 'localStorage.setItem(LASTTICK_KEY,String(lastTick));'
  + 'localStorage.setItem(LIFETIME_KEY,String(lifetimeDp));'
  + 'localStorage.setItem(PRESTIGE_KEY,String(prestigeMult));'
  + '}'
```

Replace with:

```js
  + 'function saveState(){'
  + 'localStorage.setItem(DP_KEY,String(dp));'
  + 'localStorage.setItem(OWNED_KEY,JSON.stringify(owned));'
  + 'localStorage.setItem(LASTTICK_KEY,String(lastTick));'
  + 'localStorage.setItem(LIFETIME_KEY,String(lifetimeDp));'
  + 'localStorage.setItem(PRESTIGE_KEY,String(prestigeMult));'
  + 'localStorage.setItem(SP_KEY,String(sp));'
  + 'localStorage.setItem(SKILLS_KEY,JSON.stringify(skillLevels));'
  + 'localStorage.setItem(RESEARCH_USES_KEY,String(researchUses));'
  + '}'
```

Note: this task does **not** touch the prestige click handler — it already only sets `dp`, `owned`, and `prestigeMult`, so the "must not touch sp/skillLevels" assertion in the test passes as-is once these declarations exist.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/views/incrementalPage.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Add persistent SP/skillLevels/researchUses state to the incremental page"
```

---

### Task 4: Skill tree client-script (unlock + research button wiring)

**Files:**
- Modify: `web/views/incrementalSkills.js` (add `buildSkillClientScript`)
- Modify: `web/views/incrementalPage.js` (splice the fragment in, right after the prestige handler)
- Test: `web/views/incrementalSkills.test.js` (append), `web/views/incrementalPage.test.js` (append)

**Interfaces:**
- Consumes: all Task 1 pure functions (embedded via `.toString()`), `renderSkillPanelHtml`'s element ids (Task 2), and the page-side vars `page`, `dp`, `sp`, `skillLevels`, `researchUses`, `dpEl`, `saveState`, `renderDp`, `renderTiers`, `renderIncome`, `punchEl`, `playBuySound`, `playDeniedSound`, `playExchangeSound` (all already defined earlier in `incrementalPage.js`'s `CLIENT_SCRIPT` by the point this fragment is spliced in).
- Produces: `buildSkillClientScript(): string` — a client-side JS source fragment defining `SKILL_BRANCHES`, `BRANCH_ORDER`, the 13 pure functions from Task 1 (as real function declarations, via `.toString()`), and DOM wiring: `renderSp()`, `renderSkillTree()`, unlock-button click handlers per node, and the research-investment button handler. This fragment is spliced into the *same* IIFE as the rest of `CLIENT_SCRIPT` (function declarations are hoisted, so splice position only matters for the `var` state reads/writes and DOM lookups, which all happen after `page`/`sp`/`skillLevels` are already assigned per Task 3).

- [ ] **Step 1: Write the failing test**

Append to `web/views/incrementalSkills.test.js`:

```js
test('buildSkillClientScript embeds the pure functions by source and wires unlock/research buttons', () => {
  const script = skills.buildSkillClientScript();
  assert.match(script, /var SKILL_BRANCHES=\{"production":\[/);
  assert.match(script, /var BRANCH_ORDER=\["production","management","luck"\];/);
  assert.match(script, /function computeOutputMult\(skillLevels\)\{/);
  assert.match(script, /function hasAutoBuy\(skillLevels\)\{/);
  assert.match(script, /function nextNodeCost\(skillLevels,branchId\)\{/);
  assert.match(script, /function renderSp\(\)\{/);
  assert.match(script, /function renderSkillTree\(\)\{/);
  assert.match(script, /var RESEARCH_BASE_COST=500;/);
  assert.match(script, /var RESEARCH_COST_GROWTH=1\.25;/);
  assert.match(script, /function researchCost\(\)\{return Math\.ceil\(RESEARCH_BASE_COST\*Math\.pow\(RESEARCH_COST_GROWTH,researchUses\)\);\}/);
  assert.doesNotThrow(() => new Function(script), 'buildSkillClientScript output must be syntactically valid standalone JS');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/views/incrementalSkills.test.js`
Expected: FAIL — `skills.buildSkillClientScript is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `web/views/incrementalSkills.js`, just before `module.exports` (after `SKILL_STYLE`):

```js
function buildSkillClientScript() {
  var pureFns = [
    computeOutputMult, computeCostMult, computeClickMult, computeOfflineBonusSeconds,
    computeExchangeMult, computeBonusIntervalMult, computeBonusValueMult, computePrestigeCoefMult,
    hasAutoBuy, hasOfflineBoost, hasAutoCollectBonus, nextNodeCost, isNodeUnlockable
  ];
  var fnSrc = pureFns.map(function (f) { return f.toString(); }).join('');
  return ''
    + 'var SKILL_BRANCHES=' + JSON.stringify(SKILL_BRANCHES) + ';'
    + 'var BRANCH_ORDER=' + JSON.stringify(BRANCH_ORDER) + ';'
    + fnSrc
    + 'var skillBeadEls={};'
    + 'BRANCH_ORDER.forEach(function(b){'
    + 'skillBeadEls[b]=SKILL_BRANCHES[b].map(function(n,i){return {'
    + 'wrap:page.querySelector("#incremental-skill-node-"+b+"-"+i),'
    + 'costEl:page.querySelector("#incremental-skill-cost-"+b+"-"+i)'
    + '};});'
    + '});'
    + 'var spEl=page.querySelector("#incremental-sp-value");'
    + 'function renderSp(){if(spEl)spEl.textContent=Math.floor(sp).toLocaleString();}'
    + 'function renderSkillTree(){'
    + 'BRANCH_ORDER.forEach(function(b){'
    + 'var level=skillLevels[b];'
    + 'SKILL_BRANCHES[b].forEach(function(n,i){'
    + 'var el=skillBeadEls[b][i];'
    + 'if(!el.wrap)return;'
    + 'var state=i<level?"is-unlocked":(i===level?(sp>=n.cost?"is-affordable":"is-next"):"is-locked");'
    + 'el.wrap.className="incremental-skill-node "+state;'
    + 'if(el.costEl)el.costEl.textContent=i<level?"解放済み":(n.cost+" SP");'
    + '});'
    + '});'
    + '}'
    + 'renderSp();'
    + 'renderSkillTree();'
    + 'BRANCH_ORDER.forEach(function(b){'
    + 'skillBeadEls[b].forEach(function(el,i){'
    + 'if(!el.wrap)return;'
    + 'el.wrap.addEventListener("click",function(){'
    + 'if(!isNodeUnlockable(skillLevels,b,sp)||i!==skillLevels[b]){playDeniedSound();return;}'
    + 'sp-=nextNodeCost(skillLevels,b);'
    + 'skillLevels[b]=skillLevels[b]+1;'
    + 'saveState();'
    + 'renderSp();'
    + 'renderSkillTree();'
    + 'renderTiers();'
    + 'renderIncome();'
    + 'playBuySound();'
    + '});'
    + '});'
    + '});'
    + 'var researchBtn=page.querySelector("#incremental-research-btn");'
    + 'var researchCostEl=page.querySelector("#incremental-research-cost");'
    + 'var RESEARCH_BASE_COST=500;'
    + 'var RESEARCH_COST_GROWTH=1.25;'
    + 'function researchCost(){return Math.ceil(RESEARCH_BASE_COST*Math.pow(RESEARCH_COST_GROWTH,researchUses));}'
    + 'function renderResearchCost(){if(researchCostEl)researchCostEl.textContent=researchCost().toLocaleString();}'
    + 'renderResearchCost();'
    + 'if(researchBtn){'
    + 'researchBtn.addEventListener("click",function(){'
    + 'var cost=researchCost();'
    + 'if(dp<cost){playDeniedSound();return;}'
    + 'dp-=cost;'
    + 'sp+=1;'
    + 'researchUses+=1;'
    + 'saveState();'
    + 'renderDp();'
    + 'renderSp();'
    + 'renderResearchCost();'
    + 'renderSkillTree();'
    + 'punchEl(dpEl);'
    + 'playExchangeSound();'
    + '});'
    + '}';
}
```

Update `module.exports` to add:

```js
  buildSkillClientScript: buildSkillClientScript
```

Now splice it into `incrementalPage.js`. Find (around line 336-350, the prestige handler block):

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
  + 'renderIncome();'
  + 'playPrestigeSound();'
  + '});'
  + '}'
  + 'var bonusZone=page.querySelector("#incremental-bonus-zone");'
```

Replace with (adds the splice point right after the prestige handler's closing `}`, before the bonus-zone section):

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
  + 'renderIncome();'
  + 'playPrestigeSound();'
  + '});'
  + '}'
  + incrementalSkills.buildSkillClientScript()
  + 'var bonusZone=page.querySelector("#incremental-bonus-zone");'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/views/incrementalSkills.test.js web/views/incrementalPage.test.js`
Expected: PASS

- [ ] **Step 5: Add incrementalPage.test.js coverage and commit**

Append to `web/views/incrementalPage.test.js`:

```js
test('renderIncrementalPage splices the skill tree client script into the same IIFE as the rest of the page logic', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var SKILL_BRANCHES=\{"production":\[/);
  assert.match(html, /function renderSkillTree\(\)\{/);
  assert.match(html, /el\.wrap\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /id="incremental-research-btn"/);
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch);
  assert.doesNotThrow(() => new Function(scriptMatch[1]));
});
```

Run: `node --test web/views/incrementalPage.test.js`
Expected: PASS

```bash
git add web/views/incrementalSkills.js web/views/incrementalSkills.test.js web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Wire skill tree node-unlock and research-investment buttons into the client script"
```

---

### Task 5: Wire skill multipliers into existing formulas

**Files:**
- Modify: `web/views/incrementalPage.js` (`totalOutputPerSec`, `tierCost`, click handler, offline cap/gain, exchange handlers, bonus interval/value, prestige multiplier)
- Test: `web/views/incrementalPage.test.js` (append)

**Interfaces:**
- Consumes: `computeOutputMult`, `computeCostMult`, `computeClickMult`, `computeOfflineBonusSeconds`, `computeExchangeMult`, `computeBonusIntervalMult`, `computeBonusValueMult`, `computePrestigeCoefMult` — all already available in the client script's scope as of Task 4 (hoisted function declarations), called with the page's own `skillLevels` var (Task 3).

- [ ] **Step 1: Write the failing test**

Append to `web/views/incrementalPage.test.js`:

```js
test('renderIncrementalPage applies skill multipliers to output, tier cost, click power, offline cap, exchange rates, bonus interval/value, and prestige coefficient', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /return sum\*prestigeMult\*computeOutputMult\(skillLevels\);/);
  assert.match(html, /function tierCost\(i,ownedCount\)\{return tierBaseCost\(i\)\*Math\.pow\(TIER_COST_GROWTH,ownedCount\)\*computeCostMult\(skillLevels\);\}/);
  assert.match(html, /addDp\(CLICK_BASE\*prestigeMult\*computeClickMult\(skillLevels\)\);/);
  assert.match(html, /var effectiveOfflineCap=OFFLINE_CAP_SECONDS\+computeOfflineBonusSeconds\(skillLevels\);/);
  assert.match(html, /var offlineGain=totalOutputPerSec\(\)\*elapsedSec\*\(hasOfflineBoost\(skillLevels\)\?1\.5:1\);/);
  assert.match(html, /var effectiveExchangeRate=EXCHANGE_RATE\/computeExchangeMult\(skillLevels\);/);
  assert.match(html, /var effectiveDpToCreditsRate=DP_TO_CREDITS_RATE\*computeExchangeMult\(skillLevels\);/);
  assert.match(html, /var delay=\(20000\+Math\.random\(\)\*25000\)\*computeBonusIntervalMult\(skillLevels\);/);
  assert.match(html, /var bonus=Math\.max\(10,totalOutputPerSec\(\)\*30\+CLICK_BASE\*20\)\*computeBonusValueMult\(skillLevels\);/);
  assert.match(html, /prestigeMult=1\+PRESTIGE_COEF\*computePrestigeCoefMult\(skillLevels\)\*Math\.sqrt\(lifetimeDp\/PRESTIGE_DIVISOR\);/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/views/incrementalPage.test.js`
Expected: FAIL — none of the `computeXMult(skillLevels)` calls exist yet

- [ ] **Step 3: Write minimal implementation**

All edits below are in `web/views/incrementalPage.js`.

**3a. Tier output.** Find:

```js
  + 'function totalOutputPerSec(){'
  + 'var sum=0;'
  + 'for(var i=0;i<TIER_COUNT;i++){sum+=owned[i]*tierBaseOutput(i);}'
  + 'return sum*prestigeMult;'
  + '}'
```

Replace with:

```js
  + 'function totalOutputPerSec(){'
  + 'var sum=0;'
  + 'for(var i=0;i<TIER_COUNT;i++){sum+=owned[i]*tierBaseOutput(i);}'
  + 'return sum*prestigeMult*computeOutputMult(skillLevels);'
  + '}'
```

**3b. Tier cost.** Find:

```js
  + 'function tierCost(i,ownedCount){return tierBaseCost(i)*Math.pow(TIER_COST_GROWTH,ownedCount);}'
```

Replace with:

```js
  + 'function tierCost(i,ownedCount){return tierBaseCost(i)*Math.pow(TIER_COST_GROWTH,ownedCount)*computeCostMult(skillLevels);}'
```

**3c. Offline cap + gain.** Find:

```js
  + 'var nowMs=Date.now();'
  + 'var elapsedSec=Math.max(0,Math.min(OFFLINE_CAP_SECONDS,(nowMs-lastTick)/1000));'
  + 'if(elapsedSec>1){'
  + 'var offlineGain=totalOutputPerSec()*elapsedSec;'
```

Replace with:

```js
  + 'var nowMs=Date.now();'
  + 'var effectiveOfflineCap=OFFLINE_CAP_SECONDS+computeOfflineBonusSeconds(skillLevels);'
  + 'var elapsedSec=Math.max(0,Math.min(effectiveOfflineCap,(nowMs-lastTick)/1000));'
  + 'if(elapsedSec>1){'
  + 'var offlineGain=totalOutputPerSec()*elapsedSec*(hasOfflineBoost(skillLevels)?1.5:1);'
```

**3d. Click handler.** Find:

```js
  + 'clickBtn.addEventListener("click",function(){'
  + 'addDp(CLICK_BASE*prestigeMult);'
```

Replace with:

```js
  + 'clickBtn.addEventListener("click",function(){'
  + 'addDp(CLICK_BASE*prestigeMult*computeClickMult(skillLevels));'
```

**3e. Credits→DP exchange rate.** Find:

```js
  + 'localStorage.setItem(CREDITS_KEY,String(have-amount));'
  + 'addDp(amount/EXCHANGE_RATE);'
  + 'saveState();'
  + 'renderDp();'
  + 'renderIncome();'
  + 'renderCreditsAvailable();'
  + 'punchEl(dpEl);'
  + 'playExchangeSound();'
  + 'if(exchangeResultEl)exchangeResultEl.textContent=amount+"クレジットを"+(amount/EXCHANGE_RATE)+"DPに交換しました";'
```

Replace with:

```js
  + 'var effectiveExchangeRate=EXCHANGE_RATE/computeExchangeMult(skillLevels);'
  + 'localStorage.setItem(CREDITS_KEY,String(have-amount));'
  + 'addDp(amount/effectiveExchangeRate);'
  + 'saveState();'
  + 'renderDp();'
  + 'renderIncome();'
  + 'renderCreditsAvailable();'
  + 'punchEl(dpEl);'
  + 'playExchangeSound();'
  + 'if(exchangeResultEl)exchangeResultEl.textContent=amount+"クレジットを"+(amount/effectiveExchangeRate)+"DPに交換しました";'
```

**3f. DP→credits exchange rate.** Find:

```js
  + 'var already=loadDp2CreditsToday();'
  + 'var remaining=Math.max(0,DP_TO_CREDITS_DAILY_CAP-already);'
  + 'var creditsGain=Math.min(remaining,Math.floor(dpAmount*DP_TO_CREDITS_RATE));'
  + 'if(creditsGain<=0){'
  + 'if(dp2cResultEl)dp2cResultEl.textContent="本日の変換上限に達しました";'
  + 'playDeniedSound();'
  + 'return;'
  + '}'
  + 'var dpSpent=creditsGain/DP_TO_CREDITS_RATE;'
```

Replace with:

```js
  + 'var effectiveDpToCreditsRate=DP_TO_CREDITS_RATE*computeExchangeMult(skillLevels);'
  + 'var already=loadDp2CreditsToday();'
  + 'var remaining=Math.max(0,DP_TO_CREDITS_DAILY_CAP-already);'
  + 'var creditsGain=Math.min(remaining,Math.floor(dpAmount*effectiveDpToCreditsRate));'
  + 'if(creditsGain<=0){'
  + 'if(dp2cResultEl)dp2cResultEl.textContent="本日の変換上限に達しました";'
  + 'playDeniedSound();'
  + 'return;'
  + '}'
  + 'var dpSpent=creditsGain/effectiveDpToCreditsRate;'
```

**3g. Prestige coefficient.** Find:

```js
  + 'prestigeMult=1+PRESTIGE_COEF*Math.sqrt(lifetimeDp/PRESTIGE_DIVISOR);'
```

Replace with:

```js
  + 'prestigeMult=1+PRESTIGE_COEF*computePrestigeCoefMult(skillLevels)*Math.sqrt(lifetimeDp/PRESTIGE_DIVISOR);'
```

**3h. Bonus interval + value.** Find:

```js
  + 'bonusEl.addEventListener("click",function(){'
  + 'var bonus=Math.max(10,totalOutputPerSec()*30+CLICK_BASE*20);'
```

Replace with:

```js
  + 'bonusEl.addEventListener("click",function(){'
  + 'var bonus=Math.max(10,totalOutputPerSec()*30+CLICK_BASE*20)*computeBonusValueMult(skillLevels);'
```

Find:

```js
  + 'function scheduleBonus(){'
  + 'var delay=20000+Math.random()*25000;'
  + 'setTimeout(function(){spawnBonus();scheduleBonus();},delay);'
  + '}'
```

Replace with:

```js
  + 'function scheduleBonus(){'
  + 'var delay=(20000+Math.random()*25000)*computeBonusIntervalMult(skillLevels);'
  + 'setTimeout(function(){spawnBonus();scheduleBonus();},delay);'
  + '}'
```

**3i. Tick's own offline-style cap.** Find:

```js
  + 'setInterval(function(){'
  + 'var now=Date.now();'
  + 'var d=Math.max(0,Math.min(OFFLINE_CAP_SECONDS,(now-lastTick)/1000));'
```

Replace with:

```js
  + 'setInterval(function(){'
  + 'var now=Date.now();'
  + 'var d=Math.max(0,Math.min(OFFLINE_CAP_SECONDS+computeOfflineBonusSeconds(skillLevels),(now-lastTick)/1000));'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/views/incrementalPage.test.js`
Expected: PASS. Also re-run the full existing suite to confirm nothing else broke: `node --test web/**/*.test.js`

- [ ] **Step 5: Commit**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Apply skill tree multipliers to output, cost, click power, offline cap, exchange rates, bonus, and prestige"
```

---

### Task 6: Unique effects — auto-buy tick and auto-collect-bonus

**Files:**
- Modify: `web/views/incrementalPage.js` (extract `buyTierIndex`, add auto-buy to the tick, add auto-collect timeout to `spawnBonus`)
- Test: `web/views/incrementalPage.test.js` (append)

**Interfaces:**
- Consumes: `hasAutoBuy(skillLevels)`, `hasAutoCollectBonus(skillLevels)` from Task 1/4.
- Produces: `buyTierIndex(i): boolean` — reusable so both the manual buy button and the auto-buy tick share one code path.

- [ ] **Step 1: Write the failing test**

Append to `web/views/incrementalPage.test.js`:

```js
test('renderIncrementalPage auto-buys the cheapest affordable tier every 60s once the production branch is fully unlocked', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function buyTierIndex\(i\)\{/);
  assert.match(html, /var cost=tierCost\(i,owned\[i\]\);/);
  assert.match(html, /if\(dp<cost\)return false;/);
  assert.match(html, /dp-=cost;/);
  assert.match(html, /owned\[i\]\+\+;/);
  assert.match(html, /return true;/);
  assert.match(html, /t\.buyBtn\.addEventListener\("click",function\(\)\{'\s*\+\s*'if\(!buyTierIndex\(i\)\)\{playDeniedSound\(\);return;\}/);
  assert.match(html, /if\(hasAutoBuy\(skillLevels\)\)\{/);
  assert.match(html, /autoBuyTimer\+=d;/);
  assert.match(html, /if\(autoBuyTimer>=60\)\{/);
});

test('renderIncrementalPage auto-collects the bonus star 5 seconds after it spawns once the luck branch is fully unlocked', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /if\(hasAutoCollectBonus\(skillLevels\)\)\{/);
  assert.match(html, /setTimeout\(function\(\)\{if\(bonusEl\)bonusEl\.click\(\);\},5000\);/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/views/incrementalPage.test.js`
Expected: FAIL — `buyTierIndex` / auto-buy / auto-collect code not present

- [ ] **Step 3: Write minimal implementation**

All edits below are in `web/views/incrementalPage.js`.

**3a. Extract `buyTierIndex` and use it from the button handler.** Find:

```js
  + 'tierEls.forEach(function(t,i){'
  + 'if(!t.buyBtn)return;'
  + 't.buyBtn.addEventListener("click",function(){'
  + 'var cost=tierCost(i,owned[i]);'
  + 'if(dp<cost){playDeniedSound();return;}'
  + 'dp-=cost;'
  + 'owned[i]++;'
  + 'saveState();'
  + 'renderDp();'
  + 'renderTiers();'
  + 'renderIncome();'
  + 'punchEl(dpEl);'
  + 'playBuySound();'
  + '});'
  + '});'
```

Replace with:

```js
  + 'function buyTierIndex(i){'
  + 'var cost=tierCost(i,owned[i]);'
  + 'if(dp<cost)return false;'
  + 'dp-=cost;'
  + 'owned[i]++;'
  + 'return true;'
  + '}'
  + 'tierEls.forEach(function(t,i){'
  + 'if(!t.buyBtn)return;'
  + 't.buyBtn.addEventListener("click",function(){'
  + 'if(!buyTierIndex(i)){playDeniedSound();return;}'
  + 'saveState();'
  + 'renderDp();'
  + 'renderTiers();'
  + 'renderIncome();'
  + 'punchEl(dpEl);'
  + 'playBuySound();'
  + '});'
  + '});'
```

**3b. Auto-buy in the tick.** Find (this is the `setInterval` block, already modified by Task 5's step 3i):

```js
  + 'setInterval(function(){'
  + 'var now=Date.now();'
  + 'var d=Math.max(0,Math.min(OFFLINE_CAP_SECONDS+computeOfflineBonusSeconds(skillLevels),(now-lastTick)/1000));'
  + 'addDp(totalOutputPerSec()*d);'
  + 'lastTick=now;'
  + 'saveState();'
  + 'renderDp();'
  + 'renderAchievements();'
  + '},1000);'
```

Replace with:

```js
  + 'setInterval(function(){'
  + 'var now=Date.now();'
  + 'var d=Math.max(0,Math.min(OFFLINE_CAP_SECONDS+computeOfflineBonusSeconds(skillLevels),(now-lastTick)/1000));'
  + 'addDp(totalOutputPerSec()*d);'
  + 'lastTick=now;'
  + 'if(hasAutoBuy(skillLevels)){'
  + 'autoBuyTimer+=d;'
  + 'if(autoBuyTimer>=60){'
  + 'autoBuyTimer=0;'
  + 'var cheapestIdx=-1,cheapestCost=Infinity;'
  + 'for(var abi=0;abi<TIER_COUNT;abi++){'
  + 'var abCost=tierCost(abi,owned[abi]);'
  + 'if(abCost<=dp&&abCost<cheapestCost){cheapestCost=abCost;cheapestIdx=abi;}'
  + '}'
  + 'if(cheapestIdx>=0){buyTierIndex(cheapestIdx);renderTiers();renderIncome();}'
  + '}'
  + '}'
  + 'saveState();'
  + 'renderDp();'
  + 'renderAchievements();'
  + '},1000);'
```

**3c. Auto-collect bonus.** Find:

```js
  + 'bonusZone.appendChild(bonusEl);'
  + 'playBonusAppearSound();'
  + 'bonusEl.addEventListener("click",function(){'
```

Replace with:

```js
  + 'bonusZone.appendChild(bonusEl);'
  + 'playBonusAppearSound();'
  + 'if(hasAutoCollectBonus(skillLevels)){'
  + 'setTimeout(function(){if(bonusEl)bonusEl.click();},5000);'
  + '}'
  + 'bonusEl.addEventListener("click",function(){'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/views/incrementalPage.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Wire the auto-buy and auto-collect-bonus skill tree capstone effects"
```

---

### Task 7: SP grants (prestige + achievement unlocks) and final review

**Files:**
- Modify: `web/views/incrementalPage.js` (prestige handler, `renderAchievements`)
- Test: `web/views/incrementalPage.test.js` (append)

**Interfaces:**
- No new exports. Closes the loop: SP is now earnable (this task) as well as spendable (Task 4) and multiplier-consuming (Task 5/6).

- [ ] **Step 1: Write the failing test**

Append to `web/views/incrementalPage.test.js`:

```js
test('renderIncrementalPage grants SP on prestige (always at least 1) without resetting sp itself', () => {
  const html = renderIncrementalPage({});
  const prestigeHandlerMatch = html.match(/prestigeBtn\.addEventListener\("click",function\(\)\{[\s\S]*?\}\);/);
  assert.ok(prestigeHandlerMatch);
  assert.match(prestigeHandlerMatch[0], /sp\+=Math\.max\(1,Math\.floor\(Math\.sqrt\(lifetimeDp\/500000\)\)\);/);
  assert.match(prestigeHandlerMatch[0], /renderSp\(\);/);
});

test('renderIncrementalPage grants weighted SP (1..5) the first time each achievement milestone is newly crossed, once per milestone', () => {
  const html = renderIncrementalPage({});
  const achievementsFnMatch = html.match(/function renderAchievements\(\)\{[\s\S]*?\n?\s*'\s*\+\s*'lastAchievedCount=achieved;/);
  assert.ok(achievementsFnMatch, 'expected to find renderAchievements source');
  assert.match(achievementsFnMatch[0], /var spGain=0;/);
  assert.match(achievementsFnMatch[0], /for\(var ai=lastAchievedCount\+1;ai<=achieved;ai\+\+\)\{spGain\+=ai;\}/);
  assert.match(achievementsFnMatch[0], /sp\+=spGain;/);
});

test('renderIncrementalPage embeds a syntactically valid client script with the full skill tree wired in', () => {
  const page = renderIncrementalPage({});
  const scriptMatch = page.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch);
  assert.doesNotThrow(() => new Function(scriptMatch[1]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/views/incrementalPage.test.js`
Expected: FAIL — no SP grant on prestige or achievement unlock yet

- [ ] **Step 3: Write minimal implementation**

All edits below are in `web/views/incrementalPage.js`.

**3a. Prestige SP grant.** Find:

```js
  + 'prestigeMult=1+PRESTIGE_COEF*computePrestigeCoefMult(skillLevels)*Math.sqrt(lifetimeDp/PRESTIGE_DIVISOR);'
  + 'saveState();'
  + 'renderDp();'
  + 'renderTiers();'
  + 'renderPrestige();'
  + 'renderIncome();'
  + 'playPrestigeSound();'
```

Replace with:

```js
  + 'prestigeMult=1+PRESTIGE_COEF*computePrestigeCoefMult(skillLevels)*Math.sqrt(lifetimeDp/PRESTIGE_DIVISOR);'
  + 'sp+=Math.max(1,Math.floor(Math.sqrt(lifetimeDp/500000)));'
  + 'saveState();'
  + 'renderDp();'
  + 'renderTiers();'
  + 'renderPrestige();'
  + 'renderIncome();'
  + 'renderSp();'
  + 'playPrestigeSound();'
```

**3b. Achievement-unlock SP grant.** Find:

```js
  + 'if(lastAchievedCount!==null&&achieved>lastAchievedCount){playAchievementSound();}'
  + 'lastAchievedCount=achieved;'
```

Replace with:

```js
  + 'if(lastAchievedCount!==null&&achieved>lastAchievedCount){'
  + 'var spGain=0;'
  + 'for(var ai=lastAchievedCount+1;ai<=achieved;ai++){spGain+=ai;}'
  + 'sp+=spGain;'
  + 'saveState();'
  + 'renderSp();'
  + 'playAchievementSound();'
  + '}'
  + 'lastAchievedCount=achieved;'
```

Note: `renderSp` is defined later in the script (inside the Task 4 skill-tree fragment) but is a hoisted `function` declaration, so it is safely callable here regardless of textual position — see the spec's discussion of hoisting. If `renderSp`'s own `spEl` lookup hasn't run yet the very first time `renderAchievements()` fires (it fires once during the page's initial synchronous render, before the later-spliced skill-tree fragment's own `spEl=page.querySelector(...)` line executes), `renderSp()` simply no-ops (`if(spEl)` guards it) — harmless, and the skill-tree fragment's own initial `renderSp()` call (moments later in the same synchronous run) paints the correct value.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/views/incrementalPage.test.js`
Expected: PASS

Then run the full project test suite to confirm no regressions anywhere:

Run: `node --test "**/*.test.js"`
Expected: PASS (all tests, including the pre-existing roulette/layout/incrementalSkills suites)

- [ ] **Step 5: Manual verification (cannot be automated — no browser access in this environment)**

Note for whoever runs this step: open `/incremental` in a real browser, then:
1. Confirm the "🌳 スキルツリー" panel renders with 3 columns and SP/研究 controls.
2. Click "🔬 研究にDPを投資" a few times (needs ~500+ DP) and confirm SP increases and the shown next-cost grows each time.
3. Unlock a node in each branch and confirm: the bead turns green, the label changes to "解放済み", and the corresponding stat actually changes (e.g. unlocking a 生産ライン強化 output node visibly bumps the 収入/秒 chip).
4. Fully unlock the 生産ライン強化 branch, wait ~60s, and confirm a tier gets auto-purchased without clicking anything.
5. Fully unlock the 強運 branch and confirm the next 🌟 bonus star auto-clicks itself ~5s after appearing.
6. Prestige-reset and confirm the skill tree beads and SP balance are unaffected while `dp`/`owned` reset as before.

- [ ] **Step 6: Commit**

```bash
git add web/views/incrementalPage.js web/views/incrementalPage.test.js
git commit -m "Grant skill points from prestige and achievement unlocks"
```

---

## Self-Review Notes

- **Spec coverage:** SP sources (prestige/achievement/research) → Task 7 (grants) + Task 4 (research spend); permanent-through-prestige → Task 3 (no reset path) verified by test; 3 branches × 20 nodes with monotonic costs and unique capstones → Task 1, tested directly; node data defined once + real tests → Task 1 (module-scope data + pure functions, not string literals); effect application → Task 5 (numeric) + Task 6 (unique); exchange-rate improvement without raising the daily cap → Task 5 step 3f (only `effectiveDpToCreditsRate` changes, `DP_TO_CREDITS_DAILY_CAP` untouched); UI → Task 2.
- **Type consistency:** `skillLevels` is always `{production, management, luck}` (numbers) everywhere it's threaded through — Task 1's functions, Task 3's loader/saver, Task 4's DOM wiring, Task 5/6/7's call sites all agree. `buyTierIndex(i)` (Task 6) matches the signature assumed by both the manual button handler and the auto-buy tick.
- **Isolation constraint preserved:** nothing in this plan reads from or writes to `web/views/layout.js`'s state, `RESET_KEYS`, or any roulette-page localStorage key other than the pre-existing `CREDITS_KEY` read/write already established before this plan.
