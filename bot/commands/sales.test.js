'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickTopSales, buildSalesPrompt, formatSalesReply } = require('./sales.js');

test('pickTopSales sorts by discount percent and caps the count', () => {
  const pool = [
    { id: '1', name: 'A', discountPercent: 20 },
    { id: '2', name: 'B', discountPercent: 80 },
    { id: '3', name: 'C', discountPercent: 50 }
  ];
  const top = pickTopSales(pool, 2);
  assert.deepEqual(top.map(g => g.id), ['2', '3']);
});

test('buildSalesPrompt lists each game with its discount', () => {
  const games = [{ name: 'Great Game', discountPercent: 75, finalPrice: 500 }];
  const prompt = buildSalesPrompt(games);
  assert.match(prompt, /Great Game/);
  assert.match(prompt, /75/);
});

test('formatSalesReply lists each game with a price field and the AI blurb', () => {
  const games = [{ id: '1', name: 'Great Game', finalPrice: 500, originalPrice: 2000, discountPercent: 75 }];
  const reply = formatSalesReply(games, 'このセールは見逃せない！');
  assert.match(reply.embeds[0].description, /見逃せない/);
  assert.equal(reply.embeds[0].fields[0].name, 'Great Game');
  assert.match(reply.embeds[0].fields[0].value, /-75%/);
});

test('formatSalesReply returns a plain message when there are no sale items', () => {
  const reply = formatSalesReply([], null);
  assert.match(reply.content, /見つからなかった/);
});
