'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUrbanLegendPrompt, formatUrbanLegendReply, handleUrbanLegendCommand } = require('./urbanlegend.js');

test('buildUrbanLegendPrompt includes the game name, context, description, and reviews', () => {
  const prompt = buildUrbanLegendPrompt('Stardew Valley', { genres: ['シミュレーション'], categories: [] }, 'のどかな農場生活シム', ['夜になると誰かの視線を感じる']);
  assert.match(prompt, /Stardew Valley/);
  assert.match(prompt, /シミュレーション/);
  assert.match(prompt, /のどかな農場生活シム/);
  assert.match(prompt, /夜になると誰かの視線を感じる/);
});

test('formatUrbanLegendReply builds an embed with the AI-generated report', () => {
  const reply = formatUrbanLegendReply('Stardew Valley', '■ 調査報告書: 事案「農場の囁き」', '413150', null);
  const embed = reply.embeds[0];
  assert.match(embed.title, /Stardew Valley/);
  assert.match(embed.description, /農場の囁き/);
  assert.equal(embed.url, 'https://store.steampowered.com/app/413150/');
});

test('formatUrbanLegendReply returns a not-found message when the game was not found', () => {
  const reply = formatUrbanLegendReply('存在しないゲーム', null, null, 'not_found');
  assert.match(reply.content, /見つからなかった/);
});

test('formatUrbanLegendReply returns a no-api-key message when AI is unavailable', () => {
  const reply = formatUrbanLegendReply('あるゲーム', null, null, 'no_api_key');
  assert.match(reply.content, /AI/);
});

test('handleUrbanLegendCommand replies with a not-found message when the game is not found', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: () => 'ないゲーム' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => null,
    fetchGameContext: async () => { throw new Error('should not be called'); },
    fetchPriceDetail: async () => { throw new Error('should not be called'); },
    fetchReviews: async () => { throw new Error('should not be called'); },
    fetchChatReply: async () => { throw new Error('should not be called'); }
  };
  await handleUrbanLegendCommand(interaction, deps);
  assert.match(replied.content, /見つからなかった/);
});

test('handleUrbanLegendCommand gathers context and posts the AI report on success', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: () => 'Stardew Valley' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => ({ id: '413150', name: 'Stardew Valley' }),
    fetchGameContext: async () => ({ genres: ['シミュレーション'], categories: [] }),
    fetchPriceDetail: async () => ({ shortDescription: 'のどかな農場生活シム' }),
    fetchReviews: async () => ['夜になると誰かの視線を感じる'],
    fetchChatReply: async () => '■ 調査報告書: 事案「農場の囁き」'
  };
  await handleUrbanLegendCommand(interaction, deps);
  assert.match(replied.embeds[0].title, /Stardew Valley/);
  assert.match(replied.embeds[0].description, /農場の囁き/);
});
