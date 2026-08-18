'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRealGames } = require('./gamePool.js');

test('pickRealGames collects games until count is reached, skipping non-games', async () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  const isRealGame = async (id) => id !== '2';
  const picked = await pickRealGames(candidates, 2, isRealGame);
  assert.deepEqual(picked.map(g => g.id), ['1', '3']);
});

test('pickRealGames stops checking after maxChecks even if count is not reached', async () => {
  const candidates = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  const isRealGame = async (id) => id !== '1' && id !== '2' && id !== '3';
  const picked = await pickRealGames(candidates, 5, isRealGame, 2);
  assert.deepEqual(picked, []);
});

test('pickRealGames returns fewer than count when the pool runs out', async () => {
  const candidates = [{ id: '1' }];
  const isRealGame = async () => true;
  const picked = await pickRealGames(candidates, 3, isRealGame);
  assert.equal(picked.length, 1);
});
