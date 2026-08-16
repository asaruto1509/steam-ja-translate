'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPriceDrops, buildDiscordEmbed, parseVerdictLabel } = require('./check-wishlist-prices.js');

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

test('single drop produces a field-based embed with price and discount', () => {
  const drops = [{ id: '1', name: 'Solo Game', prevPrice: 2000, price: 1000, dropPct: 50 }];
  const embed = buildDiscordEmbed(drops, {});
  assert.equal(embed.title, '💰 Solo Game が値下げされました');
  assert.equal(embed.fields[1].value, '-50%');
});

test('two drops produce a plain description list, no AI ranking', () => {
  const drops = [
    { id: '1', name: 'Game A', prevPrice: 1000, price: 800, dropPct: 20 },
    { id: '2', name: 'Game B', prevPrice: 500, price: 400, dropPct: 20 }
  ];
  const embed = buildDiscordEmbed(drops, {});
  assert.match(embed.title, /2件が値下げされました/);
  assert.match(embed.description, /Game A/);
  assert.match(embed.description, /Game B/);
});

test('three or more drops with verdicts rank best-3 by VERDICT_RANK, not just discount size', () => {
  const drops = [
    { id: '1', name: 'Low priority but bigger discount', prevPrice: 1000, price: 100, dropPct: 90 },
    { id: '2', name: 'Must buy now', prevPrice: 1000, price: 900, dropPct: 10 },
    { id: '3', name: 'No verdict', prevPrice: 1000, price: 500, dropPct: 50 }
  ];
  const verdictMap = { '1': '見送り', '2': '今すぐ買い' };
  const embed = buildDiscordEmbed(drops, verdictMap);
  assert.equal(embed.title, '🎯 セール中！AI判定ベスト');
  // 今すぐ買い(rank 0)が最初に来るべき。単純な割引率順なら90%引きのid:1が先頭になってしまう。
  assert.ok(embed.description.indexOf('Must buy now') < embed.description.indexOf('Low priority but bigger discount'));
});

test('three or more drops with no verdicts at all falls back to plain digest title', () => {
  const drops = [
    { id: '1', name: 'A', prevPrice: 1000, price: 900, dropPct: 10 },
    { id: '2', name: 'B', prevPrice: 1000, price: 900, dropPct: 10 },
    { id: '3', name: 'C', prevPrice: 1000, price: 900, dropPct: 10 }
  ];
  const embed = buildDiscordEmbed(drops, {});
  assert.match(embed.title, /3件が値下げされました/);
});

test('parseVerdictLabel matches an exact label', () => {
  assert.equal(parseVerdictLabel('今すぐ買い'), '今すぐ買い');
});

test('parseVerdictLabel matches when the model adds surrounding text', () => {
  assert.equal(parseVerdictLabel('判定: セール待ち です。'), 'セール待ち');
});

test('parseVerdictLabel prefers the longer label to avoid substring false match', () => {
  assert.equal(parseVerdictLabel('今すぐ買いだと思います'), '今すぐ買い');
});

test('parseVerdictLabel returns null for unrecognized output', () => {
  assert.equal(parseVerdictLabel('わかりません'), null);
  assert.equal(parseVerdictLabel(''), null);
  assert.equal(parseVerdictLabel(null), null);
});
