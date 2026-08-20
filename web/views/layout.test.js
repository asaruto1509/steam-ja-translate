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
