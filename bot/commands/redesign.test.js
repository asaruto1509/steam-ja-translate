'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRedesignPrompt, formatRedesignReply, handleRedesignCommand } = require('./redesign.js');

test('buildRedesignPrompt includes the game name and the negative review texts', () => {
  const prompt = buildRedesignPrompt('Hollow Knight', ['難易度が理不尽']);
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /難易度が理不尽/);
});

test('formatRedesignReply builds an embed with the AI pitch text', () => {
  const reply = formatRedesignReply('Hollow Knight', '【課題分析】難易度が理不尽\n【Ver.9.9.9】救済措置を追加', '367520', null);
  const embed = reply.embeds[0];
  assert.match(embed.title, /Hollow Knight/);
  assert.match(embed.description, /課題分析/);
  assert.equal(embed.url, 'https://store.steampowered.com/app/367520/');
});

test('formatRedesignReply returns a not-found message when the game was not found', () => {
  const reply = formatRedesignReply('存在しないゲーム', null, null, 'not_found');
  assert.match(reply.content, /見つからなかった/);
});

test('formatRedesignReply returns a no-reviews message when there are no negative reviews', () => {
  const reply = formatRedesignReply('神ゲー', null, null, 'no_reviews');
  assert.match(reply.content, /不満点/);
});

test('handleRedesignCommand replies with a not-found message when the game is not found', async () => {
  let replied = null;
  const interaction = {
    options: { getString: () => 'ないゲーム' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => null,
    fetchOpposingReviews: async () => { throw new Error('should not be called'); },
    fetchChatReply: async () => { throw new Error('should not be called'); }
  };
  await handleRedesignCommand(interaction, deps);
  assert.match(replied.content, /見つからなかった/);
});

test('handleRedesignCommand fetches negative reviews and posts the AI pitch on success', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: () => 'Hollow Knight' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => ({ id: '367520', name: 'Hollow Knight' }),
    fetchOpposingReviews: async () => ({ positive: [], negative: ['難易度が理不尽'] }),
    fetchChatReply: async () => '【課題分析】難易度が理不尽\n【Ver.9.9.9】救済措置を追加'
  };
  await handleRedesignCommand(interaction, deps);
  assert.match(replied.embeds[0].title, /Hollow Knight/);
  assert.match(replied.embeds[0].description, /課題分析/);
});

test('handleRedesignCommand replies with a no-reviews message when there are no negative reviews', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: () => '神ゲー' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => ({ id: '1', name: '神ゲー' }),
    fetchOpposingReviews: async () => ({ positive: ['最高'], negative: [] }),
    fetchChatReply: async () => { throw new Error('should not be called'); }
  };
  await handleRedesignCommand(interaction, deps);
  assert.match(replied.content, /不満点/);
});
