'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatGameChoices } = require('./autocomplete.js');

test('formatGameChoices maps items to name/value choice pairs', () => {
  const choices = formatGameChoices([{ id: '1', name: 'Hollow Knight' }, { id: '2', name: 'Celeste' }]);
  assert.deepEqual(choices, [
    { name: 'Hollow Knight', value: 'Hollow Knight' },
    { name: 'Celeste', value: 'Celeste' }
  ]);
});

test('formatGameChoices caps the result at 25 choices', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: 'Game ' + i }));
  const choices = formatGameChoices(items);
  assert.equal(choices.length, 25);
});

test('formatGameChoices truncates names longer than 100 characters', () => {
  const longName = 'あ'.repeat(150);
  const choices = formatGameChoices([{ id: '1', name: longName }]);
  assert.ok(choices[0].name.length <= 100);
  assert.ok(choices[0].value.length <= 100);
});

test('formatGameChoices returns an empty array for no items', () => {
  assert.deepEqual(formatGameChoices([]), []);
  assert.deepEqual(formatGameChoices(null), []);
});
