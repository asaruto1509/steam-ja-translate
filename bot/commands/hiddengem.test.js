'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickHiddenGem, buildHiddenGemPrompt, formatHiddenGemReply } = require('./hiddengem.js');

test('pickHiddenGem picks the highest-review title among low-player candidates', () => {
  const candidates = [
    { id: '1', name: 'Popular Game', positivePct: 95, playerCount: 50000 },
    { id: '2', name: 'Quiet Gem', positivePct: 92, playerCount: 80 },
    { id: '3', name: 'Mediocre Quiet Game', positivePct: 60, playerCount: 40 }
  ];
  const gem = pickHiddenGem(candidates, 85, 300);
  assert.equal(gem.id, '2');
});

test('pickHiddenGem returns null when nothing meets the thresholds', () => {
  const candidates = [{ id: '1', name: 'Popular Game', positivePct: 95, playerCount: 50000 }];
  assert.equal(pickHiddenGem(candidates, 85, 300), null);
});

test('buildHiddenGemPrompt includes the game name', () => {
  const prompt = buildHiddenGemPrompt('Quiet Gem');
  assert.match(prompt, /Quiet Gem/);
});

test('formatHiddenGemReply shows the game with its stats and AI blurb', () => {
  const game = { id: '2', name: 'Quiet Gem', positivePct: 92, playerCount: 80 };
  const reply = formatHiddenGemReply(game, '知る人ぞ知る名作。');
  assert.equal(reply.embeds[0].title, 'Quiet Gem');
  assert.match(reply.embeds[0].description, /知る人ぞ知る/);
  assert.match(reply.embeds[0].fields[0].value, /92%/);
});

test('formatHiddenGemReply returns a not-found message when no gem was picked', () => {
  const reply = formatHiddenGemReply(null, null);
  assert.match(reply.content, /見つからなかった/);
});
