'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAskPrompt, formatAskReply, buildThreadName, handleAskCommand } = require('./ask.js');

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

test('formatAskReply includes the Steam header image and store link when an appid is given', () => {
  const reply = formatAskReply('Game', 'Q', 'A', '1');
  assert.equal(reply.embeds[0].image.url, 'https://cdn.akamai.steamstatic.com/steam/apps/1/header.jpg');
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/app/1/');
});

test('formatAskReply omits image and link when no appid is given', () => {
  const reply = formatAskReply('Game', 'Q', 'A', null);
  assert.equal(reply.embeds[0].image, undefined);
  assert.equal(reply.embeds[0].url, undefined);
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

test('handleAskCommand replies with a friendly message and skips AI calls when no apiKey is configured', async () => {
  let replied = null;
  const interaction = {
    options: { getString: (name) => (name === 'game' ? 'Hollow Knight' : '質問') },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    apiKey: null,
    searchGame: async () => { throw new Error('should not be called'); },
    fetchChatReply: async () => { throw new Error('should not be called'); }
  };
  await handleAskCommand(interaction, deps);
  assert.match(replied.content, /AI/);
});
