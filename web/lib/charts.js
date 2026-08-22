'use strict';
var html = require('./html.js');

function renderCategoryBarChart(categoryLines) {
  if (!Array.isArray(categoryLines) || !categoryLines.length) return '';
  var rowHeight = 24;
  var maxBarWidth = 150;
  var labelWidth = 90;
  var width = labelWidth + maxBarWidth + 40;
  var height = categoryLines.length * rowHeight;
  var rows = categoryLines.map(function (c, i) {
    var raw = typeof c.starCount === 'number' ? c.starCount : 0;
    var n = Math.max(0, Math.min(5, raw));
    var barWidth = (n / 5) * maxBarWidth;
    var y = i * rowHeight;
    var name = html.escapeHtml(c.name);
    return '<text x="0" y="' + (y + rowHeight / 2 + 4) + '" font-size="12" fill="#c7d5e0">' + name + '</text>'
      + '<rect x="' + labelWidth + '" y="' + (y + 4) + '" width="' + maxBarWidth + '" height="' + (rowHeight - 8) + '" fill="#2a3f5a"></rect>'
      + '<rect x="' + labelWidth + '" y="' + (y + 4) + '" width="' + barWidth + '" height="' + (rowHeight - 8) + '" fill="#66c0f4"></rect>'
      + '<text x="' + (labelWidth + maxBarWidth + 8) + '" y="' + (y + rowHeight / 2 + 4) + '" font-size="12" fill="#c7d5e0">' + n + '/5</text>';
  }).join('');
  return '<svg class="category-bar-chart" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' + rows + '</svg>';
}

function renderReviewPieChart(positivePct) {
  if (typeof positivePct !== 'number' || isNaN(positivePct)) return '';
  var pct = Math.max(0, Math.min(100, positivePct));
  var radius = 40;
  var circumference = 2 * Math.PI * radius;
  var positiveLength = (pct / 100) * circumference;
  var negativeLength = circumference - positiveLength;
  var size = (radius + 10) * 2;
  var center = size / 2;
  return '<svg class="review-pie-chart" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">'
    + '<circle cx="' + center + '" cy="' + center + '" r="' + radius + '" fill="none" stroke="#e05252" stroke-width="16"></circle>'
    + '<circle cx="' + center + '" cy="' + center + '" r="' + radius + '" fill="none" stroke="#7fbb4a" stroke-width="16" '
    + 'stroke-dasharray="' + positiveLength + ' ' + negativeLength + '" transform="rotate(-90 ' + center + ' ' + center + ')"></circle>'
    + '<text x="' + center + '" y="' + (center + 5) + '" font-size="16" fill="#c7d5e0" text-anchor="middle">' + Math.round(pct) + '%</text>'
    + '</svg>';
}

function renderPriceLineChart(pricePoints) {
  if (!Array.isArray(pricePoints) || !pricePoints.length) return '';
  var points = pricePoints.slice().sort(function (a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  var width = 280;
  var height = 100;
  var padding = 20;
  var prices = points.map(function (p) { return p.price; });
  var minPrice = Math.min.apply(null, prices);
  var maxPrice = Math.max.apply(null, prices);
  var range = maxPrice - minPrice || 1;

  function xAt(i) {
    return points.length === 1 ? width / 2 : padding + (i / (points.length - 1)) * (width - padding * 2);
  }
  function yAt(price) {
    return height - padding - ((price - minPrice) / range) * (height - padding * 2);
  }

  var circles = points.map(function (p, i) {
    return '<circle cx="' + xAt(i) + '" cy="' + yAt(p.price) + '" r="3" fill="#66c0f4"></circle>';
  }).join('');

  var polyline = '';
  if (points.length > 1) {
    var coords = points.map(function (p, i) { return xAt(i) + ',' + yAt(p.price); }).join(' ');
    polyline = '<polyline points="' + coords + '" fill="none" stroke="#66c0f4" stroke-width="2"></polyline>';
  }

  return '<svg class="price-line-chart" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
    + polyline + circles + '</svg>';
}

module.exports = {
  renderCategoryBarChart: renderCategoryBarChart,
  renderReviewPieChart: renderReviewPieChart,
  renderPriceLineChart: renderPriceLineChart
};
