'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { headerImageUrl, storeUrl } = require('./steam.js');

test('headerImageUrl builds the Steam CDN header image URL for an appid', () => {
  assert.equal(headerImageUrl('367520'), 'https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg');
});

test('storeUrl builds the Steam store page URL for an appid', () => {
  assert.equal(storeUrl('367520'), 'https://store.steampowered.com/app/367520/');
});
