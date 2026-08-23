'use strict';
var html = require('../lib/html.js');

function renderRoulettePage(opts) {
  opts = opts || {};
  var title = html.escapeHtml(opts.title || '');
  var spinEndpoint = html.escapeHtml(opts.spinEndpoint || '');
  var backLinkText = html.escapeHtml(opts.backLinkText || 'トップに戻る');
  var reelsHtml = [0, 1, 2].map(function () {
    return '<div class="roulette-reel-wrap">'
      + '<div class="roulette-reel"></div>'
      + '<div class="roulette-marker"></div>'
      + '</div>';
  }).join('');
  return '<section class="roulette-page" data-spin-endpoint="' + spinEndpoint + '">'
    + '<h2>' + title + '</h2>'
    + '<div class="roulette-machine">'
    + '<div class="roulette-reels">' + reelsHtml + '</div>'
    + '<div class="roulette-lever" aria-hidden="true">'
    + '<div class="roulette-lever-track"></div>'
    + '<div class="roulette-lever-knob"></div>'
    + '<div class="roulette-lever-base"></div>'
    + '</div>'
    + '</div>'
    + '<button type="button" class="roulette-spin-btn">🎰 回す</button>'
    + '<div class="roulette-result" id="roulette-result"></div>'
    + '<p class="roulette-error" id="roulette-error"></p>'
    + '<p><a href="/">' + backLinkText + '</a></p>'
    + '</section>';
}

module.exports = { renderRoulettePage: renderRoulettePage };
