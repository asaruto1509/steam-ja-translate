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

test('renderLayout triggers a reach effect when the first two reels already match, and clears it once all reels land', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-reach-banner\{/);
  assert.match(page, /\.roulette-reel-wrap\.reaching\{/);
  assert.match(page, /if\(i===1&&reelIndexes\[0\]===reelIndexes\[1\]\)\{showReach\(\);\}/);
  assert.match(page, /hideReach\(\);onAllLanded/);
});
