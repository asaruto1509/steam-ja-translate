'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWishlistDealsEmbed } = require('./wishlist.js');

test('buildWishlistDealsEmbed lists each discounted title with its price', () => {
  const deals = [
    { id: '1', name: 'Game A', finalPrice: 800, originalPrice: 1000, discountPercent: 20 },
    { id: '2', name: 'Game B', finalPrice: 400, originalPrice: 500, discountPercent: 20 }
  ];
  const reply = buildWishlistDealsEmbed(deals);
  assert.match(reply.embeds[0].title, /2件/);
  assert.match(reply.embeds[0].description, /Game A/);
  assert.match(reply.embeds[0].description, /Game B/);
});

test('buildWishlistDealsEmbed returns a plain message when there are no deals', () => {
  const reply = buildWishlistDealsEmbed([]);
  assert.match(reply.content, /ない/);
});
