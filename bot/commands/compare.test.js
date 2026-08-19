'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCompareAnalysisPrompt, formatCompareReply } = require('./compare.js');

test('buildCompareAnalysisPrompt includes both game names and their stats', () => {
  const a = { name: 'Hollow Knight', detail: { finalPrice: 980, originalPrice: 980, discountPercent: 0 }, positivePct: 96 };
  const b = { name: 'Celeste', detail: { finalPrice: 1200, originalPrice: 1200, discountPercent: 0 }, positivePct: 98 };
  const prompt = buildCompareAnalysisPrompt(a, b);
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /Celeste/);
  assert.match(prompt, /980/);
  assert.match(prompt, /98/);
});

test('buildCompareAnalysisPrompt describes price as unknown rather than free when the detail is missing', () => {
  const a = { name: 'Hollow Knight', detail: null, positivePct: null };
  const b = { name: 'Celeste', detail: { finalPrice: 1200, originalPrice: 1200, discountPercent: 0 }, positivePct: 98 };
  const prompt = buildCompareAnalysisPrompt(a, b);
  assert.match(prompt, /価格情報なし/);
  assert.doesNotMatch(prompt, /価格¥0/);
});

test('formatCompareReply shows both games side by side with the AI summary', () => {
  const a = { id: '1', name: 'Hollow Knight', detail: { finalPrice: 980, originalPrice: 980, discountPercent: 0 }, positivePct: 96 };
  const b = { id: '2', name: 'Celeste', detail: { finalPrice: 1200, originalPrice: 1500, discountPercent: 20 }, positivePct: 98 };
  const reply = formatCompareReply(a, b, 'どちらも良作。探索好きならHollow Knight、精密な操作を求めるならCelesteがおすすめ。');
  assert.equal(reply.embeds[0].title, 'Hollow Knight 🆚 Celeste');
  const fieldNames = reply.embeds[0].fields.map(f => f.name);
  assert.ok(fieldNames.some(n => n.includes('Hollow Knight')));
  assert.ok(fieldNames.some(n => n.includes('Celeste')));
  assert.match(reply.embeds[0].description, /探索好き/);
});

test('formatCompareReply shows a price-unavailable message instead of 無料 when the detail is missing', () => {
  const a = { id: '1', name: 'Hollow Knight', detail: null, positivePct: null };
  const b = { id: '2', name: 'Celeste', detail: { finalPrice: 1200, originalPrice: 1200, discountPercent: 0 }, positivePct: 98 };
  const reply = formatCompareReply(a, b, 'コメント');
  const fieldA = reply.embeds[0].fields.find(f => f.name.includes('Hollow Knight'));
  assert.match(fieldA.value, /価格情報なし/);
  assert.doesNotMatch(fieldA.value, /無料/);
});

test('formatCompareReply returns a not-found message when a game is missing', () => {
  const reply = formatCompareReply(null, { id: '2', name: 'Celeste' }, null, 'Unknown Game');
  assert.match(reply.content, /見つからなかった/);
});
