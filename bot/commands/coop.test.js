'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKeywordPrompt, buildCompromisePrompt, formatCoopReply, handleCoopCommand } = require('./coop.js');

test('buildKeywordPrompt includes the member tastes', () => {
  const prompt = buildKeywordPrompt('FPS好き、農業好き、ホラー好き');
  assert.match(prompt, /FPS好き、農業好き、ホラー好き/);
});

test('buildCompromisePrompt includes tastes, game name, and context line', () => {
  const prompt = buildCompromisePrompt('FPS好き、農業好き', 'Deep Rock Galactic', { genres: ['アクション'], categories: ['協力プレイ'] });
  assert.match(prompt, /FPS好き、農業好き/);
  assert.match(prompt, /Deep Rock Galactic/);
  assert.match(prompt, /アクション/);
});

test('buildCompromisePrompt works without game context', () => {
  const prompt = buildCompromisePrompt('好み', 'ゲーム名', null);
  assert.match(prompt, /ゲーム名/);
});

test('formatCoopReply builds an embed with tastes, price, and the AI compromise plan', () => {
  const game = { id: '248820', name: 'Deep Rock Galactic' };
  const priceDetail = { finalPrice: 2000, originalPrice: 2000, discountPercent: 0 };
  const reply = formatCoopReply('FPS好き、農業好き', game, priceDetail, '一人は採掘役、一人は護衛役をやろう。', null);
  const embed = reply.embeds[0];
  assert.match(embed.title, /Deep Rock Galactic/);
  assert.equal(embed.url, 'https://store.steampowered.com/app/248820/');
  assert.match(embed.description, /採掘役/);
  assert.match(embed.fields[0].value, /FPS好き、農業好き/);
  assert.match(embed.fields[1].value, /¥2,000/);
});

test('formatCoopReply returns a not-found message when no game was found', () => {
  const reply = formatCoopReply('好み', null, null, null, 'not_found');
  assert.match(reply.content, /見つからなかった/);
});

test('formatCoopReply returns a no-api-key message when AI is unavailable', () => {
  const reply = formatCoopReply('好み', null, null, null, 'no_api_key');
  assert.match(reply.content, /AI/);
});

test('handleCoopCommand replies with a no-api-key message when ONEMIN_API_KEY is unset', async () => {
  delete process.env.ONEMIN_API_KEY;
  let replied = null;
  const interaction = {
    options: { getString: () => '好み色々' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    fetchChatReply: async () => { throw new Error('should not be called'); },
    searchGame: async () => { throw new Error('should not be called'); },
    fetchGameContext: async () => { throw new Error('should not be called'); },
    fetchPriceDetail: async () => { throw new Error('should not be called'); }
  };
  await handleCoopCommand(interaction, deps);
  assert.match(replied.content, /AI/);
});

test('handleCoopCommand searches by AI keyword and formats a full reply on success', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: () => 'FPS好き、農業好き' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const calls = [];
  const deps = {
    fetchChatReply: async (prompt) => {
      calls.push(prompt);
      return calls.length === 1 ? 'deep rock galactic co-op mining' : '一人は採掘役、一人は護衛役をやろう。';
    },
    searchGame: async () => ({ id: '248820', name: 'Deep Rock Galactic' }),
    fetchGameContext: async () => ({ genres: ['アクション'], categories: ['協力プレイ'] }),
    fetchPriceDetail: async () => ({ finalPrice: 2000, originalPrice: 2000, discountPercent: 0 })
  };
  await handleCoopCommand(interaction, deps);
  assert.equal(replied.embeds[0].title.includes('Deep Rock Galactic'), true);
  assert.match(replied.embeds[0].description, /採掘役/);
  assert.equal(calls.length, 2);
});
