'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnalysisPrompt, parseAnalysis, formatReviewReply } = require('./review.js');

test('formatReviewReply includes the Steam header image and store link when an appid is given', () => {
  const analysis = { verdict: '買い', reason: null, categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [] };
  const reply = formatReviewReply('Some Game', analysis, null, '1');
  assert.equal(reply.embeds[0].image.url, 'https://cdn.akamai.steamstatic.com/steam/apps/1/header.jpg');
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/app/1/');
});

test('buildAnalysisPrompt includes the game name and review text', () => {
  const prompt = buildAnalysisPrompt('Hollow Knight', ['最高のメトロイドヴァニア']);
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /最高のメトロイドヴァニア/);
});

test('parseAnalysis extracts a JSON object from the AI response', () => {
  const text = '{"verdict":"買い","reason":"コスパ良好","categories":[{"name":"ゲームプレイ","stars":4}],"pros":["操作性が良い"],"cons":["ボリューム少なめ"],"audienceFor":["探索好き"],"audienceAgainst":["ストーリー重視派"]}';
  const analysis = parseAnalysis(text);
  assert.equal(analysis.verdict, '買い');
  assert.equal(analysis.categories[0].stars, 4);
});

test('parseAnalysis returns null for unparsable text', () => {
  assert.equal(parseAnalysis('AIが変な文章を返した'), null);
});

test('formatReviewReply returns a not-found message when analysis is null', () => {
  const reply = formatReviewReply('Unknown Game', null, null);
  assert.match(reply.content, /見つからなかった/);
});

test('formatReviewReply shows verdict, categories, pros, cons and audience fields', () => {
  const analysis = {
    verdict: '買い',
    reason: 'コスパ良好',
    categories: [{ name: 'ゲームプレイ', stars: 4 }, { name: 'ストーリー', stars: null }],
    pros: ['操作性が良い'],
    cons: ['ボリューム少なめ'],
    audienceFor: ['探索好き'],
    audienceAgainst: ['ストーリー重視派']
  };
  const reply = formatReviewReply('Hollow Knight', analysis, { positivePct: 92, totalReviews: 5000 });
  assert.equal(reply.embeds[0].title, 'Hollow Knight');
  assert.match(reply.embeds[0].description, /✅/);
  assert.match(reply.embeds[0].description, /買い/);
  assert.match(reply.embeds[0].description, /コスパ良好/);
  const fieldNames = reply.embeds[0].fields.map(f => f.name);
  assert.ok(fieldNames.some(n => n.includes('カテゴリ')));
  assert.ok(fieldNames.some(n => n.includes('良い点')));
  assert.ok(fieldNames.some(n => n.includes('悪い点')));
  assert.ok(fieldNames.some(n => n.includes('向')));
  assert.ok(fieldNames.some(n => n.includes('ポジティブ')));
  const categoryField = reply.embeds[0].fields.find(f => f.name.includes('カテゴリ'));
  assert.match(categoryField.value, /ゲームプレイ/);
  assert.doesNotMatch(categoryField.value, /ストーリー/);
  const positiveField = reply.embeds[0].fields.find(f => f.name.includes('ポジティブ'));
  assert.match(positiveField.value, /92%/);
});

test('formatReviewReply skips optional fields gracefully when data is missing', () => {
  const analysis = { verdict: '見送り', reason: null, categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [] };
  const reply = formatReviewReply('Some Game', analysis, null);
  assert.equal(reply.embeds[0].title, 'Some Game');
  const fieldNames = reply.embeds[0].fields.map(f => f.name);
  assert.ok(!fieldNames.some(n => n.includes('ポジティブ')));
});
