'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyMessage, readGame } = require('./chatStore.js');

test('applyMessage appends the entry to the end of the list', () => {
  const result = applyMessage([{ role: 'user', text: 'a' }], { role: 'assistant', text: 'b' }, 30);
  assert.deepEqual(result, [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }]);
});

test('applyMessage trims to maxSize, dropping the oldest entries first', () => {
  const messages = [];
  for (let i = 0; i < 5; i++) messages.push({ role: 'user', text: 'm' + i });
  const result = applyMessage(messages, { role: 'user', text: 'new' }, 3);
  assert.deepEqual(result, [
    { role: 'user', text: 'm3' },
    { role: 'user', text: 'm4' },
    { role: 'user', text: 'new' }
  ]);
});

test('applyMessage works when starting from an empty list', () => {
  const result = applyMessage([], { role: 'user', text: 'first' }, 30);
  assert.deepEqual(result, [{ role: 'user', text: 'first' }]);
});

test('applyMessage does not mutate the input array', () => {
  const original = [{ role: 'user', text: 'a' }];
  applyMessage(original, { role: 'assistant', text: 'b' }, 30);
  assert.deepEqual(original, [{ role: 'user', text: 'a' }]);
});

test('readGame returns the stored array for an own-property key', () => {
  const byGame = { '367520': [{ role: 'user', text: 'hi' }] };
  assert.deepEqual(readGame(byGame, '367520'), [{ role: 'user', text: 'hi' }]);
});

test('readGame returns an empty array for a missing key', () => {
  assert.deepEqual(readGame({}, '999'), []);
});

test('readGame does not resolve to an inherited prototype member for scope keys like "constructor"/"toString"', () => {
  assert.deepEqual(readGame({}, 'constructor'), []);
  assert.deepEqual(readGame({}, 'toString'), []);
  assert.deepEqual(readGame({}, '__proto__'), []);
});

test('readGame falls back to an empty array when a stored entry is corrupt (not an array)', () => {
  assert.deepEqual(readGame({ '1': 'not-an-array' }, '1'), []);
});
