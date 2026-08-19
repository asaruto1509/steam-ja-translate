'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDebatePrompt, formatBattleReply, handleBattleCommand } = require('./battle.js');

test('buildDebatePrompt includes the game name and both review sides', () => {
  const prompt = buildDebatePrompt('Hollow Knight', ['探索が楽しい'], ['操作が難しい']);
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /探索が楽しい/);
  assert.match(prompt, /操作が難しい/);
});

test('formatBattleReply builds an embed with the debate text', () => {
  const reply = formatBattleReply('Hollow Knight', 'ポジ丸: 神ゲー！\nネガ介: 操作が難しい。', '367520', null);
  const embed = reply.embeds[0];
  assert.match(embed.title, /Hollow Knight/);
  assert.match(embed.description, /ポジ丸/);
  assert.equal(embed.url, 'https://store.steampowered.com/app/367520/');
});

test('formatBattleReply returns a not-found message when the game was not found', () => {
  const reply = formatBattleReply('存在しないゲーム', null, null, 'not_found');
  assert.match(reply.content, /見つからなかった/);
});

test('formatBattleReply returns a no-reviews message when there are not enough opposing reviews', () => {
  const reply = formatBattleReply('新作ゲーム', null, null, 'no_reviews');
  assert.match(reply.content, /レビューが/);
});

test('handleBattleCommand replies with a not-found message when the game is not found', async () => {
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
  await handleBattleCommand(interaction, deps);
  assert.match(replied.content, /見つからなかった/);
});

test('handleBattleCommand fetches opposing reviews and posts the AI debate on success', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: () => 'Hollow Knight' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => ({ id: '367520', name: 'Hollow Knight' }),
    fetchOpposingReviews: async () => ({ positive: ['探索が楽しい'], negative: ['操作が難しい'] }),
    fetchChatReply: async () => 'ポジ丸: 神ゲー！\nネガ介: 操作が難しい。'
  };
  await handleBattleCommand(interaction, deps);
  assert.match(replied.embeds[0].title, /Hollow Knight/);
  assert.match(replied.embeds[0].description, /ポジ丸/);
});

test('handleBattleCommand replies with a no-reviews message when both sides are empty', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: () => 'Hollow Knight' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => ({ id: '367520', name: 'Hollow Knight' }),
    fetchOpposingReviews: async () => ({ positive: [], negative: [] }),
    fetchChatReply: async () => { throw new Error('should not be called'); }
  };
  await handleBattleCommand(interaction, deps);
  assert.match(replied.content, /レビューが/);
});
