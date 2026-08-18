'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPriceReply } = require('./price.js');

test('formatPriceReply shows a discounted price with strikethrough', () => {
  const detail = { id: '1', name: 'Sale Game', finalPrice: 750, originalPrice: 1000, discountPercent: 25 };
  const reply = formatPriceReply('Sale Game', detail);
  assert.match(reply.embeds[0].fields[0].value, /~~¥1,000~~/);
  assert.match(reply.embeds[0].fields[0].value, /¥750/);
  assert.match(reply.embeds[0].fields[0].value, /-25%/);
});

test('formatPriceReply includes the Steam header image and store link', () => {
  const detail = { id: '1', name: 'Sale Game', finalPrice: 750, originalPrice: 1000, discountPercent: 25 };
  const reply = formatPriceReply('Sale Game', detail);
  assert.equal(reply.embeds[0].image.url, 'https://cdn.akamai.steamstatic.com/steam/apps/1/header.jpg');
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/app/1/');
});

test('formatPriceReply shows 無料 for a free game', () => {
  const detail = { id: '2', name: 'Free Game', finalPrice: 0, originalPrice: 0, discountPercent: 0 };
  const reply = formatPriceReply('Free Game', detail);
  assert.equal(reply.embeds[0].fields[0].value, '無料');
});

test('formatPriceReply returns a not-found message when detail is null', () => {
  const reply = formatPriceReply('Unknown Game', null);
  assert.match(reply.content, /見つからなかった/);
});
