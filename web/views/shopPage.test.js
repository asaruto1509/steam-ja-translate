'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderShopPage } = require('./shopPage.js');

test('renderShopPage includes a credits balance display', () => {
  const html = renderShopPage();
  assert.match(html, /class="shop-credits"/);
  assert.match(html, /id="shop-credits-value"/);
});

test('renderShopPage includes the free-spins, payout-boost, and theme shop items', () => {
  const html = renderShopPage();
  assert.match(html, /data-item="freespins"/);
  assert.match(html, /id="shop-buy-freespins"/);
  assert.match(html, /data-item="payout"/);
  assert.match(html, /id="shop-buy-payout"/);
  assert.match(html, /data-item="theme"/);
  assert.match(html, /id="shop-theme-gold"/);
  assert.match(html, /id="shop-theme-red"/);
  assert.match(html, /id="shop-theme-purple"/);
});

test('renderShopPage uses a default back-link text when not provided', () => {
  const html = renderShopPage();
  assert.match(html, /トップに戻る/);
});

test('renderShopPage uses a custom back-link text when provided', () => {
  const html = renderShopPage({ backLinkText: '一覧へ' });
  assert.match(html, /一覧へ/);
  assert.doesNotMatch(html, /トップに戻る/);
});
