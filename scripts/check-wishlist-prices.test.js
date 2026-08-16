'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPriceDrops } = require('./check-wishlist-prices.js');

test('price drop above threshold is detected and history updates', () => {
  const items = [{ id: '100', name: 'Game A', price: 800 }];
  const history = { '100': 1000 };
  const result = detectPriceDrops(items, history, 10);
  assert.equal(result.drops.length, 1);
  assert.deepEqual(result.drops[0], { id: '100', name: 'Game A', prevPrice: 1000, price: 800, dropPct: 20 });
  assert.equal(result.updatedHistory['100'], 800);
});

test('price drop below threshold is not reported and history is NOT updated', () => {
  const items = [{ id: '200', name: 'Game B', price: 950 }];
  const history = { '200': 1000 };
  const result = detectPriceDrops(items, history, 10);
  assert.equal(result.drops.length, 0);
  assert.equal(result.updatedHistory['200'], 1000);
});

test('price increase updates history without producing a drop', () => {
  const items = [{ id: '300', name: 'Game C', price: 1200 }];
  const history = { '300': 1000 };
  const result = detectPriceDrops(items, history, 0);
  assert.equal(result.drops.length, 0);
  assert.equal(result.updatedHistory['300'], 1200);
});

test('unseen item (no prior history) is recorded but not a drop', () => {
  const items = [{ id: '400', name: 'Game D', price: 500 }];
  const result = detectPriceDrops(items, {}, 0);
  assert.equal(result.drops.length, 0);
  assert.equal(result.updatedHistory['400'], 500);
});
