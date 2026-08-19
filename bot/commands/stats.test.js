'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatStatsReply } = require('./stats.js');

test('formatStatsReply shows player count and rarest achievement', () => {
  const reply = formatStatsReply('Hollow Knight', '1', 7155, { count: 63, avgUnlockPct: 45.2, rarest: { name: 'STEEL_SOUL', percent: 0.3 } });
  assert.equal(reply.embeds[0].title, 'Hollow Knight');
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/app/1/');
  assert.equal(reply.embeds[0].image.url, 'https://cdn.akamai.steamstatic.com/steam/apps/1/header.jpg');
  const fieldNames = reply.embeds[0].fields.map(f => f.name);
  assert.ok(fieldNames.some(n => n.includes('プレイヤー')));
  assert.ok(fieldNames.some(n => n.includes('実績')));
  const playerField = reply.embeds[0].fields.find(f => f.name.includes('プレイヤー'));
  assert.match(playerField.value, /7,155/);
});

test('formatStatsReply omits achievement field when the game has none', () => {
  const reply = formatStatsReply('No Achievements Game', '2', 100, null);
  const fieldNames = reply.embeds[0].fields.map(f => f.name);
  assert.ok(!fieldNames.some(n => n.includes('実績')));
});

test('formatStatsReply shows review positivity when available', () => {
  const reply = formatStatsReply('Hollow Knight', '1', 7155, null, { positivePct: 96, totalReviews: 120000 });
  const reviewField = reply.embeds[0].fields.find(f => f.name.includes('レビュー'));
  assert.match(reviewField.value, /96%/);
  assert.match(reviewField.value, /120,000/);
});

test('formatStatsReply omits the review field when review data is unavailable', () => {
  const reply = formatStatsReply('New Game', '3', 50, null, null);
  const fieldNames = reply.embeds[0].fields.map(f => f.name);
  assert.ok(!fieldNames.some(n => n.includes('レビュー')));
});

test('formatStatsReply returns a not-found message when player count is unavailable', () => {
  const reply = formatStatsReply('Unknown Game', null, null, null);
  assert.match(reply.content, /見つからなかった/);
});
