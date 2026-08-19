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

test('buildMashupPrompt includes real game context when given', () => {
  const prompt = buildMashupPrompt('ホラー', 'パズル', 'Inscryption', { genres: ['カードゲーム'], categories: [] });
  assert.match(prompt, /カードゲーム/);
});

test('formatMashupReply shows the matched game with the AI blurb and price', () => {
  const game = { id: '1', name: 'Inscryption' };
  const priceDetail = { finalPrice: 1980, originalPrice: 1980, discountPercent: 0 };
  const reply = formatMashupReply('ホラー', 'パズル', game, 'カードゲームとホラー演出が融合した異色作。', priceDetail);
  assert.equal(reply.embeds[0].title, 'Inscryption');
  assert.match(reply.embeds[0].description, /カードゲーム/);
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/app/1/');
  assert.match(reply.embeds[0].fields[0].value, /¥1,980/);
});

test('formatMashupReply returns a not-found message when nothing matched', () => {
  const reply = formatMashupReply('ホラー', 'パズル', null, null);
  assert.match(reply.content, /見つからなかった/);
});
