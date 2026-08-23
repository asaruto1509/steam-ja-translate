'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderLayout } = require('./layout.js');

test('renderLayout embeds the body html inside the page', () => {
  const page = renderLayout('<p>hello</p>', {});
  assert.match(page, /<p>hello<\/p>/);
  assert.match(page, /<!doctype html>/i);
});

test('renderLayout includes a search form pointing at /analyze', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /action="\/analyze"/);
  assert.match(page, /name="name"/);
});

test('renderLayout escapes the query value in the search box', () => {
  const page = renderLayout('<p>x</p>', { query: '<script>' });
  assert.doesNotMatch(page, /value="<script>"/);
  assert.match(page, /value="&lt;script&gt;"/);
});

test('renderLayout includes a loading overlay explaining the wait time', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /loading-overlay/);
  assert.match(page, /分析中/);
  assert.match(page, /分程度/);
});

test('renderLayout includes a script that shows the loading overlay on form submit', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /querySelectorAll\("form:not\(\.chat-form\)"\)/);
  assert.match(page, /addEventListener\("submit"/);
  assert.match(page, /classList\.add\("loading"\)/);
});

test('renderLayout includes chat widget styling', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.chat-widget\{/);
  assert.match(page, /\.chat-message-user\{/);
  assert.match(page, /\.chat-message-assistant\{/);
});

test('renderLayout excludes chat forms from the full-page loading overlay', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /form:not\(\.chat-form\)/);
});

test('renderLayout wires chat widgets to POST /chat/message and /chat/clear via fetch', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /fetch\("\/chat\/message"/);
  assert.match(page, /fetch\("\/chat\/clear"/);
});

test('renderLayout includes a search suggestions dropdown wired to the search input', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /id="search-input"/);
  assert.match(page, /id="suggestions-list"/);
  assert.match(page, /\/api\/search-suggestions\?q=/);
});

test('renderLayout keeps the header image responsive on narrow screens', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.header-image\{[^}]*max-width:100%/);
});

test('renderLayout gives search form controls a larger tap target', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /min-height:44px/);
});

test('renderLayout gives the favorite-form button a larger tap target', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.favorite-form button\{[^}]*min-height:44px/);
});

test('renderLayout includes styling for the new chart and comparison-table elements', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.similar-games/);
  assert.match(page, /\.similar-games table\{/);
  assert.match(page, /\.similar-games th,\.similar-games td\{/);
});

test('renderLayout includes roulette reel styling', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-reel-wrap\{/);
  assert.match(page, /\.roulette-marker\{/);
});

test('renderLayout wires the roulette spin button to fetch the page-specific spin endpoint', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /roulette-spin-btn/);
  assert.match(page, /data-spin-endpoint/);
});

test('renderLayout adds the pulled class before disabling the spin button, so the lever-pull animation is not suppressed by the disabled attribute', () => {
  const page = renderLayout('<p>x</p>', {});
  const pulledIndex = page.indexOf('spinBtn.classList.add("pulled")');
  const disabledIndex = page.indexOf('spinBtn.disabled=true');
  assert.ok(pulledIndex > -1, 'expected to find classList.add("pulled")');
  assert.ok(disabledIndex > -1, 'expected to find spinBtn.disabled=true');
  assert.ok(pulledIndex < disabledIndex, 'pulled class must be added before the button is disabled');
});

test('renderLayout includes a decorative slot-machine lever styled and animated alongside the reel', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-lever\{/);
  assert.match(page, /\.roulette-lever-knob\{/);
  assert.match(page, /@keyframes rouletteLeverKnobPull/);
  assert.match(page, /lever\.classList\.add\("pulled"\)/);
});

test('renderLayout stops each reel with a staggered delay and waits for all three before revealing the result', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var STAGGER=\[0,500,1000\]/);
  assert.match(page, /if\(doneCount===reels\.length\)/);
});

test('renderLayout gives the third reel a longer spin duration than the first two, so the payoff after リーチ gets real dwell time', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var REEL_DURATIONS=\[2,2,3\.2\]/);
  assert.match(page, /landReel\(reel,candidates,reelIndexes\[i\],REEL_DURATIONS\[i\]\|\|2,/);
});

test('renderLayout renders a miss banner when the spin result is not a hit, without revealing a game', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /roulette-miss-banner/);
  assert.match(page, /ハズレ/);
  assert.match(page, /spin\(d\.candidates,d\.hit,d\.reelIndexes\)/);
});

test('renderLayout drops a coin into the slot before the lever pulls, and plays synthesized sound effects on spin, reel stop, reach, win, and miss', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-coin\{/);
  assert.match(page, /\.roulette-coin\.dropping\{/);
  assert.match(page, /coin\.classList\.add\("dropping"\)/);
  const coinIndex = page.indexOf('coin.classList.add("dropping")');
  const leverIndex = page.indexOf('lever.classList.add("pulled")');
  assert.ok(coinIndex > -1 && leverIndex > -1 && coinIndex < leverIndex, 'coin drop must be triggered before the lever pull');
  const coinImgUrlIndex = page.indexOf('var coinImgUrl=coin?coin.getAttribute("src"):""');
  assert.ok(coinImgUrlIndex > -1, 'payout coins must reuse the real coin image src, not a CSS-drawn circle');
  assert.match(page, /function playCoinSound\(\)/);
  assert.match(page, /function playLeverSound\(\)/);
  assert.match(page, /function playReelStopSound\(i\)/);
  assert.match(page, /function playReachSound\(\)/);
  assert.match(page, /function playWinSound\(\)/);
  assert.match(page, /function playMissSound\(\)/);
  assert.match(page, /playCoinSound\(\);/);
  assert.match(page, /playReelStopSound\(i\);/);
  assert.match(page, /playReachSound\(\);/);
  assert.match(page, /playWinSound\(\);/);
  assert.match(page, /playMissSound\(\);/);
});

test('renderLayout only starts the AudioContext lazily and resumes it if suspended, to respect browser autoplay policy', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /window\.AudioContext\|\|window\.webkitAudioContext/);
  assert.match(page, /audioCtx\.state==="suspended"/);
});

test('renderLayout includes marquee bulb lighting styling that runs continuously around each reel and the top of the cabinet', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-bulb\{/);
  assert.match(page, /@keyframes rouletteBulbChase/);
  assert.match(page, /\.roulette-marquee-top\{/);
});

test('renderLayout gives a hit a bigger celebration: screen flash, coin payout, and a jackpot banner', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-win-flash\{/);
  assert.match(page, /\.roulette-payout-coin\{/);
  assert.match(page, /function payoutCoins\(\)/);
  assert.match(page, /payoutCoins\(\);/);
  assert.match(page, /roulette-jackpot-banner/);
  assert.match(page, /JACKPOT/);
  assert.match(page, /winFlashEl\.classList\.add\("flash"\)/);
});

test('renderLayout gives a miss its own effect: machine shake and a dim flash', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-machine\.shake\{/);
  assert.match(page, /\.roulette-miss-dim\{/);
  assert.match(page, /machine\.classList\.add\("shake"\)/);
  assert.match(page, /missDimEl\.classList\.add\("flash"\)/);
});

test('renderLayout includes a persistent credit/bet HUD backed by localStorage, deducting on spin and paying out on a win', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-hud\{/);
  assert.match(page, /CREDITS_KEY="ja_trans_roulette_credits_v1"/);
  assert.match(page, /var SPIN_COST=10/);
  assert.match(page, /setCredits\(credits-SPIN_COST\)/);
  assert.match(page, /setCredits\(credits\+payout\)/);
  assert.match(page, /function animateNumber\(/);
  assert.match(page, /roulette-payout-amount/);
  assert.match(page, /if\(stored===null\)return 1000/);
});

test('renderLayout decorates the cabinet background with a subtle card-suit pattern', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /data:image\/svg\+xml/);
  assert.match(page, /background-repeat:repeat,no-repeat/);
});

test('renderLayout triggers a reach effect when the first two reels already match, and clears it once all reels land', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-reach-banner\{/);
  assert.match(page, /\.roulette-reel-wrap\.reaching\{/);
  assert.match(page, /if\(i===1&&reelIndexes\[0\]===reelIndexes\[1\]\)\{showReach\(\);\}/);
  assert.match(page, /hideReach\(\);onAllLanded/);
});
