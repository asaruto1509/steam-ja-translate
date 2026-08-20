'use strict';
var html = require('../lib/html.js');

function renderAnalysisPage(vm) {
  if (vm.notFound) {
    return '<p class="not-found">見つからなかった…</p>';
  }

  var parts = [];
  parts.push('<article class="game-card">');
  parts.push('<h2>' + html.escapeHtml(vm.name) + '</h2>');
  parts.push('<p class="price">💴 ' + vm.priceHtml + '</p>');
  parts.push('<p class="reviews">💬 ' + html.escapeHtml(vm.reviewSummaryText) + '</p>');

  var tags = vm.genres.concat(vm.categories);
  if (tags.length) {
    parts.push('<p class="tags">🏷️ ' + html.escapeHtml(tags.join(', ')) + '</p>');
  }

  if (vm.analysis) {
    var a = vm.analysis;
    parts.push('<section class="analysis">');
    parts.push('<h3>' + html.escapeHtml(a.verdict) + '</h3>');
    if (a.reason) parts.push('<p>' + html.escapeHtml(a.reason) + '</p>');
    if (a.categoryLines.length) {
      parts.push('<ul class="category-stars">' + a.categoryLines.map(function (c) {
        return '<li>' + html.escapeHtml(c.name) + ' ' + c.stars + '</li>';
      }).join('') + '</ul>');
    }
    if (a.pros.length) {
      parts.push('<div class="pros"><h4>✓ 良い点</h4><ul>' + a.pros.map(function (p) {
        return '<li>' + html.escapeHtml(p) + '</li>';
      }).join('') + '</ul></div>');
    }
    if (a.cons.length) {
      parts.push('<div class="cons"><h4>✗ 悪い点</h4><ul>' + a.cons.map(function (c) {
        return '<li>' + html.escapeHtml(c) + '</li>';
      }).join('') + '</ul></div>');
    }
    if (a.audienceFor.length) parts.push('<p>👍 ' + html.escapeHtml(a.audienceFor.join(', ')) + '</p>');
    if (a.audienceAgainst.length) parts.push('<p>👎 ' + html.escapeHtml(a.audienceAgainst.join(', ')) + '</p>');
    parts.push('</section>');
  } else {
    parts.push('<p class="analysis-unavailable">AI分析は利用できませんでした</p>');
  }

  parts.push('</article>');
  return parts.join('');
}

module.exports = { renderAnalysisPage: renderAnalysisPage };
