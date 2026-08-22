'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendSample } = require('./track-game-stats.js');

test('appendSample adds a new game entry and keeps other games untouched', () => {
  const history = { '999': [{ date: '2026-08-01T00:00:00.000Z', count: 5 }] };
  const result = appendSample(history, '100', { date: '2026-08-02T00:00:00.000Z', count: 10 }, 60);
  assert.deepEqual(result['100'], [{ date: '2026-08-02T00:00:00.000Z', count: 10 }]);
  assert.deepEqual(result['999'], [{ date: '2026-08-01T00:00:00.000Z', count: 5 }]);
});

test('appendSample does not mutate the input history object', () => {
  const history = { '100': [{ date: '2026-08-01T00:00:00.000Z', count: 5 }] };
  appendSample(history, '100', { date: '2026-08-02T00:00:00.000Z', count: 10 }, 60);
  assert.equal(history['100'].length, 1);
});

test('appendSample caps samples at maxSamples, dropping the oldest', () => {
  let history = {};
  for (let i = 0; i < 5; i++) {
    history = appendSample(history, '100', { date: 'd' + i, count: i }, 3);
  }
  assert.deepEqual(history['100'].map((s) => s.date), ['d2', 'd3', 'd4']);
});
