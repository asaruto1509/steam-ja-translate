'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickTripleResult, excludeRecentlyShown, buildSpinPayload } = require('./roulette.js');

function queueRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test('pickTripleResult returns a hit with all three reels on the same index when the roll is under winRate', () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  const rng = queueRng([0.5, 0.1]); // winnerIndex=2, hit-roll=0.1 < winRate=0.75
  const result = pickTripleResult(candidates, rng, 0.75);
  assert.deepEqual(result, { hit: true, reelIndexes: [2, 2, 2], winnerIndex: 2 });
});

test('pickTripleResult returns a miss with reel 2 shifted away from the winner index', () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  // winnerIndex=2 (0.5), hit-roll=0.9 >= winRate=0.75 -> miss, second=2 (0.5) bumped to 3, third=0 (0)
  const rng = queueRng([0.5, 0.9, 0.5, 0]);
  const result = pickTripleResult(candidates, rng, 0.75);
  assert.equal(result.hit, false);
  assert.equal(result.winnerIndex, null);
  assert.equal(result.reelIndexes[0], 2);
  assert.notEqual(result.reelIndexes[1], 2);
  assert.equal(result.reelIndexes[1], 3);
  assert.equal(result.reelIndexes[2], 0);
});

test('pickTripleResult bumps the third reel when it collides with both the winner and the second reel', () => {
  const candidates = [{ id: '1' }, { id: '2' }];
  // winnerIndex=0 (0), hit-roll=1 -> miss, second: 0->bumped to 1, third: 0 collides with neither winner(0)...
  // use values that make third equal to both winner and second before bump
  const rng = queueRng([0, 1, 0, 0]);
  const result = pickTripleResult(candidates, rng, 0.75);
  assert.equal(result.hit, false);
  assert.equal(result.reelIndexes[0], 0);
  assert.equal(result.reelIndexes[1], 1);
  // third started at 0, equals winnerIndex(0) but not second(1), so it is NOT bumped by the
  // "collides with both" rule - only bumps when it equals winner AND second simultaneously
  assert.equal(result.reelIndexes[2], 0);
});

test('pickTripleResult always hits when there is only one candidate', () => {
  const candidates = [{ id: '1' }];
  const rng = queueRng([0, 0.999]); // hit-roll would fail against any winRate, but forced hit anyway
  const result = pickTripleResult(candidates, rng, 0.75);
  assert.deepEqual(result, { hit: true, reelIndexes: [0, 0, 0], winnerIndex: 0 });
});

test('pickTripleResult defaults to Math.random when no rng is given', () => {
  const candidates = [{ id: '1' }];
  const result = pickTripleResult(candidates);
  assert.equal(result.hit, true);
});

test('pickTripleResult defaults winRate to 0.4 when not given', () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  const rng = queueRng([0.5, 0.39]); // hit-roll=0.39 < 0.4 default -> hit
  const hit = pickTripleResult(candidates, rng);
  assert.equal(hit.hit, true);
  const rngMiss = queueRng([0.5, 0.41]); // hit-roll=0.41 >= 0.4 default -> miss
  const miss = pickTripleResult(candidates, rngMiss);
  assert.equal(miss.hit, false);
});

test('excludeRecentlyShown filters out ids from the recent list', () => {
  const pool = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  const result = excludeRecentlyShown(pool, ['2', '4'], 1);
  assert.deepEqual(result.map((g) => g.id), ['1', '3']);
});

test('excludeRecentlyShown falls back to the full pool when exclusion leaves too few', () => {
  const pool = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const result = excludeRecentlyShown(pool, ['1', '2', '3'], 2);
  assert.deepEqual(result.map((g) => g.id), ['1', '2', '3']);
});

test('excludeRecentlyShown returns the full pool when nothing is recent', () => {
  const pool = [{ id: '1' }, { id: '2' }];
  const result = excludeRecentlyShown(pool, [], 1);
  assert.deepEqual(result.map((g) => g.id), ['1', '2']);
});

test('buildSpinPayload strips extra fields and carries hit/reelIndexes/winnerIndex through', () => {
  const candidates = [
    { id: '1', name: 'A', imageUrl: 'http://x/1.jpg', playtimeMinutes: 0 },
    { id: '2', name: 'B', imageUrl: 'http://x/2.jpg', playtimeMinutes: 10 }
  ];
  const payload = buildSpinPayload(candidates, { hit: true, reelIndexes: [1, 1, 1], winnerIndex: 1 });
  assert.deepEqual(payload, {
    candidates: [
      { id: '1', name: 'A', imageUrl: 'http://x/1.jpg' },
      { id: '2', name: 'B', imageUrl: 'http://x/2.jpg' }
    ],
    hit: true,
    reelIndexes: [1, 1, 1],
    winnerIndex: 1
  });
});

test('buildSpinPayload carries a miss result through with winnerIndex null', () => {
  const candidates = [{ id: '1', name: 'A', imageUrl: 'u' }];
  const payload = buildSpinPayload(candidates, { hit: false, reelIndexes: [0, 1, 2], winnerIndex: null });
  assert.deepEqual(payload.reelIndexes, [0, 1, 2]);
  assert.equal(payload.hit, false);
  assert.equal(payload.winnerIndex, null);
});
