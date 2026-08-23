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

test('renderLayout renders a miss banner but still recommends a consolation game, without any payout', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /roulette-miss-banner/);
  assert.match(page, /ハズレ/);
  assert.match(page, /spin\(d\.candidates,d\.hit,d\.reelIndexes\)/);
  const missBranchStart = page.indexOf('}else{playMissSound();');
  const missBranchEnd = page.indexOf('resultEl.offsetHeight;', missBranchStart);
  const missBranch = page.slice(missBranchStart, missBranchEnd);
  assert.match(missBranch, /var consolation=candidates\[reelIndexes\[0\]\]/, 'a miss must still pick a game to recommend');
  assert.match(missBranch, /makeImg\(consolation\.imageUrl,consolation\.name\)/);
  assert.match(missBranch, /"\/analyze\?name="\+encodeURIComponent\(consolation\.name\)/);
  assert.doesNotMatch(missBranch, /setCredits\(credits\+/, 'a miss must not credit any payout');
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

test('renderLayout includes a persistent credit/bet HUD backed by localStorage, deducting on spin and paying out via cash-out', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-hud\{/);
  assert.match(page, /CREDITS_KEY="ja_trans_roulette_credits_v1"/);
  assert.match(page, /setCredits\(credits-SPIN_COST\)/);
  assert.match(page, /setCredits\(credits\+pendingPayout\)/);
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

test('renderLayout charges 15 credits per spin, refunding it (or a spent free spin) if the API call fails', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var SPIN_COST=15/);
  assert.match(page, /var lastSpinUsedFreeSpin=false/);
  assert.match(page, /lastSpinUsedFreeSpin=freeSpinsRemaining>0/);
  const spendIndex = page.indexOf('else{setCredits(credits-SPIN_COST);}');
  const refundIndex = page.indexOf('else{setCredits(credits+SPIN_COST);}');
  assert.ok(spendIndex > -1, 'must deduct SPIN_COST on a normal (non-free) spin');
  assert.ok(refundIndex > -1, 'must refund SPIN_COST on a failed spin');
});

test('renderLayout grows a progressive jackpot every spin and can pay it out on a rare mega-jackpot hit', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var JACKPOT_KEY="ja_trans_roulette_jackpot_v1"/);
  assert.match(page, /var JACKPOT_BASE=500/);
  assert.match(page, /var JACKPOT_INCREMENT=5/);
  assert.match(page, /setJackpot\(jackpot\+JACKPOT_INCREMENT\)/);
  assert.match(page, /var megaJackpotHit=Math\.random\(\)<0\.08/);
  assert.match(page, /jackpotWon=jackpot;setJackpot\(JACKPOT_BASE\)/);
  assert.match(page, /roulette-mega-jackpot-banner/);
  assert.match(page, /MEGA JACKPOT/);
});

test('renderLayout offers a double-up gamble after a win before crediting the payout, forfeiting it on a loss', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /roulette-doubleup-red/);
  assert.match(page, /roulette-doubleup-black/);
  assert.match(page, /roulette-doubleup-cashout/);
  assert.match(page, /function tryDouble\(guess\)/);
  assert.match(page, /pendingPayout\*=2/);
  assert.match(page, /賞金没収/);
  // the payout must NOT be credited immediately on a win - only via cashOut() or a doubled win
  const winBranchStart = page.indexOf('if(hit){');
  const doubleupStart = page.indexOf('var doubleupDiv=document.createElement');
  const immediateCreditIndex = page.indexOf('setCredits(credits+payout)');
  assert.ok(winBranchStart > -1 && doubleupStart > winBranchStart, 'double-up UI must be part of the hit branch');
  assert.equal(immediateCreditIndex, -1, 'payout must not be auto-credited before the double-up choice');
});

test('renderLayout does not re-enable the spin button until a pending double-up is resolved', () => {
  const page = renderLayout('<p>x</p>', {});
  const hitBranchStart = page.indexOf('if(hit){');
  const hitBranchEnd = page.indexOf('}else{', hitBranchStart);
  const hitBranch = page.slice(hitBranchStart, hitBranchEnd);
  // resetButton() should appear exactly once in the whole hit branch, and only inside
  // finishDoubleup's body - never unconditionally right after the win visuals are built.
  const resetCalls = (hitBranch.match(/resetButton\(\);/g) || []).length;
  assert.equal(resetCalls, 1, 'resetButton must be called exactly once (from finishDoubleup), not unconditionally after a win');
  assert.match(page, /function finishDoubleup\(\)\{/);
  const finishBody = page.slice(page.indexOf('function finishDoubleup(){'), page.indexOf('function finishDoubleup(){') + 200);
  assert.match(finishBody, /resetButton\(\);/);
  // the win-visuals block (before doubleupDiv is built) must not itself call resetButton
  const preDoubleupBlock = hitBranch.slice(0, hitBranch.indexOf('var doubleupDiv'));
  assert.doesNotMatch(preDoubleupBlock, /resetButton\(\);/);
});

test('renderLayout places the double-up choice immediately after the payout amount, before the winner banner/image, so it is reachable without scrolling past game details', () => {
  const page = renderLayout('<p>x</p>', {});
  const hitBranchStart = page.indexOf('if(hit){');
  const payoutAppendIndex = page.indexOf('resultEl.appendChild(payoutEl);', hitBranchStart);
  const doubleupIndex = page.indexOf('var doubleupDiv=document.createElement', hitBranchStart);
  const winnerBannerIndex = page.indexOf('banner.className="roulette-winner-banner"', hitBranchStart);
  assert.ok(payoutAppendIndex > -1 && doubleupIndex > payoutAppendIndex, 'double-up UI must be built right after the payout amount is shown');
  assert.ok(winnerBannerIndex > doubleupIndex, 'the winner banner/image must come after the double-up UI, not before it');
});

test('renderLayout auto-cashes-out a pending double-up after a timeout, so the spin button cannot get stuck disabled forever if the user never taps a button', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var autoCashoutId=setTimeout\(function\(\)\{cashOut\(\);\},overlayDuration\+20000\)/);
  assert.match(page, /var doubleupDone=false/);
  assert.match(page, /function cashOut\(\)\{if\(doubleupDone\)return;/);
  assert.match(page, /function tryDouble\(guess\)\{if\(doubleupDone\)return;/);
  assert.match(page, /clearTimeout\(autoCashoutId\)/);
});

test('renderLayout gives a win a full-screen takeover overlay, tiered by payout size, with rays and coin rain', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-win-overlay\{/);
  assert.match(page, /position:fixed;inset:0/);
  assert.match(page, /function showWinOverlay\(text,rainCount,duration\)\{/);
  assert.match(page, /var overlayText=megaJackpotHit\?"💎 MEGA JACKPOT!!":\(payout>=150\?"🎉 BIG WIN!!":"🎉 WIN!!"\)/);
  assert.match(page, /var overlayRainCount=megaJackpotHit\?36:\(payout>=150\?24:14\)/);
  assert.match(page, /var overlayDuration=megaJackpotHit\?3200:\(payout>=150\?2400:1600\)/);
  assert.match(page, /showWinOverlay\(overlayText,overlayRainCount,overlayDuration\);/);
  // the overlay call must happen before the payout amount is revealed, so it plays as the win lands
  const overlayCallIndex = page.indexOf('showWinOverlay(overlayText,overlayRainCount,overlayDuration);');
  const payoutElIndex = page.indexOf('resultEl.appendChild(payoutEl);');
  assert.ok(overlayCallIndex > -1 && overlayCallIndex < payoutElIndex, 'overlay must be triggered as part of landing the win, before the result panel is revealed');
});

test('renderLayout keeps the coin resting visibly in the slot at idle, instead of invisible until the drop animation', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.doesNotMatch(page, /\.roulette-coin\{[^}]*opacity:0[^}]*\}/, 'the coin must not be invisible at rest');
  assert.match(page, /@keyframes rouletteCoinIdleBob/);
});

test('renderLayout tracks a hit streak (resetting on a miss) and can grant a free-spin bonus that skips the spin cost', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var hitStreak=0/);
  assert.match(page, /hitStreak\+\+/);
  assert.match(page, /hitStreak=0/);
  assert.match(page, /roulette-streak-banner/);
  assert.match(page, /var freeSpinsRemaining=0/);
  assert.match(page, /freeSpinsRemaining\+=3/);
  assert.match(page, /フリースピンBONUS/);
  assert.match(page, /if\(lastSpinUsedFreeSpin\)\{freeSpinsRemaining--;updateFreespinIndicator\(\);\}/);
});
