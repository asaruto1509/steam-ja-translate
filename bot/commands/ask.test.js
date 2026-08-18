'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAskPrompt, formatAskReply, buildThreadName } = require('./ask.js');

test('buildAskPrompt includes the game name and question', () => {
  const prompt = buildAskPrompt('Hollow Knight', 'クリアまで何時間くらい？');
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /クリアまで何時間くらい？/);
});

test('formatAskReply builds an embed with question and answer fields', () => {
  const reply = formatAskReply('Hollow Knight', 'クリアまで何時間くらい？', '大体20〜30時間くらいだよ。');
  assert.equal(reply.embeds[0].title, 'Hollow Knight について');
  assert.equal(reply.embeds[0].fields[0].value, 'クリアまで何時間くらい？');
  assert.equal(reply.embeds[0].fields[1].value, '大体20〜30時間くらいだよ。');
});

test('formatAskReply truncates an overly long answer to fit the field limit', () => {
  const longAnswer = 'あ'.repeat(2000);
  const reply = formatAskReply('Game', 'Q', longAnswer);
  assert.ok(reply.embeds[0].fields[1].value.length <= 1024);
});

test('formatAskReply falls back to a message when answer is empty', () => {
  const reply = formatAskReply('Game', 'Q', '');
  assert.match(reply.embeds[0].fields[1].value, /うまく回答を生成できなかった/);
});

test('buildThreadName appends the suffix to the game name', () => {
  assert.equal(buildThreadName('Hollow Knight'), 'Hollow Knight について');
});

test('buildThreadName truncates long game names to fit the 100-char thread name limit', () => {
  const longName = 'あ'.repeat(150);
  const name = buildThreadName(longName);
  assert.ok(name.length <= 100);
  assert.match(name, /について$/);
});
