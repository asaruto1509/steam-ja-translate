'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQuizPrompt, formatQuizReply } = require('./quiz.js');

test('buildQuizPrompt tells the AI never to reveal the game name', () => {
  const prompt = buildQuizPrompt('Hollow Knight', ['最高の探索アクション']);
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /含めないで/);
});

test('formatQuizReply shows the hints and hides the answer behind a spoiler', () => {
  const reply = formatQuizReply('・地下世界を探索するアクション\n・美麗なドット絵', 'Hollow Knight', '1');
  assert.match(reply.embeds[0].description, /地下世界/);
  assert.equal(reply.embeds[0].fields[0].value, '||[Hollow Knight](https://store.steampowered.com/app/1/)||');
});

test('formatQuizReply returns a not-found message when no hints could be generated', () => {
  const reply = formatQuizReply(null, null, null);
  assert.match(reply.content, /出題できなかった/);
});
