'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendHistory, buildChatPrompt, extractGameMentions, appendGameLinks } = require('./chat.js');

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

test('extractGameMentions pulls unique bracketed titles from text', () => {
  const mentions = extractGameMentions('似てるゲームだと「Hollow Knight」とか「Celeste」がおすすめ。「Hollow Knight」は特に。');
  assert.deepEqual(mentions, ['Hollow Knight', 'Celeste']);
});

test('extractGameMentions also matches 『』作品名括弧(AIがこちらを使うことがある)', () => {
  const mentions = extractGameMentions('『Fallout 3』や『Metro Redux』が似た雰囲気です。');
  assert.deepEqual(mentions, ['Fallout 3', 'Metro Redux']);
});

test('extractGameMentions returns an empty array when there are no brackets', () => {
  assert.deepEqual(extractGameMentions('普通の返答だよ'), []);
});

test('extractGameMentions caps the number of mentions returned', () => {
  const text = '「A」「B」「C」「D」';
  assert.equal(extractGameMentions(text, 2).length, 2);
});

test('appendGameLinks appends a Steam link line for each matched game', () => {
  const result = appendGameLinks('面白いよ', [{ name: 'Hollow Knight', id: '367520' }]);
  assert.match(result, /面白いよ/);
  assert.match(result, /Hollow Knight/);
  assert.match(result, /https:\/\/store\.steampowered\.com\/app\/367520\//);
});

test('appendGameLinks returns the original text unchanged when there are no matches', () => {
  assert.equal(appendGameLinks('面白いよ', []), '面白いよ');
});

test('appendGameLinks keeps the total length within the Discord message cap', () => {
  const longText = 'あ'.repeat(1990);
  const games = [{ name: 'Hollow Knight', id: '367520' }];
  const result = appendGameLinks(longText, games, 2000);
  assert.ok(result.length <= 2000);
});
