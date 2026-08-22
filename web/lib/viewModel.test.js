'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnalysisViewModel } = require('./viewModel.js');

test('buildAnalysisViewModel marks notFound when no game matched', () => {
  const vm = buildAnalysisViewModel({ found: null });
  assert.equal(vm.notFound, true);
});

test('buildAnalysisViewModel formats a free game price', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Free Game' },
    priceDetail: { finalPrice: 0, originalPrice: 0, discountPercent: 0 },
    reviewSummary: null,
    gameContext: null,
    analysis: null
  });
  assert.equal(vm.notFound, false);
  assert.equal(vm.priceHtml, '無料');
});

test('buildAnalysisViewModel formats a discounted price with strikethrough', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Sale Game' },
    priceDetail: { finalPrice: 1000, originalPrice: 2000, discountPercent: 50 },
    reviewSummary: null,
    gameContext: null,
    analysis: null
  });
  assert.match(vm.priceHtml, /¥2,000/);
  assert.match(vm.priceHtml, /¥1,000/);
  assert.match(vm.priceHtml, /-50%/);
});

test('buildAnalysisViewModel shows no-price message when priceDetail is null', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'No Price Game' },
    priceDetail: null,
    reviewSummary: null,
    gameContext: null,
    analysis: null
  });
  assert.equal(vm.priceHtml, '価格情報なし');
});

test('buildAnalysisViewModel formats review summary text', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Reviewed Game' },
    priceDetail: null,
    reviewSummary: { positivePct: 92, totalReviews: 1500 },
    gameContext: null,
    analysis: null
  });
  assert.equal(vm.reviewSummaryText, '92% (1,500件)');
});

test('buildAnalysisViewModel leaves analysis null when not provided', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'No Analysis Game' },
    priceDetail: null,
    reviewSummary: null,
    gameContext: null,
    analysis: null
  });
  assert.equal(vm.analysis, null);
});

test('buildAnalysisViewModel converts analysis categories into star strings', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Analyzed Game' },
    priceDetail: null,
    reviewSummary: null,
    gameContext: null,
    analysis: {
      verdict: '買い',
      reason: '安定して面白い',
      categories: [{ name: 'ゲームプレイ', stars: 4 }, { name: 'ストーリー', stars: null }],
      pros: ['操作感が良い'],
      cons: ['ボリューム不足'],
      audienceFor: ['アクション好き'],
      audienceAgainst: []
    }
  });
  assert.equal(vm.analysis.verdict, '買い');
  assert.deepEqual(vm.analysis.categoryLines, [{ name: 'ゲームプレイ', stars: '★★★★☆', starCount: 4 }]);
  assert.deepEqual(vm.analysis.pros, ['操作感が良い']);
  assert.deepEqual(vm.analysis.audienceAgainst, []);
});

test('buildAnalysisViewModel treats a non-array pros as empty instead of throwing', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Malformed Game' },
    priceDetail: null,
    reviewSummary: null,
    gameContext: null,
    analysis: {
      verdict: '買い',
      reason: '',
      categories: [],
      pros: '操作感が良い',
      cons: [],
      audienceFor: [],
      audienceAgainst: []
    }
  });
  assert.deepEqual(vm.analysis.pros, []);
});

test('buildAnalysisViewModel formats the current player count', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Popular Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    playerCount: 12345
  });
  assert.equal(vm.playerCountText, '12,345人');
});

test('buildAnalysisViewModel leaves playerCountText null when player count is unavailable', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    playerCount: null
  });
  assert.equal(vm.playerCountText, null);
});

test('buildAnalysisViewModel formats achievement stats', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    achievementStats: { count: 50, avgUnlockPct: 23.456, rarest: { name: 'Secret Ending', percent: 0.5 } }
  });
  assert.deepEqual(vm.achievementInfo, {
    count: 50, avgUnlockPct: '23.5', rarestName: 'Secret Ending', rarestPercent: 0.5, distribution: []
  });
});

test('buildAnalysisViewModel buckets achievement percentages into a 5-band distribution', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    achievementStats: {
      count: 6, avgUnlockPct: 50, rarest: { name: 'X', percent: 1 },
      percentages: [1, 15, 25, 65, 99, 100]
    }
  });
  assert.deepEqual(vm.achievementInfo.distribution, [
    { label: '0-20%', count: 2 },
    { label: '20-40%', count: 1 },
    { label: '40-60%', count: 0 },
    { label: '60-80%', count: 1 },
    { label: '80-100%', count: 2 }
  ]);
});

test('buildAnalysisViewModel leaves achievementInfo null when achievement stats are unavailable', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    achievementStats: null
  });
  assert.equal(vm.achievementInfo, null);
});

test('buildAnalysisViewModel treats a non-array categories as empty categoryLines instead of throwing', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Malformed Game' },
    priceDetail: null,
    reviewSummary: null,
    gameContext: null,
    analysis: {
      verdict: '買い',
      reason: '',
      categories: 'ゲームプレイ',
      pros: [],
      cons: [],
      audienceFor: [],
      audienceAgainst: []
    }
  });
  assert.deepEqual(vm.analysis.categoryLines, []);
});

test('buildAnalysisViewModel passes through isFavorite as true', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    isFavorite: true
  });
  assert.equal(vm.isFavorite, true);
});

test('buildAnalysisViewModel defaults isFavorite to false when not provided', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null
  });
  assert.equal(vm.isFavorite, false);
});

test('buildAnalysisViewModel passes through price history points', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    priceHistory: [{ date: '2026-07-01T00:00:00+00:00', price: 1500 }]
  });
  assert.deepEqual(vm.priceHistoryPoints, [{ date: '2026-07-01T00:00:00+00:00', price: 1500 }]);
});

test('buildAnalysisViewModel defaults priceHistoryPoints to an empty array when missing', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null
  });
  assert.deepEqual(vm.priceHistoryPoints, []);
});

test('buildAnalysisViewModel exposes the raw review positive percentage', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: { positivePct: 87, totalReviews: 500 }, gameContext: null, analysis: null
  });
  assert.equal(vm.reviewPositivePct, 87);
});

test('buildAnalysisViewModel leaves reviewPositivePct null when there is no review summary', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null
  });
  assert.equal(vm.reviewPositivePct, null);
});

test('buildAnalysisViewModel formats similar games with price, review, and player count text', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null,
    similarGamesData: [{
      name: 'Similar Game', appid: '999',
      priceDetail: { finalPrice: 500, originalPrice: 1000, discountPercent: 50 },
      reviewSummary: { positivePct: 90, totalReviews: 200 },
      playerCount: 42
    }]
  });
  assert.deepEqual(vm.similarGames, [{
    name: 'Similar Game', appid: '999',
    priceHtml: '<span class="orig">¥1,000</span> → <strong>¥500</strong> (-50%)',
    reviewSummaryText: '90% (200件)',
    playerCountText: '42人'
  }]);
});

test('buildAnalysisViewModel passes through valid externalScores entries', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null,
    analysis: {
      verdict: '買い', reason: '', categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [],
      externalScores: [{ source: 'Metacritic', score: '87/100' }, { source: 'no score' }, null]
    }
  });
  assert.deepEqual(vm.analysis.externalScores, [{ source: 'Metacritic', score: '87/100' }]);
});

test('buildAnalysisViewModel defaults externalScores to an empty array when missing', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null,
    analysis: { verdict: '買い', reason: '', categories: [], pros: [], cons: [], audienceFor: [], audienceAgainst: [] }
  });
  assert.deepEqual(vm.analysis.externalScores, []);
});

test('buildAnalysisViewModel defaults similarGames to an empty array when missing', () => {
  const vm = buildAnalysisViewModel({
    found: { id: '1', name: 'Game' },
    priceDetail: null, reviewSummary: null, gameContext: null, analysis: null
  });
  assert.deepEqual(vm.similarGames, []);
});
