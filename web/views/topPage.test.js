'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTopPage } = require('./topPage.js');

test('renderTopPage shows an empty-history message when history is empty', () => {
  const page = renderTopPage({ history: [], favorites: [] });
  assert.match(page, /検索するとここに履歴が表示されます/);
});

test('renderTopPage shows an empty-favorites message when favorites is empty', () => {
  const page = renderTopPage({ history: [], favorites: [] });
  assert.match(page, /まだお気に入りはありません/);
});

test('renderTopPage lists history entries as links to /analyze with the name in the query string', () => {
  const page = renderTopPage({ history: [{ appid: '1', name: 'Hollow Knight' }], favorites: [] });
  assert.match(page, /href="\/analyze\?name=Hollow%20Knight"/);
  assert.match(page, /Hollow Knight/);
});

test('renderTopPage lists favorite entries as links to /analyze', () => {
  const page = renderTopPage({ history: [], favorites: [{ appid: '2', name: 'Celeste' }] });
  assert.match(page, /href="\/analyze\?name=Celeste"/);
  assert.match(page, /Celeste/);
});

test('renderTopPage escapes game names', () => {
  const page = renderTopPage({ history: [{ appid: '1', name: '<script>alert(1)</script>' }], favorites: [] });
  assert.doesNotMatch(page, /<script>alert\(1\)<\/script>/);
});

test('renderTopPage handles a missing history/favorites input without throwing', () => {
  assert.doesNotThrow(() => renderTopPage({}));
  assert.doesNotThrow(() => renderTopPage());
});
