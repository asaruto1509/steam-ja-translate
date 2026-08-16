'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRandomGames, parseGameAnalysis } = require('./recommend-games.js');

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
