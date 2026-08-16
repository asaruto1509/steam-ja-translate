'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRandomGames } = require('./recommend-games.js');

test('pickRandomGames returns exactly n items from a larger pool', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' },
    { id: '4', name: 'D' }, { id: '5', name: 'E' }
  ];
  const result = pickRandomGames(pool, 3, () => 0);
  assert.equal(result.length, 3);
});

test('pickRandomGames dedupes by id before selecting (same game in both source lists)', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '1', name: 'A (dup)' }, { id: '2', name: 'B' }
  ];
  const result = pickRandomGames(pool, 2, () => 0);
  assert.equal(result.length, 2);
  const ids = result.map((g) => g.id);
  assert.equal(new Set(ids).size, 2);
});

test('pickRandomGames with a fixed rng produces a deterministic, reproducible order', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }, { id: '4', name: 'D' }
  ];
  const fixedRng = () => 0.5;
  const result1 = pickRandomGames(pool, 4, fixedRng);
  const result2 = pickRandomGames(pool, 4, fixedRng);
  assert.deepEqual(result1.map((g) => g.id), result2.map((g) => g.id));
});

test('pickRandomGames returns fewer items than n if the deduped pool is smaller than n', () => {
  const pool = [{ id: '1', name: 'A' }, { id: '1', name: 'A (dup)' }];
  const result = pickRandomGames(pool, 5, () => 0);
  assert.equal(result.length, 1);
});
