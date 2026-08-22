'use strict';
var html = require('../lib/html.js');

function renderMessage(m) {
  var roleClass = m.role === 'assistant' ? 'chat-message-assistant' : 'chat-message-user';
  return '<div class="chat-message ' + roleClass + '">' + html.escapeHtml(m.text) + '</div>';
}

function renderChatWidget(scope, messages) {
  messages = messages || [];
  var scopeAttr = html.escapeHtml(scope == null ? '' : scope);
  var body = messages.length
    ? messages.map(renderMessage).join('')
    : '<p class="empty">まだ会話がありません。</p>';
  return '<section class="chat-widget" data-scope="' + scopeAttr + '">'
    + '<div class="chat-messages">' + body + '</div>'
    + '<form class="chat-form">'
    + '<input type="text" class="chat-input" placeholder="メッセージを入力" required>'
    + '<button type="submit">送信</button>'
    + '</form>'
    + '<button type="button" class="chat-clear">会話をクリア</button>'
    + '</section>';
}

module.exports = { renderChatWidget: renderChatWidget };
