'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReasoningPrompt, buildStructuringPrompt } = require('./analysisPrompt.js');

test('buildReasoningPrompt includes the game name and positive/negative review sections', () => {
  const prompt = buildReasoningPrompt('Hollow Knight', { positive: ['最高'], negative: ['難しすぎる'] }, null, {});
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /最高/);
  assert.match(prompt, /難しすぎる/);
  assert.match(prompt, /好評/);
  assert.match(prompt, /不評/);
});

test('buildReasoningPrompt asks for free-form reasoning, not a JSON schema', () => {
  const prompt = buildReasoningPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.doesNotMatch(prompt, /"verdict"/);
  assert.doesNotMatch(prompt, /"categories"/);
  assert.match(prompt, /自由な文章でじっくり考察/);
});

test('buildReasoningPrompt asks about similar game titles', () => {
  const prompt = buildReasoningPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.match(prompt, /似ている実在のSteamゲーム/);
});

test('buildReasoningPrompt includes genre/category context when provided', () => {
  const prompt = buildReasoningPrompt('Game', { positive: [], negative: [] },
    { genres: ['アクション'], categories: ['シングルプレイヤー'] }, {});
  assert.match(prompt, /アクション/);
  assert.match(prompt, /シングルプレイヤー/);
});

test('buildReasoningPrompt includes player count and achievement stats when provided', () => {
  const prompt = buildReasoningPrompt('Game', { positive: [], negative: [] }, null, {
    playerCount: 12345,
    achievementStats: { count: 50, avgUnlockPct: 23.4, rarest: { name: 'Secret Ending', percent: 0.5 } }
  });
  assert.match(prompt, /12,345/);
  assert.match(prompt, /50/);
  assert.match(prompt, /23\.4/);
  assert.match(prompt, /Secret Ending/);
});

test('buildReasoningPrompt omits stats lines when not provided', () => {
  const prompt = buildReasoningPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.doesNotMatch(prompt, /同時接続/);
  assert.doesNotMatch(prompt, /実績数/);
});

test('buildReasoningPrompt handles missing review arrays without throwing', () => {
  assert.doesNotThrow(() => buildReasoningPrompt('Game', {}, null, {}));
});

test('buildReasoningPrompt asks about the expanded category list including localization', () => {
  const prompt = buildReasoningPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.match(prompt, /日本語対応/);
  assert.match(prompt, /ボリューム/);
  assert.match(prompt, /コミュニティ・人口/);
});

test('buildReasoningPrompt asks the model to research external critic scores via web search', () => {
  const prompt = buildReasoningPrompt('Game', { positive: [], negative: [] }, null, {});
  assert.match(prompt, /Metacritic/);
});

test('buildStructuringPrompt includes the game name and the reasoning text to structure', () => {
  const prompt = buildStructuringPrompt('Hollow Knight', '総合的には買い。探索が楽しい。');
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /総合的には買い。探索が楽しい。/);
});

test('buildStructuringPrompt requests the full JSON schema', () => {
  const prompt = buildStructuringPrompt('Game', 'メモ');
  assert.match(prompt, /"verdict"/);
  assert.match(prompt, /"categories"/);
  assert.match(prompt, /"pros"/);
  assert.match(prompt, /"cons"/);
  assert.match(prompt, /"audienceFor"/);
  assert.match(prompt, /"audienceAgainst"/);
  assert.match(prompt, /"similarGames"/);
  assert.match(prompt, /"externalScores"/);
});

test('buildStructuringPrompt requests the expanded category list', () => {
  const prompt = buildStructuringPrompt('Game', 'メモ');
  assert.match(prompt, /"日本語対応"/);
  assert.match(prompt, /"ボリューム"/);
});
