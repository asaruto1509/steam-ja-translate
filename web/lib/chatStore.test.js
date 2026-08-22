'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyMessage } = require('./chatStore.js');

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
