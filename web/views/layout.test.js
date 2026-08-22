'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderLayout } = require('./layout.js');

test('renderLayout embeds the body html inside the page', () => {
  const page = renderLayout('<p>hello</p>', {});
  assert.match(page, /<p>hello<\/p>/);
  assert.match(page, /<!doctype html>/i);
});

test('renderLayout includes a search form pointing at /analyze', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /action="\/analyze"/);
  assert.match(page, /name="name"/);
});

test('renderLayout escapes the query value in the search box', () => {
  const page = renderLayout('<p>x</p>', { query: '<script>' });
  assert.doesNotMatch(page, /value="<script>"/);
  assert.match(page, /value="&lt;script&gt;"/);
});

test('renderLayout includes a loading overlay explaining the wait time', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /loading-overlay/);
  assert.match(page, /分析中/);
  assert.match(page, /分程度/);
});

test('renderLayout includes a script that shows the loading overlay on form submit', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /querySelectorAll\("form"\)/);
  assert.match(page, /addEventListener\("submit"/);
  assert.match(page, /classList\.add\("loading"\)/);
});

test('renderLayout includes a search suggestions dropdown wired to the search input', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /id="search-input"/);
  assert.match(page, /id="suggestions-list"/);
  assert.match(page, /\/api\/search-suggestions\?q=/);
});

test('renderLayout keeps the header image responsive on narrow screens', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.header-image\{[^}]*max-width:100%/);
});

test('renderLayout gives search form controls a larger tap target', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /min-height:44px/);
});

test('renderLayout gives the favorite-form button a larger tap target', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.favorite-form button\{[^}]*min-height:44px/);
});

test('renderLayout includes styling for the new chart and comparison-table elements', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.similar-games/);
  assert.match(page, /\.similar-games table\{/);
  assert.match(page, /\.similar-games th,\.similar-games td\{/);
});
