'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractItems, dedupeById, extractIdFromLogo, parseSearchResults } = require('./recommendPool.js');

test('extractItems keeps only type 0 items and maps id/name/image', () => {
  const data = {
    specials: {
      items: [
        { id: 1, type: 0, name: 'A', large_capsule_image: 'http://x/a.jpg' },
        { id: 2, type: 4, name: 'Bundle' }
      ]
    }
  };
  assert.deepEqual(extractItems(data, 'specials'), [
    { id: '1', name: 'A', image: 'http://x/a.jpg' }
  ]);
});

test('extractItems falls back to header_image, then null, when no capsule image', () => {
  const data = {
    top_sellers: {
      items: [
        { id: 1, type: 0, name: 'A', header_image: 'http://x/header.jpg' },
        { id: 2, type: 0, name: 'B' }
      ]
    }
  };
  assert.deepEqual(extractItems(data, 'top_sellers'), [
    { id: '1', name: 'A', image: 'http://x/header.jpg' },
    { id: '2', name: 'B', image: null }
  ]);
});

test('extractItems returns an empty array for a missing key', () => {
  assert.deepEqual(extractItems({}, 'new_releases'), []);
});

test('dedupeById keeps the first occurrence of each id', () => {
  const pool = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '1', name: 'A-dup' }];
  assert.deepEqual(dedupeById(pool), [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);
});

test('extractIdFromLogo pulls the appid out of the logo image path', () => {
  const url = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1172470/abc.jpg?t=1';
  assert.equal(extractIdFromLogo(url), '1172470');
});

test('extractIdFromLogo returns null when the url has no recognizable appid segment', () => {
  assert.equal(extractIdFromLogo('https://example.com/no-appid-here.jpg'), null);
  assert.equal(extractIdFromLogo(undefined), null);
  assert.equal(extractIdFromLogo(''), null);
});

test('parseSearchResults maps items with a resolvable appid and drops those without one', () => {
  const data = {
    items: [
      { name: 'A', logo: 'https://x/steam/apps/111/a.jpg' },
      { name: 'B', logo: 'https://x/no-appid.jpg' },
      { name: 'C', logo: 'https://x/steam/apps/222/c.jpg' }
    ]
  };
  assert.deepEqual(parseSearchResults(data), [
    { id: '111', name: 'A', image: 'https://x/steam/apps/111/a.jpg' },
    { id: '222', name: 'C', image: 'https://x/steam/apps/222/c.jpg' }
  ]);
});

test('parseSearchResults returns an empty array when items is missing', () => {
  assert.deepEqual(parseSearchResults({}), []);
});
