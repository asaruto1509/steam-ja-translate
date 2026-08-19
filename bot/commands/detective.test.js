'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIntroReply, handleDetectiveCommand } = require('./detective.js');

test('buildIntroReply announces the game has started without revealing the title', () => {
  const reply = buildIntroReply(20);
  assert.match(reply.content, /20/);
  assert.doesNotMatch(reply.content, /Hollow Knight/);
});

test('handleDetectiveCommand replies with an error when ONEMIN_API_KEY is unset', async () => {
  delete process.env.ONEMIN_API_KEY;
  let replied = null;
  const interaction = {
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    fetchFeaturedPool: async () => { throw new Error('should not be called'); },
    pickRandomGames: () => { throw new Error('should not be called'); },
    pickRealGames: async () => { throw new Error('should not be called'); },
    isRealGame: async () => true,
    fetchGameContext: async () => { throw new Error('should not be called'); },
    detectiveThreads: new Map()
  };
  await handleDetectiveCommand(interaction, deps);
  assert.match(replied.content, /出題できなかった/);
});

test('handleDetectiveCommand picks a game, creates a thread, and seeds detectiveThreads state', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  var thread = { id: 'thread-1' };
  var replyMessage = { startThread: async () => thread };
  const interaction = {
    deferReply: async () => {},
    editReply: async (r) => { replied = r; },
    fetchReply: async () => replyMessage
  };
  const detectiveThreads = new Map();
  const deps = {
    fetchFeaturedPool: async () => [{ id: '367520', name: 'Hollow Knight' }],
    pickRandomGames: (pool) => pool,
    pickRealGames: async (candidates) => candidates.slice(0, 1),
    isRealGame: async () => true,
    fetchGameContext: async () => ({ genres: ['アクション'], categories: ['探索'] }),
    detectiveThreads: detectiveThreads
  };
  await handleDetectiveCommand(interaction, deps);
  assert.doesNotMatch(replied.content, /Hollow Knight/);
  const state = detectiveThreads.get('thread-1');
  assert.equal(state.name, 'Hollow Knight');
  assert.equal(state.id, '367520');
  assert.equal(state.questionCount, 0);
});
