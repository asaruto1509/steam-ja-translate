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

test('buildSkillClientScript embeds the pure functions by source and wires unlock/research buttons', () => {
  const script = skills.buildSkillClientScript();
  assert.match(script, /var SKILL_BRANCHES=\{"production":\[/);
  assert.match(script, /var BRANCH_ORDER=\["production","management","luck"\];/);
  assert.match(script, /function computeOutputMult\(skillLevels\)\s*\{/);
  assert.match(script, /function hasAutoBuy\(skillLevels\)\s*\{/);
  assert.match(script, /function nextNodeCost\(skillLevels,\s*branchId\)\s*\{/);
  assert.match(script, /function renderSp\(\)\{/);
  assert.match(script, /function renderSkillTree\(\)\{/);
  assert.match(script, /var RESEARCH_BASE_COST=500;/);
  assert.match(script, /var RESEARCH_COST_GROWTH=1\.25;/);
  assert.match(script, /function researchCost\(\)\{return Math\.ceil\(RESEARCH_BASE_COST\*Math\.pow\(RESEARCH_COST_GROWTH,researchUses\)\);\}/);
  assert.doesNotThrow(() => new Function(script), 'buildSkillClientScript output must be syntactically valid standalone JS');
});

test('research base cost is a single module-scope constant shared by the HTML placeholder and the client script', () => {
  assert.equal(skills.RESEARCH_BASE_COST, 500);
  const html = skills.renderSkillPanelHtml();
  assert.match(html, new RegExp('id="incremental-research-cost">' + skills.RESEARCH_BASE_COST + '</span>'));
  const script = skills.buildSkillClientScript();
  assert.match(script, new RegExp('var RESEARCH_BASE_COST=' + skills.RESEARCH_BASE_COST + ';'));
});
