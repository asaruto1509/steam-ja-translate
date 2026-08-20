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
  assert.deepEqual(vm.analysis.categoryLines, [{ name: 'ゲームプレイ', stars: '★★★★☆' }]);
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
