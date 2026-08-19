'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHypePrompt, parseHypeResult, formatHypeReply, handleHypeCommand } = require('./hype.js');

test('buildHypePrompt includes the game name and joined review texts', () => {
  const prompt = buildHypePrompt('Hollow Knight', ['探索が楽しい', '難易度が高い']);
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /探索が楽しい/);
  assert.match(prompt, /難易度が高い/);
});

test('parseHypeResult extracts JSON even with a <think> block mixed in', () => {
  const raw = '<think>{"catchphrase":"dummy"}</think>{"catchphrase":"洞窟に潜れ","goodPoints":["探索が楽しい"],"cautionPoints":["操作が難しい"]}';
  const result = parseHypeResult(raw);
  assert.equal(result.catchphrase, '洞窟に潜れ');
  assert.deepEqual(result.goodPoints, ['探索が楽しい']);
  assert.deepEqual(result.cautionPoints, ['操作が難しい']);
});

test('parseHypeResult returns null for unparsable text', () => {
  assert.equal(parseHypeResult('日本語の文章だけでJSONが無い'), null);
});

test('formatHypeReply builds an embed with price, catchphrase, and points', () => {
  const result = { catchphrase: '洞窟に潜れ', goodPoints: ['探索が楽しい', '音楽が良い'], cautionPoints: ['操作が難しい'] };
  const priceDetail = { finalPrice: 1000, originalPrice: 1000, discountPercent: 0 };
  const reply = formatHypeReply('Hollow Knight', result, '367520', null, priceDetail);
  const embed = reply.embeds[0];
  assert.equal(embed.title, 'Hollow Knight');
  assert.match(embed.description, /洞窟に潜れ/);
  assert.match(embed.fields[0].value, /¥1,000/);
  assert.match(embed.fields[1].value, /探索が楽しい/);
  assert.match(embed.fields[2].value, /操作が難しい/);
  assert.equal(embed.url, 'https://store.steampowered.com/app/367520/');
});

test('formatHypeReply returns a not-found message when the game was not found', () => {
  const reply = formatHypeReply('存在しないゲーム', null, null, 'not_found');
  assert.match(reply.content, /見つからなかった/);
});

test('formatHypeReply returns a no-reviews message when there are no reviews', () => {
  const reply = formatHypeReply('新作ゲーム', null, null, 'no_reviews');
  assert.match(reply.content, /レビューがまだ無い/);
});

test('formatHypeReply returns a parse-failure message on AI parse failure', () => {
  const reply = formatHypeReply('あるゲーム', null, null, 'parse_failed');
  assert.match(reply.content, /失敗/);
});

test('handleHypeCommand replies with a not-found message when the game is not found', async () => {
  let replied = null;
  const interaction = {
    options: { getString: () => 'ないゲーム' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => null,
    fetchReviews: async () => { throw new Error('should not be called'); },
    fetchChatReply: async () => { throw new Error('should not be called'); }
  };
  await handleHypeCommand(interaction, deps);
  assert.match(replied.content, /見つからなかった/);
});

test('handleHypeCommand fetches reviews and formats the AI result on success', async () => {
  process.env.ONEMIN_API_KEY = 'test-key';
  let replied = null;
  const interaction = {
    options: { getString: () => 'Hollow Knight' },
    deferReply: async () => {},
    editReply: async (r) => { replied = r; }
  };
  const deps = {
    searchGame: async () => ({ id: '367520', name: 'Hollow Knight' }),
    fetchReviews: async () => ['探索が楽しい', '難易度が高い'],
    fetchChatReply: async () => '{"catchphrase":"洞窟に潜れ","goodPoints":["探索が楽しい"],"cautionPoints":["操作が難しい"]}',
    fetchPriceDetail: async () => ({ finalPrice: 1000, originalPrice: 1000, discountPercent: 0 })
  };
  await handleHypeCommand(interaction, deps);
  assert.equal(replied.embeds[0].title, 'Hollow Knight');
  assert.match(replied.embeds[0].description, /洞窟に潜れ/);
  assert.match(replied.embeds[0].fields[0].value, /¥1,000/);
});
