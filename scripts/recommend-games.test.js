'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRandomGames, pickAnalyzableGames, parseGameAnalysis, buildRecommendEmbeds, buildHeaderEmbed } = require('./recommend-games.js');

test('pickRandomGames returns exactly n items from a larger pool', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' },
    { id: '4', name: 'D' }, { id: '5', name: 'E' }
  ];
  const result = pickRandomGames(pool, 3, () => 0);
  assert.equal(result.length, 3);
});

test('pickRandomGames dedupes by id before selecting (same game in both source lists)', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '1', name: 'A (dup)' }, { id: '2', name: 'B' }
  ];
  const result = pickRandomGames(pool, 2, () => 0);
  assert.equal(result.length, 2);
  const ids = result.map((g) => g.id);
  assert.equal(new Set(ids).size, 2);
});

test('pickRandomGames with a fixed rng produces a deterministic, reproducible order', () => {
  const pool = [
    { id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }, { id: '4', name: 'D' }
  ];
  const fixedRng = () => 0.5;
  const result1 = pickRandomGames(pool, 4, fixedRng);
  const result2 = pickRandomGames(pool, 4, fixedRng);
  assert.deepEqual(result1.map((g) => g.id), result2.map((g) => g.id));
});

test('pickRandomGames returns fewer items than n if the deduped pool is smaller than n', () => {
  const pool = [{ id: '1', name: 'A' }, { id: '1', name: 'A (dup)' }];
  const result = pickRandomGames(pool, 5, () => 0);
  assert.equal(result.length, 1);
});

test('pickAnalyzableGames puts games with enough reviews first, keeps shuffle order within each group', () => {
  const shuffled = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
  const reviewsByGameId = { '2': ['r1', 'r2', 'r3'], '4': ['r1'] };
  const result = pickAnalyzableGames(shuffled, 4, reviewsByGameId, 1);
  assert.deepEqual(result.map((g) => g.id), ['2', '4', '1', '3']);
});

test('pickAnalyzableGames always returns n items even when nothing meets the review threshold', () => {
  const shuffled = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const result = pickAnalyzableGames(shuffled, 3, {}, 1);
  assert.equal(result.length, 3);
});

test('pickAnalyzableGames respects the minReviews threshold, not just presence of any reviews', () => {
  const shuffled = [{ id: '1' }, { id: '2' }];
  const reviewsByGameId = { '1': ['only one review'] };
  const result = pickAnalyzableGames(shuffled, 2, reviewsByGameId, 3);
  // '1' has only 1 review, below the threshold of 3, so it should NOT be treated as analyzable —
  // both should land in the leftover group, order preserved
  assert.deepEqual(result.map((g) => g.id), ['1', '2']);
});

test('parseGameAnalysis parses a clean JSON response', () => {
  const text = '{"verdict":"買い","reason":"完成度が高い","good":["操作性が良い","BGMが良い"],"concern":"難易度が高め"}';
  const result = parseGameAnalysis(text);
  assert.deepEqual(result, {
    verdict: '買い',
    reason: '完成度が高い',
    good: ['操作性が良い', 'BGMが良い'],
    concern: '難易度が高め'
  });
});

test('parseGameAnalysis extracts JSON even when wrapped in surrounding prose', () => {
  const text = '以下が分析結果です:\n{"verdict":"今すぐ買い","reason":"神ゲー","good":["神ゲー"],"concern":""}\nご参考までに。';
  const result = parseGameAnalysis(text);
  assert.equal(result.verdict, '今すぐ買い');
});

test('parseGameAnalysis nulls out only the leaked field, keeps the rest', () => {
  const text = '{"verdict":"買い","reason":"20字以内で理由","good":["本物の良い点"],"concern":""}';
  const result = parseGameAnalysis(text);
  assert.equal(result.verdict, '買い');
  assert.equal(result.reason, '');
  assert.deepEqual(result.good, ['本物の良い点']);
});

test('parseGameAnalysis filters leaked entries out of the good array individually', () => {
  const text = '{"verdict":"買い","reason":"","good":["15字以内の良い点1","本物の良い点2"],"concern":""}';
  const result = parseGameAnalysis(text);
  assert.deepEqual(result.good, ['本物の良い点2']);
});

test('parseGameAnalysis returns null for unparseable text', () => {
  assert.equal(parseGameAnalysis('すみません、分析できませんでした'), null);
  assert.equal(parseGameAnalysis(''), null);
  assert.equal(parseGameAnalysis(null), null);
});

test('buildRecommendEmbeds includes all analysis fields when analysis succeeded', () => {
  const games = [{
    id: '100', name: 'Test Game', finalPrice: 1000, originalPrice: 1000, discountPercent: 0,
    image: 'https://example.com/img.jpg',
    analysis: { verdict: '買い', reason: '面白い', good: ['操作性が良い'], concern: '短い' }
  }];
  const embeds = buildRecommendEmbeds(games);
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].title, 'Test Game');
  assert.equal(embeds[0].image.url, 'https://example.com/img.jpg');
  assert.match(embeds[0].description, /買い/);
  assert.match(embeds[0].description, /面白い/);
  assert.equal(embeds[0].color, 0x2ecc71);
  const fieldNames = embeds[0].fields.map((f) => f.name);
  assert.ok(fieldNames.includes('👍 良い点'));
  assert.ok(fieldNames.includes('⚠ 懸念'));
});

test('buildRecommendEmbeds sets footer index out of the full batch', () => {
  const games = [
    { id: '1', name: 'A', finalPrice: 100, originalPrice: 100, discountPercent: 0, image: 'a', analysis: null },
    { id: '2', name: 'B', finalPrice: 100, originalPrice: 100, discountPercent: 0, image: 'b', analysis: null }
  ];
  const embeds = buildRecommendEmbeds(games);
  assert.equal(embeds[0].footer.text, '本日のおすすめ 1/2');
  assert.equal(embeds[1].footer.text, '本日のおすすめ 2/2');
});

test('buildRecommendEmbeds degrades to a price-only embed when analysis is null', () => {
  const games = [{
    id: '200', name: 'No Analysis Game', finalPrice: 500, originalPrice: 500, discountPercent: 0,
    image: 'https://example.com/img2.jpg', analysis: null
  }];
  const embeds = buildRecommendEmbeds(games);
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].fields.length, 1);
  assert.equal(embeds[0].fields[0].name, '価格');
});

test('buildRecommendEmbeds formats a discounted price with strikethrough original price', () => {
  const games = [{
    id: '300', name: 'Sale Game', finalPrice: 750, originalPrice: 1000, discountPercent: 25,
    image: 'https://example.com/img3.jpg', analysis: null
  }];
  const embeds = buildRecommendEmbeds(games);
  assert.match(embeds[0].fields[0].value, /~~¥1,000~~/);
  assert.match(embeds[0].fields[0].value, /¥750/);
  assert.match(embeds[0].fields[0].value, /-25%/);
});

test('buildRecommendEmbeds preserves game order and count across multiple games', () => {
  const games = [
    { id: '1', name: 'First', finalPrice: 100, originalPrice: 100, discountPercent: 0, image: 'a', analysis: null },
    { id: '2', name: 'Second', finalPrice: 200, originalPrice: 200, discountPercent: 0, image: 'b', analysis: null }
  ];
  const embeds = buildRecommendEmbeds(games);
  assert.equal(embeds.length, 2);
  assert.equal(embeds[0].title, 'First');
  assert.equal(embeds[1].title, 'Second');
});

test('buildHeaderEmbed includes the pick count and a formatted date', () => {
  const embed = buildHeaderEmbed(5, new Date(2026, 7, 17));
  assert.match(embed.description, /5本/);
  assert.match(embed.description, /2026\/8\/17/);
  assert.equal(embed.title, '🎮 今日のおすすめゲーム');
});
