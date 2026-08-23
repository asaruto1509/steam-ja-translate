'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractItems, dedupeById } = require('./recommendPool.js');

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
