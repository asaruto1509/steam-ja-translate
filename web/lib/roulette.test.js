'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickWinner, buildSpinPayload } = require('./roulette.js');

test('pickWinner returns an index within range using the injected rng', () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const idx = pickWinner(candidates, () => 0.5);
  assert.equal(idx, 1);
});

test('pickWinner returns 0 when rng returns 0', () => {
  const candidates = [{ id: '1' }, { id: '2' }];
  assert.equal(pickWinner(candidates, () => 0), 0);
});

test('pickWinner returns the last index when rng returns just under 1', () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }];
  assert.equal(pickWinner(candidates, () => 0.999), 2);
});

test('pickWinner defaults to Math.random when no rng is given', () => {
  const candidates = [{ id: '1' }];
  assert.equal(pickWinner(candidates), 0);
});

test('buildSpinPayload strips extra fields and keeps id/name/imageUrl', () => {
  const candidates = [
    { id: '1', name: 'A', imageUrl: 'http://x/1.jpg', playtimeMinutes: 0 },
    { id: '2', name: 'B', imageUrl: 'http://x/2.jpg', playtimeMinutes: 10 }
  ];
  const payload = buildSpinPayload(candidates, 1);
  assert.deepEqual(payload, {
    candidates: [
      { id: '1', name: 'A', imageUrl: 'http://x/1.jpg' },
      { id: '2', name: 'B', imageUrl: 'http://x/2.jpg' }
    ],
    winnerIndex: 1
  });
});

test('buildSpinPayload works with a winnerIndex of 0', () => {
  const candidates = [{ id: '1', name: 'A', imageUrl: 'u' }];
  assert.deepEqual(buildSpinPayload(candidates, 0), {
    candidates: [{ id: '1', name: 'A', imageUrl: 'u' }],
    winnerIndex: 0
  });
});
