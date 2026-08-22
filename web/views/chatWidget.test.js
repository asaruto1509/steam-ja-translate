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

test('renderChatWidget renders **bold** markdown as <strong> in assistant messages', () => {
  const html = renderChatWidget(null, [{ role: 'assistant', text: 'これは**重要**な情報です' }]);
  assert.match(html, /これは<strong>重要<\/strong>な情報です/);
});

test('renderChatWidget does not interpret markdown in user messages', () => {
  const html = renderChatWidget(null, [{ role: 'user', text: 'これは**重要**な情報です' }]);
  assert.match(html, /これは\*\*重要\*\*な情報です/);
});

test('renderChatWidget escapes HTML in assistant messages even with bold markdown present', () => {
  const html = renderChatWidget(null, [{ role: 'assistant', text: '**<script>alert(1)</script>**' }]);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /<strong>&lt;script&gt;/);
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
