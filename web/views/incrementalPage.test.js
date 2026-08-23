'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderIncrementalPage } = require('./incrementalPage.js');

test('renderIncrementalPage includes the page section and DP/prestige HUD', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /class="incremental-page"/);
  assert.match(html, /id="incremental-dp-value"/);
  assert.match(html, /id="incremental-prestige-mult-value"/);
  assert.match(html, /id="incremental-click-btn"/);
});

test('renderIncrementalPage renders 12 employee tier rows with owned/cost/buy elements', () => {
  const html = renderIncrementalPage({});
  for (let i = 0; i < 12; i++) {
    assert.match(html, new RegExp('id="incremental-tier-name-' + i + '"'));
    assert.match(html, new RegExp('id="incremental-tier-owned-' + i + '"'));
    assert.match(html, new RegExp('id="incremental-tier-cost-' + i + '"'));
    assert.match(html, new RegExp('id="incremental-tier-buy-' + i + '"'));
  }
  assert.equal((html.match(/class="incremental-tier-buy-btn"/g) || []).length, 12);
});

test('renderIncrementalPage includes the credit-exchange UI and prestige button', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /id="incremental-credits-available"/);
  assert.match(html, /id="incremental-exchange-amount"/);
  assert.match(html, /id="incremental-exchange-btn"/);
  assert.match(html, /id="incremental-exchange-result"/);
  assert.match(html, /id="incremental-prestige-btn"/);
});

test('renderIncrementalPage restores dp/owned/lastTick/lifetimeDp/prestigeMult from localStorage', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var DP_KEY="ja_trans_incremental_dp_v1";/);
  assert.match(html, /var OWNED_KEY="ja_trans_incremental_owned_v1";/);
  assert.match(html, /var LASTTICK_KEY="ja_trans_incremental_lasttick_v1";/);
  assert.match(html, /var LIFETIME_KEY="ja_trans_incremental_lifetimedp_v1";/);
  assert.match(html, /var PRESTIGE_KEY="ja_trans_incremental_prestige_v1";/);
  assert.match(html, /var TIER_COUNT=12;/);
});

test('renderIncrementalPage uses a default back-link text when not provided', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /トップに戻る/);
});

test('renderIncrementalPage uses a custom back-link text when provided', () => {
  const html = renderIncrementalPage({ backLinkText: '一覧へ' });
  assert.match(html, /一覧へ/);
  assert.doesNotMatch(html, /トップに戻る/);
});

test('renderIncrementalPage computes per-tier output and total output scaled by prestige, and ticks every second', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var TIER_BASE_OUTPUT=0\.1;/);
  assert.match(html, /var TIER_OUTPUT_TIER_MULT=6;/);
  assert.match(html, /function tierBaseOutput\(i\)\{return TIER_BASE_OUTPUT\*Math\.pow\(TIER_OUTPUT_TIER_MULT,i\);\}/);
  assert.match(html, /function totalOutputPerSec\(\)\{/);
  assert.match(html, /sum\*prestigeMult;/);
  assert.match(html, /setInterval\(function\(\)\{/);
  assert.match(html, /addDp\(totalOutputPerSec\(\)\);/);
});

test('renderIncrementalPage grants capped offline progress based on elapsed time since lastTick, and shows a welcome-back message', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var OFFLINE_CAP_SECONDS=28800;/);
  assert.match(html, /var elapsedSec=Math\.max\(0,Math\.min\(OFFLINE_CAP_SECONDS,\(nowMs-lastTick\)\/1000\)\);/);
  assert.match(html, /var offlineGain=totalOutputPerSec\(\)\*elapsedSec;/);
  assert.match(html, /welcomeEl\.textContent="おかえりなさい、\+"\+Math\.floor\(offlineGain\)\.toLocaleString\(\)\+" DP";/);
});

test('renderIncrementalPage adds DP on manual click, scaled by prestige', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var CLICK_BASE=1;/);
  assert.match(html, /clickBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /addDp\(CLICK_BASE\*prestigeMult\);/);
});

test('renderIncrementalPage computes exponential per-tier purchase cost and wires buy buttons', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var TIER_BASE_COST=15;/);
  assert.match(html, /var TIER_COST_TIER_MULT=6;/);
  assert.match(html, /var TIER_COST_GROWTH=1\.14;/);
  assert.match(html, /function tierBaseCost\(i\)\{return TIER_BASE_COST\*Math\.pow\(TIER_COST_TIER_MULT,i\);\}/);
  assert.match(html, /function tierCost\(i,ownedCount\)\{return tierBaseCost\(i\)\*Math\.pow\(TIER_COST_GROWTH,ownedCount\);\}/);
  assert.match(html, /function renderTiers\(\)\{/);
  assert.match(html, /tierEls\[i\]\.costEl\.textContent=Math\.ceil\(tierCost\(i,owned\[i\]\)\)\.toLocaleString\(\);/);
  assert.match(html, /var cost=tierCost\(i,owned\[i\]\);/);
  assert.match(html, /if\(dp<cost\)return;/);
  assert.match(html, /owned\[i\]\+\+;/);
});

test('renderIncrementalPage fetches the backlog roster and overrides tier names, falling back to generic names on failure', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var FALLBACK_NAMES=\["従業員1","従業員2","従業員3","従業員4","従業員5","従業員6","従業員7","従業員8","従業員9","従業員10","従業員11","従業員12"\];/);
  assert.match(html, /fetch\("\/api\/incremental\/roster"\)\.then\(function\(r\)\{return r\.json\(\);\}\)\.then\(function\(d\)\{/);
  assert.match(html, /var roster=\(d&&d\.roster\)\|\|\[\];/);
  assert.match(html, /var label=\(roster\[i\]&&roster\[i\]\.name\)\?roster\[i\]\.name:FALLBACK_NAMES\[i\];/);
  assert.match(html, /\}\)\.catch\(function\(\)\{\}\);/);
});

test('renderIncrementalPage lets the player exchange roulette credits for DP at a fixed one-way rate', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var EXCHANGE_RATE=10;/);
  assert.match(html, /function loadRouletteCredits\(\)\{/);
  assert.match(html, /var raw=Number\(localStorage\.getItem\(CREDITS_KEY\)\);/);
  assert.match(html, /exchangeBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /if\(amount>have\)\{/);
  assert.match(html, /exchangeResultEl\.textContent="クレジットが足りません";/);
  assert.match(html, /localStorage\.setItem\(CREDITS_KEY,String\(have-amount\)\);/);
  assert.match(html, /addDp\(amount\/EXCHANGE_RATE\);/);
  // One-way constraint: CREDITS_KEY is written exactly once (deduction), never for reverse conversion
  assert.equal((html.match(/setItem\(CREDITS_KEY/g) || []).length, 1);
});

test('renderIncrementalPage lets the player prestige-reset dp/owned for a permanent multiplier based on lifetime DP', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var PRESTIGE_COEF=0\.1;/);
  assert.match(html, /var PRESTIGE_DIVISOR=1000000;/);
  assert.match(html, /prestigeBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /if\(!window\.confirm\(/);
  assert.match(html, /dp=0;/);
  assert.match(html, /owned=new Array\(TIER_COUNT\)\.fill\(0\);/);
  assert.match(html, /prestigeMult=1\+PRESTIGE_COEF\*Math\.sqrt\(lifetimeDp\/PRESTIGE_DIVISOR\);/);
  // 累計DP(lifetimeDp)自体はプレステージでリセットしない(倍率計算の根拠として残す)
  assert.doesNotMatch(html, /lifetimeDp=0;/);
});
