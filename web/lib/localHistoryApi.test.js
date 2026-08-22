'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pointsForGame } = require('./localHistoryApi.js');

test('pointsForGame returns the array for a known appid', () => {
  const history = { '100': [{ date: 'd1', count: 5 }] };
  assert.deepEqual(pointsForGame(history, '100'), [{ date: 'd1', count: 5 }]);
});

test('pointsForGame returns an empty array for an unknown appid', () => {
  assert.deepEqual(pointsForGame({ '100': [] }, '999'), []);
});

test('pointsForGame returns an empty array when history is missing or malformed', () => {
  assert.deepEqual(pointsForGame(null, '100'), []);
  assert.deepEqual(pointsForGame({ '100': 'not-an-array' }, '100'), []);
});
