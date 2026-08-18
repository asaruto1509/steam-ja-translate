'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUpcomingPrompt, formatUpcomingReply } = require('./upcoming.js');

test('buildUpcomingPrompt lists each game name', () => {
  const prompt = buildUpcomingPrompt([{ name: 'Wordforge' }, { name: 'TFC2' }]);
  assert.match(prompt, /Wordforge/);
  assert.match(prompt, /TFC2/);
});

test('formatUpcomingReply lists each game as a linked field with the AI blurb', () => {
  const games = [{ id: '1', name: 'Wordforge' }, { id: '2', name: 'TFC2' }];
  const reply = formatUpcomingReply(games, '来週は文字パズルと歴史サバイバルが熱い！');
  assert.match(reply.embeds[0].description, /文字パズル/);
  assert.equal(reply.embeds[0].fields.length, 2);
  assert.match(reply.embeds[0].fields[0].value, /store.steampowered.com\/app\/1\//);
});

test('formatUpcomingReply returns a plain message when the pool is empty', () => {
  const reply = formatUpcomingReply([], null);
  assert.match(reply.content, /見つからなかった/);
});
