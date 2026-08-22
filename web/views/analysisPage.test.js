'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderAnalysisPage } = require('./analysisPage.js');
const steamLib = require('../../bot/lib/steam.js');

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
      categoryLines: [{ name: 'ゲームプレイ', stars: '★★★★☆', starCount: 4 }],
      pros: ['操作感が良い'],
      cons: ['ボリューム不足'],
      audienceFor: ['アクション好き'],
      audienceAgainst: []
    }
  });
  assert.match(html, /買い/);
  assert.match(html, /4\/5/);
  assert.match(html, /操作感が良い/);
  assert.match(html, /ボリューム不足/);
  assert.match(html, /アクション好き/);
});

test('renderAnalysisPage links the game name to the store page and shows the header image', () => {
  const html = renderAnalysisPage({
    notFound: false,
    name: 'Hollow Knight',
    appid: '367520',
    priceHtml: '¥1,500',
    reviewSummaryText: '96% (10,000件)',
    genres: [],
    categories: [],
    analysis: null
  });
  assert.match(html, new RegExp('href="' + steamLib.storeUrl('367520').replace(/\//g, '\\/') + '"'));
  assert.match(html, new RegExp('src="' + steamLib.headerImageUrl('367520').replace(/\//g, '\\/') + '"'));
});

test('renderAnalysisPage shows the current player count when present', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: '12,345人', achievementInfo: null
  });
  assert.match(html, /12,345人/);
});

test('renderAnalysisPage omits the player count section when unavailable', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null
  });
  assert.doesNotMatch(html, /class="player-count"/);
});

test('renderAnalysisPage shows achievement stats including the rarest achievement', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null,
    achievementInfo: { count: 50, avgUnlockPct: '23.5', rarestName: 'Secret Ending', rarestPercent: 0.5 }
  });
  assert.match(html, /50/);
  assert.match(html, /23\.5/);
  assert.match(html, /Secret Ending/);
  assert.match(html, /0\.5/);
});

test('renderAnalysisPage omits the achievement section when unavailable', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null
  });
  assert.doesNotMatch(html, /class="achievements"/);
});

test('renderAnalysisPage escapes the rarest achievement name', () => {
  const html = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null,
    achievementInfo: { count: 1, avgUnlockPct: '1.0', rarestName: '<script>alert(1)</script>', rarestPercent: 1 }
  });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('renderAnalysisPage shows an add-to-favorites button when not favorited', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false
  });
  assert.match(result, /action="\/favorites\/add"/);
  assert.doesNotMatch(result, /action="\/favorites\/remove"/);
});

test('renderAnalysisPage shows a remove-from-favorites button when favorited', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: true
  });
  assert.match(result, /action="\/favorites\/remove"/);
  assert.doesNotMatch(result, /action="\/favorites\/add"/);
});

test('renderAnalysisPage includes the appid and name in the favorite form', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Hollow Knight', appid: '367520', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false
  });
  assert.match(result, /name="appid" value="367520"/);
  assert.match(result, /name="name" value="Hollow Knight"/);
});

test('renderAnalysisPage escapes the name in the favorite form', () => {
  const result = renderAnalysisPage({
    notFound: false, name: '<script>alert(1)</script>', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false
  });
  assert.doesNotMatch(result, /<script>alert\(1\)<\/script>/);
});

test('renders a review pie chart when reviewPositivePct is a number', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: 90, similarGames: []
  });
  assert.match(result, /class="review-pie-chart"/);
});

test('omits the review pie chart when reviewPositivePct is not a number', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null, similarGames: []
  });
  assert.doesNotMatch(result, /class="review-pie-chart"/);
});

test('renders a category bar chart instead of a plain list when categories are present', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [],
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null, similarGames: [],
    analysis: {
      verdict: '買い', reason: '', categoryLines: [{ name: 'ゲームプレイ', stars: '★★★★☆', starCount: 4 }],
      pros: [], cons: [], audienceFor: [], audienceAgainst: []
    }
  });
  assert.match(result, /class="category-bar-chart"/);
  assert.doesNotMatch(result, /class="category-stars"/);
});

test('renders a price history chart when price history points exist', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [{ date: '2026-07-01T00:00:00+00:00', price: 1500 }],
    reviewPositivePct: null, similarGames: []
  });
  assert.match(result, /class="price-history"/);
  assert.match(result, /class="price-line-chart"/);
});

test('omits the price history section when there are no price history points', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null, similarGames: []
  });
  assert.doesNotMatch(result, /class="price-history"/);
});

test('renders a similar games comparison table with escaped, linked names', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null,
    similarGames: [{
      name: '<script>alert(1)</script>', appid: '2',
      priceHtml: '¥500', reviewSummaryText: '90% (100件)', playerCountText: '10人'
    }]
  });
  assert.match(result, /class="similar-games"/);
  assert.match(result, /href="\/analyze\?name=%3Cscript%3Ealert\(1\)%3C%2Fscript%3E"/);
  assert.doesNotMatch(result, /<script>alert\(1\)<\/script>/);
  assert.match(result, /90% \(100件\)/);
});

test('omits the similar games section when there are none', () => {
  const result = renderAnalysisPage({
    notFound: false, name: 'Game', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null,
    playerCountText: null, achievementInfo: null, isFavorite: false,
    priceHistoryPoints: [], reviewPositivePct: null, similarGames: []
  });
  assert.doesNotMatch(result, /class="similar-games"/);
});

test('renderAnalysisPage escapes the game name', () => {
  const html = renderAnalysisPage({
    notFound: false, name: '<script>alert(1)</script>', appid: '1', priceHtml: '¥100',
    reviewSummaryText: 'x', genres: [], categories: [], analysis: null
  });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
