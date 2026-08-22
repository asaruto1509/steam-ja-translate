'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderChatWidget } = require('./chatWidget.js');

test('renderChatWidget shows an empty-state message when there are no messages', () => {
  const html = renderChatWidget(null, []);
  assert.match(html, /まだ会話がありません/);
});

test('renderChatWidget renders user and assistant messages with distinct classes', () => {
  const html = renderChatWidget(null, [
    { role: 'user', text: 'こんにちは' },
    { role: 'assistant', text: 'やあ' }
  ]);
  assert.match(html, /class="chat-message chat-message-user">こんにちは/);
  assert.match(html, /class="chat-message chat-message-assistant">やあ/);
});

test('renderChatWidget escapes message text', () => {
  const html = renderChatWidget(null, [{ role: 'user', text: '<script>alert(1)</script>' }]);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('renderChatWidget sets data-scope to the given appid', () => {
  const html = renderChatWidget('367520', []);
  assert.match(html, /data-scope="367520"/);
});

test('renderChatWidget sets an empty data-scope when scope is null', () => {
  const html = renderChatWidget(null, []);
  assert.match(html, /data-scope=""/);
});

test('renderChatWidget includes a form and a clear button', () => {
  const html = renderChatWidget(null, []);
  assert.match(html, /class="chat-form"/);
  assert.match(html, /class="chat-clear"/);
});
