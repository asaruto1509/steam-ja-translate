'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterBacklog } = require('./backlogPool.js');

test('filterBacklog keeps only games under the playtime threshold', () => {
  const games = [
    { id: '1', playtimeMinutes: 0 },
    { id: '2', playtimeMinutes: 119 },
    { id: '3', playtimeMinutes: 120 },
    { id: '4', playtimeMinutes: 500 }
  ];
  const result = filterBacklog(games, 120);
  assert.deepEqual(result.map((g) => g.id), ['1', '2']);
});

test('filterBacklog returns an empty array when nothing qualifies', () => {
  const games = [{ id: '1', playtimeMinutes: 200 }];
  assert.deepEqual(filterBacklog(games, 120), []);
});

test('filterBacklog returns an empty array for an empty input', () => {
  assert.deepEqual(filterBacklog([], 120), []);
});

test('filterBacklog does not mutate the input array', () => {
  const games = [{ id: '1', playtimeMinutes: 0 }];
  filterBacklog(games, 120);
  assert.equal(games.length, 1);
});
