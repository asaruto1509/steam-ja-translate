'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyHistoryEntry, applyFavoriteAdd, applyFavoriteRemove, isFavorited } = require('./store.js');

test('applyHistoryEntry adds a new entry to the front', () => {
  const result = applyHistoryEntry([], { appid: '1', name: 'Game A' }, 30);
  assert.deepEqual(result, [{ appid: '1', name: 'Game A' }]);
});

test('applyHistoryEntry moves a re-searched game to the front instead of duplicating', () => {
  const history = [{ appid: '2', name: 'Game B' }, { appid: '1', name: 'Game A' }];
  const result = applyHistoryEntry(history, { appid: '1', name: 'Game A' }, 30);
  assert.deepEqual(result, [{ appid: '1', name: 'Game A' }, { appid: '2', name: 'Game B' }]);
});

test('applyHistoryEntry truncates to maxSize', () => {
  const history = [{ appid: '2', name: 'B' }, { appid: '3', name: 'C' }];
  const result = applyHistoryEntry(history, { appid: '1', name: 'A' }, 2);
  assert.deepEqual(result, [{ appid: '1', name: 'A' }, { appid: '2', name: 'B' }]);
});

test('applyFavoriteAdd appends a new favorite', () => {
  const result = applyFavoriteAdd([], { appid: '1', name: 'Game A' });
  assert.deepEqual(result, [{ appid: '1', name: 'Game A' }]);
});

test('applyFavoriteAdd does not duplicate an already-favorited appid', () => {
  const favorites = [{ appid: '1', name: 'Game A' }];
  const result = applyFavoriteAdd(favorites, { appid: '1', name: 'Game A (dup)' });
  assert.deepEqual(result, [{ appid: '1', name: 'Game A' }]);
});

test('applyFavoriteRemove removes the matching appid', () => {
  const favorites = [{ appid: '1', name: 'Game A' }, { appid: '2', name: 'Game B' }];
  const result = applyFavoriteRemove(favorites, '1');
  assert.deepEqual(result, [{ appid: '2', name: 'Game B' }]);
});

test('applyFavoriteRemove leaves the array unchanged when appid is not present', () => {
  const favorites = [{ appid: '1', name: 'Game A' }];
  const result = applyFavoriteRemove(favorites, '999');
  assert.deepEqual(result, favorites);
});

test('isFavorited returns true when the appid is in the list', () => {
  assert.equal(isFavorited([{ appid: '1', name: 'Game A' }], '1'), true);
});

test('isFavorited returns false when the appid is not in the list', () => {
  assert.equal(isFavorited([{ appid: '1', name: 'Game A' }], '2'), false);
});

test('isFavorited returns false for an empty list', () => {
  assert.equal(isFavorited([], '1'), false);
});
