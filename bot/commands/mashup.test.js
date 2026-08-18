'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMashupPrompt, formatMashupReply } = require('./mashup.js');

test('buildMashupPrompt includes both genres and the matched game name', () => {
  const prompt = buildMashupPrompt('ホラー', 'パズル', 'Inscryption');
  assert.match(prompt, /ホラー/);
  assert.match(prompt, /パズル/);
  assert.match(prompt, /Inscryption/);
});

test('formatMashupReply shows the matched game with the AI blurb', () => {
  const game = { id: '1', name: 'Inscryption' };
  const reply = formatMashupReply('ホラー', 'パズル', game, 'カードゲームとホラー演出が融合した異色作。');
  assert.equal(reply.embeds[0].title, 'Inscryption');
  assert.match(reply.embeds[0].description, /カードゲーム/);
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/app/1/');
});

test('formatMashupReply returns a not-found message when nothing matched', () => {
  const reply = formatMashupReply('ホラー', 'パズル', null, null);
  assert.match(reply.content, /見つからなかった/);
});
