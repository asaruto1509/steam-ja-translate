'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderRoulettePage } = require('./roulettePage.js');

test('renderRoulettePage includes the given title', () => {
  const html = renderRoulettePage({ title: '積みゲールーレット', spinEndpoint: '/api/roulette/backlog/spin' });
  assert.match(html, /積みゲールーレット/);
});

test('renderRoulettePage sets data-spin-endpoint to the given endpoint', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/roulette/backlog/spin' });
  assert.match(html, /data-spin-endpoint="\/api\/roulette\/backlog\/spin"/);
});

test('renderRoulettePage includes three reels, markers, spin button, and result/error areas', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/y' });
  assert.equal((html.match(/class="roulette-reel"/g) || []).length, 3);
  assert.equal((html.match(/class="roulette-marker"/g) || []).length, 3);
  assert.match(html, /class="roulette-spin-btn"/);
  assert.match(html, /id="roulette-result"/);
  assert.match(html, /id="roulette-error"/);
});

test('renderRoulettePage includes a decorative lever handle beside the reel', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/y' });
  assert.match(html, /class="roulette-lever"/);
  assert.match(html, /class="roulette-lever-knob"/);
});

test('renderRoulettePage escapes the title', () => {
  const html = renderRoulettePage({ title: '<script>alert(1)</script>', spinEndpoint: '/api/y' });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('renderRoulettePage uses a default back-link text when not provided', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/y' });
  assert.match(html, /トップに戻る/);
});

test('renderRoulettePage uses a custom back-link text when provided', () => {
  const html = renderRoulettePage({ title: 'x', spinEndpoint: '/api/y', backLinkText: '一覧へ' });
  assert.match(html, /一覧へ/);
  assert.doesNotMatch(html, /トップに戻る/);
});
