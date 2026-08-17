'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatReviewReply } = require('./review.js');

test('formatReviewReply shows the verdict with its emoji', () => {
  const reply = formatReviewReply('Great Game', '買い');
  assert.match(reply.embeds[0].description, /✅/);
  assert.match(reply.embeds[0].description, /買い/);
  assert.equal(reply.embeds[0].title, 'Great Game');
});

test('formatReviewReply returns a not-found message when verdict is null', () => {
  const reply = formatReviewReply('Unknown Game', null);
  assert.match(reply.content, /見つからなかった/);
});
