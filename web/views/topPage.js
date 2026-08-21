'use strict';
var html = require('../lib/html.js');

function renderEntryLink(entry) {
  return '<li><a href="/analyze?name=' + encodeURIComponent(entry.name) + '">'
    + html.escapeHtml(entry.name) + '</a></li>';
}

function renderTopPage(data) {
  data = data || {};
  var history = data.history || [];
  var favorites = data.favorites || [];
  var parts = [];

  parts.push('<section class="favorites">');
  parts.push('<h2>★ お気に入り</h2>');
  if (favorites.length) {
    parts.push('<ul>' + favorites.map(renderEntryLink).join('') + '</ul>');
  } else {
    parts.push('<p class="empty">まだお気に入りはありません。</p>');
  }
  parts.push('</section>');

  parts.push('<section class="history">');
  parts.push('<h2>最近検索したゲーム</h2>');
  if (history.length) {
    parts.push('<ul>' + history.map(renderEntryLink).join('') + '</ul>');
  } else {
    parts.push('<p class="empty">検索するとここに履歴が表示されます。</p>');
  }
  parts.push('</section>');

  return parts.join('');
}

module.exports = { renderTopPage: renderTopPage };
