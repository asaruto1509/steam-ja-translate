'use strict';
var html = require('../lib/html.js');

// コイン画像: Twemojiの🪙(U+1FA99)SVG。CC-BY 4.0、jsdelivr経由でホットリンク。
// https://github.com/jdecked/twemoji
var COIN_IMG_URL = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1fa99.svg';

function bulbsHtml(count, stepMs) {
  var out = '';
  for (var i = 0; i < count; i++) {
    out += '<span class="roulette-bulb" style="animation-delay:' + (i * stepMs) + 'ms"></span>';
  }
  return out;
}

function renderRoulettePage(opts) {
  opts = opts || {};
  var title = html.escapeHtml(opts.title || '');
  var spinEndpoint = html.escapeHtml(opts.spinEndpoint || '');
  var backLinkText = html.escapeHtml(opts.backLinkText || 'トップに戻る');
  var reelsHtml = [0, 1, 2].map(function () {
    return '<div class="roulette-reel-slot">'
      + '<div class="roulette-bulbs">' + bulbsHtml(6, 150) + '</div>'
      + '<div class="roulette-reel-wrap">'
      + '<div class="roulette-reel"></div>'
      + '<div class="roulette-marker"></div>'
      + '</div>'
      + '</div>';
  }).join('');
  return '<section class="roulette-page" data-spin-endpoint="' + spinEndpoint + '">'
    + '<div class="roulette-ambient" aria-hidden="true"></div>'
    + '<div class="roulette-win-flash" id="roulette-win-flash"></div>'
    + '<div class="roulette-miss-dim" id="roulette-miss-dim"></div>'
    + '<div class="roulette-win-overlay" id="roulette-win-overlay">'
    + '<div class="roulette-win-rays"></div>'
    + '<div class="roulette-win-coin-rain" id="roulette-win-coin-rain"></div>'
    + '<div class="roulette-win-overlay-text" id="roulette-win-overlay-text"></div>'
    + '</div>'
    + '<div class="roulette-marquee-top">' + bulbsHtml(16, 90) + '</div>'
    + '<h2>' + title + '</h2>'
    + '<div class="roulette-hud">'
    + '<div class="roulette-credits">🪙 残高: <span id="roulette-credits-value">1000</span></div>'
    + '<div class="roulette-bet">BET: <span id="roulette-bet-value">15</span></div>'
    + '<div class="roulette-jackpot-hud">💎 JP: <span id="roulette-jackpot-value">500</span></div>'
    + '<div class="roulette-level-badge" id="roulette-level-badge"></div>'
    + '</div>'
    + '<div class="roulette-bet-levels">'
    + '<button type="button" class="roulette-bet-level-btn" data-bet="low">控えめ(10)</button>'
    + '<button type="button" class="roulette-bet-level-btn" data-bet="normal">通常(15)</button>'
    + '<button type="button" class="roulette-bet-level-btn" data-bet="high">強気(20)</button>'
    + '</div>'
    + '<div class="roulette-streak-banner" id="roulette-streak"></div>'
    + '<div class="roulette-luckyday-banner" id="roulette-luckyday-banner"></div>'
    + '<div class="roulette-freespin-indicator" id="roulette-freespin-indicator"></div>'
    + '<div class="roulette-low-balance-warning" id="roulette-low-balance-warning"></div>'
    + '<div class="roulette-reach-banner" id="roulette-reach"></div>'
    + '<label class="roulette-multiline-toggle">'
    + '<input type="checkbox" id="roulette-multiline-checkbox">'
    + ' 🔀 斜めラインベット(+8枚)'
    + '</label>'
    + '<div class="roulette-coin-insert">'
    + '<div class="roulette-coin-slot"></div>'
    + '<img class="roulette-coin" id="roulette-coin" src="' + COIN_IMG_URL + '" alt="" aria-hidden="true">'
    + '</div>'
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
    + '<p class="roulette-missions-banner" id="roulette-missions-banner"></p>'
    + '<div class="roulette-side-games">'
    + '<div class="roulette-wheel-panel">'
    + '<div class="roulette-wheel-wrap">'
    + '<div class="roulette-wheel" id="roulette-wheel"></div>'
    + '<div class="roulette-wheel-pointer"></div>'
    + '</div>'
    + '<button type="button" class="roulette-wheel-btn" id="roulette-wheel-btn">🎡 ホイールに挑戦(20枚)</button>'
    + '<p class="roulette-wheel-result" id="roulette-wheel-result"></p>'
    + '</div>'
    + '<div class="roulette-scratch-panel">'
    + '<button type="button" class="roulette-scratch-btn" id="roulette-scratch-btn">🎫 スクラッチカード購入(15枚)</button>'
    + '<div class="roulette-scratch-cells" id="roulette-scratch-cells"></div>'
    + '<p class="roulette-scratch-result" id="roulette-scratch-result"></p>'
    + '</div>'
    + '</div>'
    + '<p><a href="/shop">🏪 ショップ</a> ・ <a href="/">' + backLinkText + '</a></p>'
    + '</section>';
}

module.exports = { renderRoulettePage: renderRoulettePage };
