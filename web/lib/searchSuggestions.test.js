'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAiFallbackPrompt, parseTitleList } = require('./searchSuggestions.js');

test('buildAiFallbackPrompt includes the query and asks for a JSON array', () => {
  const prompt = buildAiFallbackPrompt('死にゲー 探索アクション');
  assert.match(prompt, /死にゲー 探索アクション/);
  assert.match(prompt, /JSON配列/);
});

test('parseTitleList extracts a JSON array of titles', () => {
  const titles = parseTitleList('["Hollow Knight","Celeste"]');
  assert.deepEqual(titles, ['Hollow Knight', 'Celeste']);
});

test('parseTitleList extracts the array even with surrounding text', () => {
  const titles = parseTitleList('おすすめは以下です:\n["Hades","Hades II"]\n以上です。');
  assert.deepEqual(titles, ['Hades', 'Hades II']);
});

test('parseTitleList returns an empty array for unparsable text', () => {
  assert.deepEqual(parseTitleList('該当なし'), []);
  assert.deepEqual(parseTitleList(''), []);
  assert.deepEqual(parseTitleList(null), []);
});

test('parseTitleList filters out non-string entries', () => {
  const titles = parseTitleList('[1,"Hades",null,"Celeste"]');
  assert.deepEqual(titles, ['Hades', 'Celeste']);
});
