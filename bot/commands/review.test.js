'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnalysisPrompt, parseAnalysis, formatReviewReply } = require('./review.js');

test('formatReviewReply includes the Steam header image and store link when an appid is given', () => {
  const analysis = { verdict: '買い', reason: null, categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [] };
  const reply = formatReviewReply('Some Game', analysis, null, '1', null);
  assert.equal(reply.embeds[0].image.url, 'https://cdn.akamai.steamstatic.com/steam/apps/1/header.jpg');
  assert.equal(reply.embeds[0].url, 'https://store.steampowered.com/app/1/');
});

test('formatReviewReply shows a genre/category tag field when game context is given', () => {
  const analysis = { verdict: '買い', reason: null, categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [] };
  const reply = formatReviewReply('Some Game', analysis, null, '1', { genres: ['アクション', 'RPG'], categories: ['シングルプレイヤー'] });
  const tagField = reply.embeds[0].fields.find(f => f.name.includes('ジャンル'));
  assert.match(tagField.value, /アクション/);
  assert.match(tagField.value, /シングルプレイヤー/);
});

test('buildAnalysisPrompt includes the game name and review text', () => {
  const prompt = buildAnalysisPrompt('Hollow Knight', ['最高のメトロイドヴァニア']);
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /最高のメトロイドヴァニア/);
});

test('buildAnalysisPrompt includes genre/category context when given', () => {
  const prompt = buildAnalysisPrompt('Hollow Knight', ['レビュー'], { genres: ['アクション'], categories: ['シングルプレイヤー'] });
  assert.match(prompt, /アクション/);
  assert.match(prompt, /シングルプレイヤー/);
});

test('buildAnalysisPrompt requests external critic scores via web search', () => {
  const prompt = buildAnalysisPrompt('Hollow Knight', ['レビュー']);
  assert.match(prompt, /"externalScores"/);
  assert.match(prompt, /Metacritic/);
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

test('parseAnalysis strips <think> blocks before extracting JSON', () => {
  const text = '<think>例えば{"foo":"bar"}みたいな形式かな</think>{"verdict":"買い","reason":"良い","categories":[],"pros":[],"cons":[],"audienceFor":[],"audienceAgainst":[]}';
  const analysis = parseAnalysis(text);
  assert.equal(analysis.verdict, '買い');
});

test('parseAnalysis extracts only the balanced JSON block, ignoring trailing text', () => {
  const text = '{"verdict":"買い","reason":"良い","categories":[{"name":"A","stars":3}],"pros":[],"cons":[],"audienceFor":[],"audienceAgainst":[]} 以上です。';
  const analysis = parseAnalysis(text);
  assert.equal(analysis.verdict, '買い');
  assert.equal(analysis.categories[0].stars, 3);
});

test('formatReviewReply returns a not-found message when the game was not found on Steam', () => {
  const reply = formatReviewReply('Unknown Game', null, null, null, null, 'not_found');
  assert.match(reply.content, /見つからなかった/);
});

test('formatReviewReply returns a no-reviews message when the game has no reviews yet', () => {
  const reply = formatReviewReply('New Game', null, null, null, null, 'no_reviews');
  assert.match(reply.content, /レビューがまだ/);
});

test('formatReviewReply returns a distinct message when AI analysis failed to parse', () => {
  const reply = formatReviewReply('Some Game', null, null, null, null, 'parse_failed');
  assert.match(reply.content, /もう一度/);
  assert.doesNotMatch(reply.content, /見つからなかった/);
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

test('formatReviewReply shows external critic scores when present', () => {
  const analysis = { verdict: '買い', reason: null, categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [], externalScores: [{ source: 'Metacritic', score: '87/100' }] };
  const reply = formatReviewReply('Some Game', analysis, null, '1', null);
  const field = reply.embeds[0].fields.find(f => f.name.includes('外部評価'));
  assert.ok(field);
  assert.match(field.value, /Metacritic: 87\/100/);
});

test('formatReviewReply omits the external scores field when there are none', () => {
  const analysis = { verdict: '買い', reason: null, categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [] };
  const reply = formatReviewReply('Some Game', analysis, null, '1', null);
  assert.ok(!reply.embeds[0].fields.some(f => f.name.includes('外部評価')));
});

test('formatReviewReply skips optional fields gracefully when data is missing', () => {
  const analysis = { verdict: '見送り', reason: null, categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [] };
  const reply = formatReviewReply('Some Game', analysis, null);
  assert.equal(reply.embeds[0].title, 'Some Game');
  const fieldNames = reply.embeds[0].fields.map(f => f.name);
  assert.ok(!fieldNames.some(n => n.includes('ポジティブ')));
});
