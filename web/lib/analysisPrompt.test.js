'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnalysisPrompt } = require('./analysisPrompt.js');

test('buildAnalysisPrompt includes the game name and positive/negative review sections', () => {
  const prompt = buildAnalysisPrompt('Hollow Knight', { positive: ['最高'], negative: ['難しすぎる'] }, null, {});
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /最高/);
  assert.match(prompt, /難しすぎる/);
  assert.match(prompt, /好評/);
  assert.match(prompt, /不評/);
});

test('buildAnalysisPrompt requests the full JSON schema', () => {
  const prompt = buildAnalysisPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.match(prompt, /"verdict"/);
  assert.match(prompt, /"categories"/);
  assert.match(prompt, /"pros"/);
  assert.match(prompt, /"cons"/);
  assert.match(prompt, /"audienceFor"/);
  assert.match(prompt, /"audienceAgainst"/);
});

test('buildAnalysisPrompt requests similar game titles', () => {
  const prompt = buildAnalysisPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.match(prompt, /"similarGames"/);
});

test('buildAnalysisPrompt includes genre/category context when provided', () => {
  const prompt = buildAnalysisPrompt('Game', { positive: [], negative: [] },
    { genres: ['アクション'], categories: ['シングルプレイヤー'] }, {});
  assert.match(prompt, /アクション/);
  assert.match(prompt, /シングルプレイヤー/);
});

test('buildAnalysisPrompt includes player count and achievement stats when provided', () => {
  const prompt = buildAnalysisPrompt('Game', { positive: [], negative: [] }, null, {
    playerCount: 12345,
    achievementStats: { count: 50, avgUnlockPct: 23.4, rarest: { name: 'Secret Ending', percent: 0.5 } }
  });
  assert.match(prompt, /12,345/);
  assert.match(prompt, /50/);
  assert.match(prompt, /23\.4/);
  assert.match(prompt, /Secret Ending/);
});

test('buildAnalysisPrompt omits stats lines when not provided', () => {
  const prompt = buildAnalysisPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.doesNotMatch(prompt, /同時接続/);
  assert.doesNotMatch(prompt, /実績数/);
});

test('buildAnalysisPrompt handles missing review arrays without throwing', () => {
  assert.doesNotThrow(() => buildAnalysisPrompt('Game', {}, null, {}));
});
