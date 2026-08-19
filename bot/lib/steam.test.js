'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { headerImageUrl, storeUrl, mergeReviewTexts } = require('./steam.js');

test('headerImageUrl builds the Steam CDN header image URL for an appid', () => {
  assert.equal(headerImageUrl('367520'), 'https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg');
});

test('storeUrl builds the Steam store page URL for an appid', () => {
  assert.equal(storeUrl('367520'), 'https://store.steampowered.com/app/367520/');
});

test('mergeReviewTexts fills up to count with fallback reviews after the primary list', () => {
  const merged = mergeReviewTexts(['日本語1'], ['English 1', 'English 2', 'English 3'], 3);
  assert.deepEqual(merged, ['日本語1', 'English 1', 'English 2']);
});

test('mergeReviewTexts skips fallback entries that duplicate a primary entry', () => {
  const merged = mergeReviewTexts(['共通レビュー'], ['共通レビュー', 'English 2'], 3);
  assert.deepEqual(merged, ['共通レビュー', 'English 2']);
});

test('mergeReviewTexts returns the primary list unchanged once count is reached', () => {
  const merged = mergeReviewTexts(['A', 'B'], ['C', 'D'], 2);
  assert.deepEqual(merged, ['A', 'B']);
});

test('mergeReviewTexts works when the primary list is empty', () => {
  const merged = mergeReviewTexts([], ['C', 'D'], 2);
  assert.deepEqual(merged, ['C', 'D']);
});
