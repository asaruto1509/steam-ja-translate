'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterCheapPool, rarityForPositivePct, buildGachaFlavorPrompt, formatGachaReply } = require('./gacha.js');

test('filterCheapPool keeps only games at or under the price threshold', () => {
  const pool = [{ id: '1', finalPrice: 500 }, { id: '2', finalPrice: 2000 }];
  const cheap = filterCheapPool(pool, 1000);
  assert.deepEqual(cheap.map(g => g.id), ['1']);
});

test('rarityForPositivePct grades based on real review data thresholds', () => {
  assert.equal(rarityForPositivePct(95).grade, 'SSR');
  assert.equal(rarityForPositivePct(80).grade, 'SR');
  assert.equal(rarityForPositivePct(60).grade, 'R');
  assert.equal(rarityForPositivePct(30).grade, 'N');
  assert.equal(rarityForPositivePct(null).grade, 'N');
});

test('buildGachaFlavorPrompt includes the game name', () => {
  const prompt = buildGachaFlavorPrompt('Weird Indie Game');
  assert.match(prompt, /Weird Indie Game/);
});

test('formatGachaReply shows the rarity badge, price and flavor text', () => {
  const game = { id: '1', name: 'Weird Indie Game', finalPrice: 300, originalPrice: 300, discountPercent: 0 };
  const reply = formatGachaReply(game, 92, 'なぜか妙にクセになる掃除シミュレーター。');
  assert.match(reply.embeds[0].title, /SSR/);
  assert.match(reply.embeds[0].description, /クセになる/);
});

test('formatGachaReply returns a not-found message when no game is picked', () => {
  const reply = formatGachaReply(null, null, null);
  assert.match(reply.content, /見つからなかった/);
});
