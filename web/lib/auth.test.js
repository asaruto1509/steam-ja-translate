'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCredentials } = require('./auth.js');

test('checkCredentials returns true when user and pass match', () => {
  assert.equal(checkCredentials('raito', 'himitsu', 'raito', 'himitsu'), true);
});

test('checkCredentials returns false when password does not match', () => {
  assert.equal(checkCredentials('raito', 'wrong', 'raito', 'himitsu'), false);
});

test('checkCredentials returns false when user does not match', () => {
  assert.equal(checkCredentials('other', 'himitsu', 'raito', 'himitsu'), false);
});

test('checkCredentials returns false when given non-string input', () => {
  assert.equal(checkCredentials(undefined, undefined, 'raito', 'himitsu'), false);
});
