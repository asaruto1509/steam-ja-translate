'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPriceLine } = require('./priceFormat.js');

test('formatPriceLine shows a discounted price with strikethrough', () => {
  const line = formatPriceLine({ finalPrice: 750, originalPrice: 1000, discountPercent: 25 });
  assert.match(line, /~~¥1,000~~/);
  assert.match(line, /¥750/);
  assert.match(line, /-25%/);
});

test('formatPriceLine shows 無料 for a free game', () => {
  assert.equal(formatPriceLine({ finalPrice: 0, originalPrice: 0, discountPercent: 0 }), '無料');
});

test('formatPriceLine shows a plain price with no discount', () => {
  assert.equal(formatPriceLine({ finalPrice: 2000, originalPrice: 2000, discountPercent: 0 }), '¥2,000');
});

test('formatPriceLine returns a fallback message when detail is missing', () => {
  assert.match(formatPriceLine(null), /価格情報なし/);
});
