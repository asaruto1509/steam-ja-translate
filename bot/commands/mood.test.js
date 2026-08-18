'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKeywordPrompt, buildMoodReasonPrompt, formatMoodReply } = require('./mood.js');

test('buildKeywordPrompt includes the user query', () => {
  const prompt = buildKeywordPrompt('まったり農業したい');
  assert.match(prompt, /まったり農業したい/);
});

test('buildMoodReasonPrompt includes the query and matched game name', () => {
  const prompt = buildMoodReasonPrompt('まったり農業したい', 'Stardew Valley');
  assert.match(prompt, /まったり農業したい/);
  assert.match(prompt, /Stardew Valley/);
});

test('buildMoodReasonPrompt includes real game context when given', () => {
  const prompt = buildMoodReasonPrompt('まったり農業したい', 'Stardew Valley', { genres: ['シミュレーション'], categories: [] });
  assert.match(prompt, /シミュレーション/);
});

test('formatMoodReply shows the matched game with the AI reasoning', () => {
  const reply = formatMoodReply('まったり農業したい', { id: '1', name: 'Stardew Valley' }, 'のんびり農業と町づくりが楽しめる名作。');
  assert.equal(reply.embeds[0].title, 'Stardew Valley');
  assert.match(reply.embeds[0].description, /のんびり農業/);
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/app/1/');
});

test('formatMoodReply returns a not-found message when nothing matched', () => {
  const reply = formatMoodReply('謎の気分', null, null);
  assert.match(reply.content, /見つからなかった/);
});
