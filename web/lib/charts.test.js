'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderCategoryBarChart, renderReviewPieChart, renderPriceLineChart, renderAchievementDistributionChart } = require('./charts.js');

test('renderCategoryBarChart returns an empty string for an empty list', () => {
  assert.equal(renderCategoryBarChart([]), '');
});

test('renderCategoryBarChart draws a background bar and a filled bar per category', () => {
  const svg = renderCategoryBarChart([
    { name: 'ゲームプレイ', starCount: 4 },
    { name: 'ストーリー', starCount: 2 }
  ]);
  const rectCount = (svg.match(/<rect/g) || []).length;
  assert.equal(rectCount, 4);
  assert.match(svg, /ゲームプレイ/);
  assert.match(svg, /ストーリー/);
  assert.match(svg, /<svg/);
});

test('renderCategoryBarChart clamps out-of-range or missing starCount into 0-5', () => {
  const svg = renderCategoryBarChart([{ name: 'X', starCount: 99 }, { name: 'Y', starCount: null }]);
  assert.match(svg, />5\/5</);
  assert.match(svg, />0\/5</);
});

test('renderCategoryBarChart escapes category names', () => {
  const svg = renderCategoryBarChart([{ name: '<script>alert(1)</script>', starCount: 3 }]);
  assert.doesNotMatch(svg, /<script>alert\(1\)<\/script>/);
});

test('renderReviewPieChart returns an empty string when the percentage is not a number', () => {
  assert.equal(renderReviewPieChart(null), '');
  assert.equal(renderReviewPieChart(undefined), '');
  assert.equal(renderReviewPieChart(NaN), '');
});

test('renderReviewPieChart shows the rounded percentage label', () => {
  const svg = renderReviewPieChart(96.4);
  assert.match(svg, />96%</);
});

test('renderReviewPieChart clamps percentages above 100 or below 0', () => {
  assert.match(renderReviewPieChart(150), />100%</);
  assert.match(renderReviewPieChart(-10), />0%</);
});

test('renderPriceLineChart returns an empty string when there is no data', () => {
  assert.equal(renderPriceLineChart([]), '');
  assert.equal(renderPriceLineChart(null), '');
});

test('renderPriceLineChart draws a single point without a polyline when only one sample exists', () => {
  const svg = renderPriceLineChart([{ date: '2026-07-01T00:00:00+00:00', price: 1500 }]);
  assert.match(svg, /<circle/);
  assert.doesNotMatch(svg, /<polyline/);
});

test('renderPriceLineChart draws a polyline with one point per sample when there are multiple samples', () => {
  const svg = renderPriceLineChart([
    { date: '2026-05-01T00:00:00+00:00', price: 1000 },
    { date: '2026-06-01T00:00:00+00:00', price: 2000 },
    { date: '2026-07-01T00:00:00+00:00', price: 1500 }
  ]);
  const circleCount = (svg.match(/<circle/g) || []).length;
  assert.equal(circleCount, 3);
  assert.match(svg, /<polyline/);
});

test('renderAchievementDistributionChart returns an empty string for an empty list', () => {
  assert.equal(renderAchievementDistributionChart([]), '');
  assert.equal(renderAchievementDistributionChart(null), '');
});

test('renderAchievementDistributionChart draws a background bar and a filled bar per bucket', () => {
  const svg = renderAchievementDistributionChart([
    { label: '0-20%', count: 3 },
    { label: '20-40%', count: 1 }
  ]);
  const rectCount = (svg.match(/<rect/g) || []).length;
  assert.equal(rectCount, 4);
  assert.match(svg, /0-20%/);
  assert.match(svg, />3</);
});

test('renderAchievementDistributionChart scales bars relative to the largest bucket', () => {
  const svg = renderAchievementDistributionChart([
    { label: '0-20%', count: 10 },
    { label: '20-40%', count: 0 }
  ]);
  const barWidths = [...svg.matchAll(/width="([\d.]+)" height="16" fill="#e0a952"/g)].map((m) => parseFloat(m[1]));
  assert.equal(barWidths[0], 150);
  assert.equal(barWidths[1], 0);
});

test('renderPriceLineChart sorts points chronologically regardless of input order', () => {
  const svg = renderPriceLineChart([
    { date: '2026-07-01T00:00:00+00:00', price: 2000 },
    { date: '2026-05-01T00:00:00+00:00', price: 1000 }
  ]);
  const cxValues = [...svg.matchAll(/cx="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
  assert.equal(cxValues.length, 2);
  assert.ok(cxValues[0] < cxValues[1]);
});
