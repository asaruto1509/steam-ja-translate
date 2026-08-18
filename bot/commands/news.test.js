'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNewsSummaryPrompt, formatNewsReply } = require('./news.js');

test('buildNewsSummaryPrompt includes the game name and news contents', () => {
  const prompt = buildNewsSummaryPrompt('Hollow Knight', 'Update 1.5', 'Fixed several bugs and added new boss.');
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /Fixed several bugs/);
});

test('formatNewsReply builds an embed with the summary and news link', () => {
  const newsItem = { title: 'Update 1.5', url: 'https://store.steampowered.com/news/app/1/view/123', date: 1755500000 };
  const reply = formatNewsReply('Hollow Knight', newsItem, '新しいボスが追加され、バグ修正が行われた。', '1');
  assert.equal(reply.embeds[0].title, 'Hollow Knight - Update 1.5');
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/news/app/1/view/123');
  assert.equal(reply.embeds[0].image.url, 'https://cdn.akamai.steamstatic.com/steam/apps/1/header.jpg');
  assert.match(reply.embeds[0].description, /新しいボス/);
});

test('formatNewsReply returns a not-found message when there is no news item', () => {
  const reply = formatNewsReply('Unknown Game', null, null, null);
  assert.match(reply.content, /見つからなかった/);
});
