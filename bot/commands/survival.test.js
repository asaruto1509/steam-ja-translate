'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSurvivalPrompt, formatSurvivalReply, handleSurvivalCommand } = require('./survival.js');

test('buildSurvivalPrompt includes the game name, context, and occupation', () => {
  const prompt = buildSurvivalPrompt('Elden Ring', { genres: ['アクション'], categories: [] }, '過酷な死にゲー', 'フロントエンドエンジニア');
  assert.match(prompt, /Elden Ring/);
  assert.match(prompt, /アクション/);
  assert.match(prompt, /フロントエンドエンジニア/);
});

test('formatSurvivalReply builds an embed titled with the game and occupation', () => {
  const reply = formatSurvivalReply('Elden Ring', 'フロントエンドエンジニア', '📊 生存難易度: 💀💀💀💀💀', '1245620', null);
  const embed = reply.embeds[0];
  assert.match(embed.title, /Elden Ring/);
  assert.match(embed.title, /フロントエンドエンジニア/);
  assert.match(embed.description, /生存難易度/);
  assert.equal(embed.url, 'https://store.steampowered.com/app/1245620/');
});

test('formatSurvivalReply returns a not-found message when the game was not found', () => {
  const reply = formatSurvivalReply('存在しないゲーム', '一般人', null, null, 'not_found');
  assert.match(reply.content, /見つからなかった/);
});

test('formatSurvivalReply returns a no-api-key message when AI is unavailable', () => {
  const reply = formatSurvivalReply('あるゲーム', '一般人', null, null, 'no_api_key');
  assert.match(reply.content, /AI/);
});

test('handleSurvivalCommand replies with a not-found message when the game is not found', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: (name) => (name === 'name' ? 'ないゲーム' : null) },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => null,
    fetchGameContext: async () => { throw new Error('should not be called'); },
    fetchPriceDetail: async () => { throw new Error('should not be called'); },
    fetchChatReply: async () => { throw new Error('should not be called'); }
  };
  await handleSurvivalCommand(interaction, deps);
  assert.match(replied.content, /見つからなかった/);
});

test('handleSurvivalCommand defaults occupation and posts the AI diagnosis on success', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: (name) => (name === 'name' ? 'Elden Ring' : null) },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  let capturedPrompt = null;
  const deps = {
    searchGame: async () => ({ id: '1245620', name: 'Elden Ring' }),
    fetchGameContext: async () => ({ genres: ['アクション'], categories: [] }),
    fetchPriceDetail: async () => ({ shortDescription: '過酷な死にゲー' }),
    fetchChatReply: async (prompt) => { capturedPrompt = prompt; return '📊 生存難易度: 💀💀💀💀💀'; }
  };
  await handleSurvivalCommand(interaction, deps);
  assert.match(capturedPrompt, /Discordの一般市民/);
  assert.match(replied.embeds[0].title, /Elden Ring/);
});
