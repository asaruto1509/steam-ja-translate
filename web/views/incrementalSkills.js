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
