'use strict';
var html = require('../lib/html.js');

var TIER_COUNT = 12;

function tierRowHtml(i) {
  return '<div class="incremental-tier" data-tier="' + i + '">'
    + '<span class="incremental-tier-name" id="incremental-tier-name-' + i + '">従業員' + (i + 1) + '</span>'
    + '<span class="incremental-tier-owned">所持: <span id="incremental-tier-owned-' + i + '">0</span></span>'
    + '<span class="incremental-tier-cost">コスト: <span id="incremental-tier-cost-' + i + '">0</span> DP</span>'
    + '<button type="button" class="incremental-tier-buy-btn" id="incremental-tier-buy-' + i + '">雇う</button>'
    + '</div>';
}

var CLIENT_SCRIPT = ''
  + '(function(){'
  + '"use strict";'
  + 'var DP_KEY="ja_trans_incremental_dp_v1";'
  + 'var OWNED_KEY="ja_trans_incremental_owned_v1";'
  + 'var LASTTICK_KEY="ja_trans_incremental_lasttick_v1";'
  + 'var LIFETIME_KEY="ja_trans_incremental_lifetimedp_v1";'
  + 'var PRESTIGE_KEY="ja_trans_incremental_prestige_v1";'
  + 'var CREDITS_KEY="ja_trans_roulette_credits_v1";'
  + 'var TIER_COUNT=12;'
  + 'function loadNumber(key,fallback){'
  + 'var raw=Number(localStorage.getItem(key));'
  + 'return (isFinite(raw)&&raw>=0)?raw:fallback;'
  + '}'
  + 'function loadOwned(){'
  + 'var stored=localStorage.getItem(OWNED_KEY);'
  + 'if(!stored)return new Array(TIER_COUNT).fill(0);'
  + 'try{'
  + 'var arr=JSON.parse(stored);'
  + 'if(!Array.isArray(arr)||arr.length!==TIER_COUNT)return new Array(TIER_COUNT).fill(0);'
  + 'return arr.map(function(n){return (isFinite(n)&&n>=0)?Math.floor(n):0;});'
  + '}catch(e){return new Array(TIER_COUNT).fill(0);}'
  + '}'
  + 'var dp=loadNumber(DP_KEY,0);'
  + 'var owned=loadOwned();'
  + 'var lastTick=loadNumber(LASTTICK_KEY,Date.now());'
  + 'var lifetimeDp=loadNumber(LIFETIME_KEY,0);'
  + 'var prestigeMult=loadNumber(PRESTIGE_KEY,1)||1;'
  + 'function saveState(){'
  + 'localStorage.setItem(DP_KEY,String(dp));'
  + 'localStorage.setItem(OWNED_KEY,JSON.stringify(owned));'
  + 'localStorage.setItem(LASTTICK_KEY,String(lastTick));'
  + 'localStorage.setItem(LIFETIME_KEY,String(lifetimeDp));'
  + 'localStorage.setItem(PRESTIGE_KEY,String(prestigeMult));'
  + '}'
  + 'var page=document.querySelector(".incremental-page");'
  + 'if(!page)return;'
  + 'var dpEl=page.querySelector("#incremental-dp-value");'
  + 'var prestigeMultEl=page.querySelector("#incremental-prestige-mult-value");'
  + 'function renderDp(){'
  + 'if(dpEl)dpEl.textContent=Math.floor(dp).toLocaleString();'
  + '}'
  + 'function renderPrestige(){'
  + 'if(prestigeMultEl)prestigeMultEl.textContent=prestigeMult.toFixed(2)+"倍";'
  + '}'
  + 'renderDp();'
  + 'renderPrestige();'
  + 'saveState();'
  + '})();';

function renderIncrementalPage(opts) {
  opts = opts || {};
  var backLinkText = html.escapeHtml(opts.backLinkText || 'トップに戻る');
  var tiersHtml = '';
  for (var i = 0; i < TIER_COUNT; i++) { tiersHtml += tierRowHtml(i); }
  return '<section class="incremental-page">'
    + '<h2>🏭 積みゲー消化工場</h2>'
    + '<p class="incremental-welcome-back" id="incremental-welcome-back"></p>'
    + '<div class="incremental-hud">'
    + '<div class="incremental-dp">💼 開発資金: <span id="incremental-dp-value">0</span> DP</div>'
    + '<div class="incremental-prestige">✨ 倍率: <span id="incremental-prestige-mult-value">1.00倍</span></div>'
    + '</div>'
    + '<button type="button" id="incremental-click-btn">🛠️ 作業する(+1 DP)</button>'
    + '<div class="incremental-tiers">' + tiersHtml + '</div>'
    + '<div class="incremental-exchange">'
    + '<p>🪙 ルーレット残高: <span id="incremental-credits-available">0</span></p>'
    + '<input type="number" id="incremental-exchange-amount" min="1" placeholder="交換するクレジット枚数">'
    + '<button type="button" id="incremental-exchange-btn">DPに交換(10枚→1DP)</button>'
    + '<p id="incremental-exchange-result"></p>'
    + '</div>'
    + '<button type="button" id="incremental-prestige-btn">🔄 新年度リセット(プレステージ)</button>'
    + '<p><a href="/">' + backLinkText + '</a></p>'
    + '</section>'
    + '<script>' + CLIENT_SCRIPT + '</script>';
}

module.exports = { renderIncrementalPage: renderIncrementalPage };
