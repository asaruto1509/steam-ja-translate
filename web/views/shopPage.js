'use strict';
var html = require('../lib/html.js');

function shopItemHtml(id, icon, name, desc) {
  return '<div class="shop-item" data-item="' + id + '">'
    + '<div class="shop-item-icon">' + icon + '</div>'
    + '<div class="shop-item-info">'
    + '<div class="shop-item-name">' + html.escapeHtml(name) + '</div>'
    + '<div class="shop-item-desc">' + html.escapeHtml(desc) + '</div>'
    + '<div class="shop-item-status" id="shop-status-' + id + '"></div>'
    + '</div>'
    + '<button type="button" class="shop-buy-btn" id="shop-buy-' + id + '"></button>'
    + '</div>';
}

function renderShopPage(opts) {
  opts = opts || {};
  var backLinkText = html.escapeHtml(opts.backLinkText || 'トップに戻る');
  return '<section class="shop-page">'
    + '<h2>🏪 アップグレードショップ</h2>'
    + '<div class="shop-credits">🪙 残高: <span id="shop-credits-value">0</span></div>'
    + '<div class="shop-items">'
    + shopItemHtml('freespins', '🎉', 'フリースピン購入', 'クレジットを消費してフリースピンを3回分購入します。')
    + shopItemHtml('payout', '💰', '配当ブースト', '当選時の配当額を永続的に上昇させます。(最大Lv5、各+5%、レベルごとに価格上昇)')
    + '<div class="shop-item" data-item="theme">'
    + '<div class="shop-item-icon">🎨</div>'
    + '<div class="shop-item-info">'
    + '<div class="shop-item-name">マシンテーマ</div>'
    + '<div class="shop-item-desc">スロットマシンの配色を変更できます。未解放のテーマは購入が必要です。</div>'
    + '<div class="shop-item-status" id="shop-status-theme"></div>'
    + '</div>'
    + '<div class="shop-theme-buttons">'
    + '<button type="button" class="shop-theme-btn" data-theme="gold" id="shop-theme-gold">🟡 ゴールド</button>'
    + '<button type="button" class="shop-theme-btn" data-theme="red" id="shop-theme-red">🔴 レッド</button>'
    + '<button type="button" class="shop-theme-btn" data-theme="purple" id="shop-theme-purple">🟣 パープル</button>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '<p><a href="/">' + backLinkText + '</a></p>'
    + '</section>';
}

module.exports = { renderShopPage: renderShopPage };
