'use strict';
var html = require('../lib/html.js');

// AIの返答には**太字**のようなMarkdown記法が混ざることがあるため、先にエスケープしてから
// (エスケープ後の安全な文字列に対して)**...**だけ<strong>に変換する。innerHTML由来のXSSは発生しない。
function renderMarkdownSafe(text) {
  return html.escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderMessage(m) {
  var roleClass = m.role === 'assistant' ? 'chat-message-assistant' : 'chat-message-user';
  var content = m.role === 'assistant' ? renderMarkdownSafe(m.text) : html.escapeHtml(m.text);
  return '<div class="chat-message ' + roleClass + '">' + content + '</div>';
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
