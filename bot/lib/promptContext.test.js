'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContextLine } = require('./promptContext.js');

test('buildContextLine includes genres and categories when present', () => {
  const line = buildContextLine({ genres: ['アクション', 'RPG'], categories: ['シングルプレイヤー'] });
  assert.match(line, /アクション/);
  assert.match(line, /シングルプレイヤー/);
});

test('buildContextLine returns an empty string when there is no context', () => {
  assert.equal(buildContextLine(null), '');
  assert.equal(buildContextLine({ genres: [], categories: [] }), '');
});
