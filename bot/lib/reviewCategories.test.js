'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORY_NAMES, buildCategorySchema } = require('./reviewCategories.js');

test('CATEGORY_NAMES has no duplicate entries', () => {
  assert.equal(new Set(CATEGORY_NAMES).size, CATEGORY_NAMES.length);
});

test('buildCategorySchema includes every category name as a JSON schema entry', () => {
  const schema = buildCategorySchema();
  CATEGORY_NAMES.forEach((name) => {
    assert.match(schema, new RegExp('"name":"' + name + '"'));
  });
});

test('buildCategorySchema produces one comma-separated entry per category', () => {
  const schema = buildCategorySchema();
  assert.equal(schema.split('},{').length, CATEGORY_NAMES.length);
});
