'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanupArchivedThread } = require('./threadCleanup.js');

test('cleanupArchivedThread removes the thread id from askThreadIds', () => {
  const askThreadIds = new Set(['thread-1', 'thread-2']);
  cleanupArchivedThread('thread-1', { askThreadIds, detectiveThreads: new Map(), historyStore: { data: {} } });
  assert.equal(askThreadIds.has('thread-1'), false);
  assert.equal(askThreadIds.has('thread-2'), true);
});

test('cleanupArchivedThread removes the thread entry from detectiveThreads', () => {
  const detectiveThreads = new Map([['thread-1', { name: 'Hollow Knight' }], ['thread-2', { name: 'Celeste' }]]);
  cleanupArchivedThread('thread-1', { askThreadIds: new Set(), detectiveThreads, historyStore: { data: {} } });
  assert.equal(detectiveThreads.has('thread-1'), false);
  assert.equal(detectiveThreads.has('thread-2'), true);
});

test('cleanupArchivedThread deletes the thread chat history from historyStore', () => {
  const historyStore = { data: { 'thread-1': [{ author: 'A', text: 'hi' }], 'thread-2': [{ author: 'B', text: 'yo' }] } };
  cleanupArchivedThread('thread-1', { askThreadIds: new Set(), detectiveThreads: new Map(), historyStore });
  assert.equal('thread-1' in historyStore.data, false);
  assert.deepEqual(historyStore.data['thread-2'], [{ author: 'B', text: 'yo' }]);
});

test('cleanupArchivedThread is a no-op when the thread id is unknown to all three stores', () => {
  const askThreadIds = new Set(['thread-2']);
  const detectiveThreads = new Map([['thread-2', { name: 'Celeste' }]]);
  const historyStore = { data: { 'thread-2': [{ author: 'B', text: 'yo' }] } };
  cleanupArchivedThread('unknown-thread', { askThreadIds, detectiveThreads, historyStore });
  assert.equal(askThreadIds.has('thread-2'), true);
  assert.equal(detectiveThreads.has('thread-2'), true);
  assert.deepEqual(historyStore.data['thread-2'], [{ author: 'B', text: 'yo' }]);
});
