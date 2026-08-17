'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendHistory, buildChatPrompt } = require('./chat.js');

test('appendHistory adds an entry and keeps existing channels untouched', () => {
  const history = { 'other-channel': [{ author: 'X', text: 'hi' }] };
  const result = appendHistory(history, 'chan-1', { author: 'A', text: 'hello' }, 6);
  assert.deepEqual(result['chan-1'], [{ author: 'A', text: 'hello' }]);
  assert.deepEqual(result['other-channel'], [{ author: 'X', text: 'hi' }]);
});

test('appendHistory does not mutate the input object', () => {
  const history = { 'chan-1': [{ author: 'A', text: 'first' }] };
  appendHistory(history, 'chan-1', { author: 'B', text: 'second' }, 6);
  assert.deepEqual(history['chan-1'], [{ author: 'A', text: 'first' }]);
});

test('appendHistory caps the list at maxLen, dropping the oldest entries', () => {
  let history = {};
  for (let i = 0; i < 5; i++) {
    history = appendHistory(history, 'chan-1', { author: 'A', text: 'msg' + i }, 3);
  }
  assert.deepEqual(history['chan-1'].map((e) => e.text), ['msg2', 'msg3', 'msg4']);
});

test('buildChatPrompt includes prior history lines and the new message', () => {
  const historyEntries = [{ author: 'ユーザー', text: '猫好き？' }, { author: 'Bot', text: '好きだよ' }];
  const prompt = buildChatPrompt(historyEntries, '犬は？');
  assert.match(prompt, /猫好き？/);
  assert.match(prompt, /好きだよ/);
  assert.match(prompt, /犬は？/);
});

test('buildChatPrompt works with empty history', () => {
  const prompt = buildChatPrompt([], 'こんにちは');
  assert.match(prompt, /こんにちは/);
});
