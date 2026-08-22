'use strict';
var html = require('../lib/html.js');
var steamLib = require('../../bot/lib/steam.js');
var charts = require('../lib/charts.js');

function renderAnalysisPage(vm) {
  if (vm.notFound) {
    return '<p class="not-found">見つからなかった…</p>';
  }

  var storeUrl = html.escapeHtml(steamLib.storeUrl(vm.appid));
  var headerImageUrl = html.escapeHtml(steamLib.headerImageUrl(vm.appid));

  var parts = [];
  parts.push('<article class="game-card">');
  parts.push('<img class="header-image" src="' + headerImageUrl + '" alt="">');
  parts.push('<h2><a href="' + storeUrl + '">' + html.escapeHtml(vm.name) + '</a></h2>');
  if (vm.isFavorite) {
    parts.push('<form method="POST" action="/favorites/remove" class="favorite-form">'
      + '<input type="hidden" name="appid" value="' + html.escapeHtml(vm.appid) + '">'
      + '<input type="hidden" name="name" value="' + html.escapeHtml(vm.name) + '">'
      + '<button type="submit">★ お気に入り解除</button></form>');
  } else {
    parts.push('<form method="POST" action="/favorites/add" class="favorite-form">'
      + '<input type="hidden" name="appid" value="' + html.escapeHtml(vm.appid) + '">'
      + '<input type="hidden" name="name" value="' + html.escapeHtml(vm.name) + '">'
      + '<button type="submit">☆ お気に入りに追加</button></form>');
  }
  parts.push('<p class="price">💴 ' + vm.priceHtml + '</p>');
  parts.push('<p class="reviews">💬 ' + html.escapeHtml(vm.reviewSummaryText) + '</p>');
  if (typeof vm.reviewPositivePct === 'number') {
    parts.push('<div class="review-chart">' + charts.renderReviewPieChart(vm.reviewPositivePct) + '</div>');
  }

  var tags = vm.genres.concat(vm.categories);
  if (tags.length) {
    parts.push('<p class="tags">🏷️ ' + html.escapeHtml(tags.join(', ')) + '</p>');
  }

  if (vm.playerCountText) {
    parts.push('<p class="player-count">👥 現在 ' + html.escapeHtml(vm.playerCountText) + ' プレイ中</p>');
  }

  if (vm.achievementInfo) {
    var ai = vm.achievementInfo;
    var achievementLine = '🏆 実績' + ai.count + '個・平均達成率' + html.escapeHtml(ai.avgUnlockPct) + '%';
    if (ai.rarestName) {
      achievementLine += '(最レア: ' + html.escapeHtml(ai.rarestName) + ' ' + html.escapeHtml(ai.rarestPercent) + '%)';
    }
    parts.push('<p class="achievements">' + achievementLine + '</p>');
    if (ai.distribution && ai.distribution.length) {
      parts.push('<section class="achievement-distribution"><h3>実績達成率の分布</h3>'
        + charts.renderAchievementDistributionChart(ai.distribution) + '</section>');
    }
  }

  if (vm.priceHistoryPoints && vm.priceHistoryPoints.length) {
    parts.push('<section class="price-history"><h3>価格推移</h3>' + charts.renderPriceLineChart(vm.priceHistoryPoints) + '</section>');
  }

  if (vm.playerCountHistoryPoints && vm.playerCountHistoryPoints.length) {
    parts.push('<section class="player-count-history"><h3>プレイヤー数推移</h3>' + charts.renderPlayerCountChart(vm.playerCountHistoryPoints) + '</section>');
  }

  if (vm.sentimentHistoryPoints && vm.sentimentHistoryPoints.length) {
    parts.push('<section class="sentiment-history"><h3>評判の推移</h3>' + charts.renderSentimentChart(vm.sentimentHistoryPoints) + '</section>');
  }

  if (vm.analysis) {
    var a = vm.analysis;
    parts.push('<section class="analysis">');
    parts.push('<h3>' + html.escapeHtml(a.verdict) + '</h3>');
    if (a.reason) parts.push('<p>' + html.escapeHtml(a.reason) + '</p>');
    if (a.categoryLines.length) {
      parts.push('<div class="category-bar-chart-wrap">' + charts.renderCategoryBarChart(a.categoryLines) + '</div>');
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
    if (a.externalScores && a.externalScores.length) {
      parts.push('<div class="external-scores"><h4>🌐 外部評価</h4><ul>' + a.externalScores.map(function (s) {
        return '<li>' + html.escapeHtml(s.source) + ': ' + html.escapeHtml(s.score) + '</li>';
      }).join('') + '</ul></div>');
    }
    parts.push('</section>');
  } else {
    parts.push('<p class="analysis-unavailable">AI分析は利用できませんでした</p>');
  }

  if (vm.similarGames && vm.similarGames.length) {
    parts.push('<section class="similar-games"><h3>類似ゲーム比較</h3><table><thead><tr><th>ゲーム</th><th>価格</th><th>評価</th><th>プレイヤー数</th></tr></thead><tbody>'
      + vm.similarGames.map(function (g) {
        return '<tr><td><a href="/analyze?name=' + encodeURIComponent(g.name) + '">' + html.escapeHtml(g.name) + '</a></td>'
          + '<td>' + g.priceHtml + '</td>'
          + '<td>' + html.escapeHtml(g.reviewSummaryText) + '</td>'
          + '<td>' + html.escapeHtml(g.playerCountText || '不明') + '</td></tr>';
      }).join('')
      + '</tbody></table></section>');
  }

  parts.push('</article>');
  return parts.join('');
}

module.exports = { renderAnalysisPage: renderAnalysisPage };
