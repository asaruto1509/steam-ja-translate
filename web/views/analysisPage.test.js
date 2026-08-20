'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderAnalysisPage } = require('./analysisPage.js');

test('renderAnalysisPage shows a not-found message', () => {
  const html = renderAnalysisPage({ notFound: true });
  assert.match(html, /見つからなかった/);
});

test('renderAnalysisPage shows the game name, price, and review summary', () => {
  const html = renderAnalysisPage({
    notFound: false,
    name: 'Hollow Knight',
    appid: '367520',
    priceHtml: '¥1,500',
    reviewSummaryText: '96% (10,000件)',
    genres: ['アクション'],
    categories: [],
    analysis: null
  });
  assert.match(html, /Hollow Knight/);
  assert.match(html, /¥1,500/);
  assert.match(html, /96% \(10,000件\)/);
  assert.match(html, /アクション/);
});

test('renderAnalysisPage shows an unavailable message when analysis is null', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null
  });
  assert.match(html, /AI分析は利用できませんでした/);
});

test('renderAnalysisPage renders verdict, category stars, pros, and cons', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [],
    analysis: {
      verdict: '買い',
      reason: '面白い',
      categoryLines: [{ name: 'ゲームプレイ', stars: '★★★★☆' }],
      pros: ['操作感が良い'],
      cons: ['ボリューム不足'],
      audienceFor: ['アクション好き'],
      audienceAgainst: []
    }
  });
  assert.match(html, /買い/);
  assert.match(html, /★★★★☆/);
  assert.match(html, /操作感が良い/);
  assert.match(html, /ボリューム不足/);
  assert.match(html, /アクション好き/);
});

test('renderAnalysisPage escapes the game name', () => {
  const html = renderAnalysisPage({
    notFound: false, name: '<script>alert(1)</script>', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null
  });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
