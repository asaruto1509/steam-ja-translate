'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml } = require('./html.js');

test('escapeHtml escapes html special characters', () => {
  assert.equal(escapeHtml('<script>alert("hi")</script>'), '&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;');
});

test('escapeHtml escapes ampersand and single quote', () => {
  assert.equal(escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
});

test('escapeHtml treats null/undefined as empty string', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml passes through plain text unchanged', () => {
  assert.equal(escapeHtml('Hollow Knight'), 'Hollow Knight');
});
