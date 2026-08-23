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
  const missBranchEnd = page.indexOf('if(lastSpinMultiline){', missBranchStart);
  const missBranch = page.slice(missBranchStart, missBranchEnd);
  assert.match(missBranch, /var consolation=candidates\[reelIndexes\[0\]\]/, 'a miss must still pick a game to recommend');
  assert.match(missBranch, /makeImg\(consolation\.imageUrl,consolation\.name\)/);
  assert.match(missBranch, /"\/analyze\?name="\+encodeURIComponent\(consolation\.name\)/);
  assert.doesNotMatch(missBranch, /setCredits\(credits\+/, 'a miss must not credit any payout');
});

test('renderLayout plays synthesized sound effects on spin, reel stop, reach, win, and miss', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-coin\{/);
  assert.match(page, /\.roulette-coin\.dropping\{/);
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
  assert.match(page, /var usingFreeSpin=freeSpinsRemaining>0;/);
  assert.match(page, /lastSpinUsedFreeSpin=usingFreeSpin;/);
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

test('renderLayout does not re-enable the spin button until a pending double-up (and any bonus round after it) is resolved', () => {
  const page = renderLayout('<p>x</p>', {});
  const hitBranchStart = page.indexOf('if(hit){');
  const hitBranchEnd = page.indexOf('}else{', hitBranchStart);
  const hitBranch = page.slice(hitBranchStart, hitBranchEnd);
  // the win-visuals block (before doubleupDiv is built) must not itself call resetButton
  const preDoubleupBlock = hitBranch.slice(0, hitBranch.indexOf('var doubleupDiv'));
  assert.doesNotMatch(preDoubleupBlock, /resetButton\(\);/);
  // finishDoubleup must route exclusively through maybeStartCardBonus, never call resetButton directly itself
  assert.match(page, /function finishDoubleup\(\)\{clearTimeout\(autoCashoutId\);doubleupDone=true;doubleupDiv\.innerHTML="";maybeStartCardBonus\(\);\}/);
  assert.doesNotMatch(page.slice(page.indexOf('function finishDoubleup(){'), page.indexOf('function finishDoubleup(){') + 100), /resetButton/);
  // maybeStartCardBonus only calls resetButton once the bonus round (if any) has resolved
  assert.match(page, /function maybeStartCardBonus\(\)\{if\(Math\.random\(\)<0\.15\)\{startCardBonusRound\(function\(\)\{resetButton\(\);runBonusRoll\(\);\}\);\}else\{resetButton\(\);runBonusRoll\(\);\}\}/);
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
  assert.match(page, /function showWinOverlay\(text,rainCount,duration,comboActive\)\{/);
  assert.match(page, /var overlayText=megaJackpotHit\?"💎 MEGA JACKPOT!!":\(payout>=150\?"🎉 BIG WIN!!":"🎉 WIN!!"\)/);
  assert.match(page, /var overlayRainCount=megaJackpotHit\?36:\(payout>=150\?24:14\)/);
  assert.match(page, /var overlayDuration=megaJackpotHit\?3200:\(payout>=150\?2400:1600\)/);
  assert.match(page, /showWinOverlay\(overlayText,overlayRainCount,overlayDuration,comboActive\);/);
  // the overlay call must happen before the payout amount is revealed, so it plays as the win lands
  const overlayCallIndex = page.indexOf('showWinOverlay(overlayText,overlayRainCount,overlayDuration,comboActive);');
  const payoutElIndex = page.indexOf('resultEl.appendChild(payoutEl);');
  assert.ok(overlayCallIndex > -1 && overlayCallIndex < payoutElIndex, 'overlay must be triggered as part of landing the win, before the result panel is revealed');
});

test('renderLayout keeps the coin resting visibly in the slot at idle, instead of invisible until the drop animation', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.doesNotMatch(page, /\.roulette-coin\{[^}]*opacity:0[^}]*\}/, 'the coin must not be invisible at rest');
  assert.match(page, /@keyframes rouletteCoinIdleBob/);
});

test('renderLayout requires the player to tap the coin to insert it before a spin can start, unless a free spin is available', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var coinInserted=false/);
  assert.match(page, /function insertCoin\(\)\{/);
  const insertCoinBody = page.slice(page.indexOf('function insertCoin(){'), page.indexOf('function insertCoin(){') + 260);
  assert.match(insertCoinBody, /if\(spinning\|\|coinInserted\)return;/);
  assert.match(insertCoinBody, /coinInserted=true;/);
  assert.match(insertCoinBody, /coin\.classList\.remove\("dropping"\);coin\.offsetHeight;coin\.classList\.add\("dropping"\);/, 'the coin-drop animation must move to the insert action, not stay in startSpin');
  assert.match(insertCoinBody, /playCoinSound\(\);/);
  assert.match(page, /coinInsertEl\.addEventListener\("click",insertCoin\);/);
  // the gate lives inside startSpin itself, so both the button and the lever-drag path are covered
  const startSpinBody = page.slice(page.indexOf('function startSpin(skipLeverAnim,strength){'), page.indexOf('function startSpin(skipLeverAnim,strength){') + 600);
  assert.match(startSpinBody, /var usingFreeSpin=freeSpinsRemaining>0;/);
  assert.match(startSpinBody, /if\(!usingFreeSpin&&!coinInserted\)\{nudgeCoin\(\);return;\}/);
  assert.match(startSpinBody, /coinInserted=false;/, 'the coin must be consumed once a real (non-free) spin actually starts');
  assert.doesNotMatch(startSpinBody, /coin\.classList\.add\("dropping"\)/, 'the coin drop must no longer fire from inside startSpin');
});

test('renderLayout shows a coin-insert prompt on the spin button when no coin is inserted, and resets it after a spin resolves or fails', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /function updateSpinBtnLabel\(\)\{/);
  const labelBody = page.slice(page.indexOf('function updateSpinBtnLabel(){'), page.indexOf('function updateSpinBtnLabel(){') + 160);
  assert.match(labelBody, /spinBtn\.textContent=\(freeSpinsRemaining>0\|\|coinInserted\)\?"🎰 回す":"🪙 コインを入れてね";/);
  assert.match(page, /function resetButton\(\)\{spinning=false;spinBtn\.disabled=false;if\(coin\)\{coin\.classList\.remove\("dropping"\);\}updateSpinBtnLabel\(\);updateLowBalanceWarning\(\);\}/);
});

test('renderLayout lets the player drag the lever knob down to start a spin, as an alternative to the button', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /touch-action:none;cursor:grab/);
  assert.match(page, /function startSpin\(skipLeverAnim,strength\)\{/);
  assert.match(page, /spinBtn\.addEventListener\("click",function\(\)\{startSpin\(false,1\);\}\);/);
  assert.match(page, /var LEVER_DRAG_MAX=200/);
  assert.match(page, /var LEVER_DRAG_THRESHOLD=130/);
  assert.match(page, /lever\.addEventListener\("pointerdown",function\(e\)\{/);
  assert.match(page, /lever\.addEventListener\("pointermove",function\(e\)\{/);
  assert.match(page, /lever\.addEventListener\("pointerup",leverDragEnd\)/);
  assert.match(page, /lever\.addEventListener\("pointercancel",function\(\)\{/);
  // dragging past the threshold on release must start a spin; short drags must not
  assert.match(page, /if\(delta>=LEVER_DRAG_THRESHOLD&&!spinning\)\{/);
  assert.match(page, /startSpin\(true,strengthRatio\);/);
  // a spin already in progress must block starting a new drag
  const pointerdownBody = page.slice(page.indexOf('lever.addEventListener("pointerdown"'), page.indexOf('lever.addEventListener("pointermove"'));
  assert.match(pointerdownBody, /if\(spinning\)return;/);
});

test('renderLayout skips the automatic lever-pull CSS animation when the spin was already started by dragging the lever itself', () => {
  const page = renderLayout('<p>x</p>', {});
  const startSpinBody = page.slice(page.indexOf('function startSpin(skipLeverAnim,strength){'), page.indexOf('spinBtn.addEventListener("click"'));
  assert.match(startSpinBody, /if\(skipLeverAnim\)\{playLeverSound\(\);\}/);
  assert.match(startSpinBody, /else\{setTimeout\(function\(\)\{/);
});

test('renderLayout persists free spins to localStorage so a shop purchase on another page is picked up on load', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var FREESPINS_KEY="ja_trans_roulette_freespins_v1"/);
  assert.match(page, /function loadFreeSpins\(\)\{/);
  assert.match(page, /function saveFreeSpins\(v\)\{localStorage\.setItem\(FREESPINS_KEY,String\(v\)\);\}/);
  assert.match(page, /function setFreeSpins\(v\)\{/);
  const setFreeSpinsBody = page.slice(page.indexOf('function setFreeSpins(v){'), page.indexOf('function setFreeSpins(v){') + 160);
  assert.match(setFreeSpinsBody, /saveFreeSpins\(freeSpinsRemaining\);/);
  // every mutation site must persist through setFreeSpins rather than touching the variable directly
  assert.match(page, /if\(lastSpinUsedFreeSpin\)\{setFreeSpins\(freeSpinsRemaining\+1\);\}/);
  assert.match(page, /if\(lastSpinUsedFreeSpin\)\{setFreeSpins\(freeSpinsRemaining-1\);\}/);
  assert.match(page, /setFreeSpins\(freeSpinsRemaining\+3\);/);
});

test('renderLayout applies a shop-purchased payout boost to the win amount, and a shop-purchased theme as a page class', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var PAYOUT_BOOST_KEY="ja_trans_shop_payout_level_v1"/);
  assert.match(page, /function loadPayoutBoostLevel\(\)\{/);
  const hitBranchStart = page.indexOf('if(hit){');
  const boostApplication = page.slice(hitBranchStart, hitBranchStart + 600);
  assert.match(boostApplication, /var payoutBoostLevel=loadPayoutBoostLevel\(\);/);
  assert.match(boostApplication, /if\(payoutBoostLevel>0\)\{payout=Math\.round\(payout\*\(1\+payoutBoostLevel\*0\.05\)\/10\)\*10;\}/);
  assert.match(page, /var THEME_KEY="ja_trans_shop_theme_v1"/);
  assert.match(page, /var activeTheme=localStorage\.getItem\(THEME_KEY\)\|\|"gold";/);
  assert.match(page, /if\(activeTheme!=="gold"\)\{page\.classList\.add\("theme-"\+activeTheme\);\}/);
  assert.match(page, /\.roulette-page\.theme-red /);
  assert.match(page, /\.roulette-page\.theme-purple /);
});

test('renderLayout gives every reel stop a brief brightness-impact punch, independent of hit/miss', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-reel-wrap\.impact\{animation:rouletteReelImpact 0\.25s ease-out\}/);
  assert.match(page, /@keyframes rouletteReelImpact/);
  const spinFnStart = page.indexOf('function spin(candidates,hit,reelIndexes){');
  const spinFnBody = page.slice(spinFnStart, spinFnStart + 500);
  assert.match(spinFnBody, /playReelStopSound\(i\);/);
  assert.match(spinFnBody, /impactWrap\.classList\.add\("impact"\);/);
});

test('renderLayout tracks stats (spins, wins, streak, jackpots, doubleup, free-spin bonuses, shop purchases) and unlocks achievements from them', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var STATS_KEY="ja_trans_stats_v1"/);
  assert.match(page, /var ACHIEVEMENTS_KEY="ja_trans_achievements_v1"/);
  assert.match(page, /function bumpStat\(key,delta\)\{/);
  assert.match(page, /function setStatMax\(key,value\)\{/);
  assert.match(page, /function checkAchievements\(\)\{/);
  assert.match(page, /function showAchievementToast\(def\)\{/);
  assert.match(page, /\.achievement-toast\{/);
  // achievements infra must be defined once, before both the roulette and shop page blocks, so both can use it
  const achievementsDefIndex = page.indexOf('function checkAchievements(){');
  const rouletteBlockIndex = page.indexOf('document.querySelectorAll(".roulette-page")');
  const shopBlockIndex = page.indexOf('document.querySelectorAll(".shop-page")');
  assert.ok(achievementsDefIndex > -1 && achievementsDefIndex < rouletteBlockIndex && rouletteBlockIndex < shopBlockIndex,
    'stats/achievements helpers must be shared, defined before both page-specific script blocks');
  // spot-check the actual call sites that feed the counters
  assert.match(page, /spinning=true;bumpStat\("totalSpins",1\);/);
  assert.match(page, /bumpStat\("totalWins",1\);/);
  assert.match(page, /setStatMax\("bestStreak",hitStreak\);/);
  assert.match(page, /if\(megaJackpotHit\)\{bumpStat\("megaJackpots",1\);\}/);
  assert.match(page, /bumpStat\("totalMisses",1\);/);
  assert.match(page, /bumpStat\("totalPayout",pendingPayout\);/);
  assert.match(page, /setStatMax\("bestWin",pendingPayout\);/);
  assert.match(page, /bumpStat\("doubleupWins",1\);/);
  assert.match(page, /bumpStat\("doubleupLosses",1\);/);
  assert.match(page, /bumpStat\("freeSpinBonuses",1\);/);
  const shopBlock = page.slice(shopBlockIndex);
  assert.equal((shopBlock.match(/bumpStat\("shopPurchases",1\);/g) || []).length, 6, 'all shop purchase paths (free spins, payout boost, theme, soundpack, coin skin, lever skin) must count toward the achievement');
});

test('renderLayout wires up the shop page: free-spin purchase, a capped/escalating payout-boost, and theme unlocks, all spending the shared credits balance', () => {
  const page = renderLayout('<p>x</p>', {});
  const shopBlockStart = page.indexOf('document.querySelectorAll(".shop-page")');
  assert.ok(shopBlockStart > -1, 'the shop page must have its own guarded script block');
  const shopBlock = page.slice(shopBlockStart);
  assert.match(shopBlock, /var CREDITS_KEY="ja_trans_roulette_credits_v1";/, 'the shop must spend the same credits balance as the roulette pages');
  assert.match(shopBlock, /var FREESPIN_COST=150;/);
  assert.match(shopBlock, /var THEME_COST=300;/);
  assert.match(shopBlock, /var PAYOUT_BOOST_MAX_LEVEL=5;/);
  assert.match(shopBlock, /function payoutBoostCost\(level\)\{return PAYOUT_BOOST_BASE_COST\*Math\.pow\(2,level\);\}/, 'cost must escalate per level so the boost cannot trivially pay for itself');
  assert.match(shopBlock, /if\(credits<FREESPIN_COST\)return;/);
  assert.match(shopBlock, /if\(level>=PAYOUT_BOOST_MAX_LEVEL\)return;/);
  assert.match(shopBlock, /if\(credits<cost\)return;/);
  assert.match(shopBlock, /saveFreeSpins\(loadFreeSpins\(\)\+3\);/, 'buying free spins must add to the same persisted count the roulette pages read');
});

test('renderLayout tracks a hit streak (resetting on a miss) and can grant a free-spin bonus that skips the spin cost', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var hitStreak=0/);
  assert.match(page, /hitStreak\+\+/);
  assert.match(page, /hitStreak=0/);
  assert.match(page, /roulette-streak-banner/);
  assert.match(page, /var freeSpinsRemaining=loadFreeSpins\(\);/);
  assert.match(page, /setFreeSpins\(freeSpinsRemaining\+3\);/);
  assert.match(page, /フリースピンBONUS/);
  assert.match(page, /if\(lastSpinUsedFreeSpin\)\{setFreeSpins\(freeSpinsRemaining-1\);\}/);
});

test('renderLayout picks confetti bursts randomly from multiple emoji patterns', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var CONFETTI_PATTERNS=\[\[.*\],\[.*\],\[.*\],\[.*\]\];/);
  assert.match(page, /var emojis=CONFETTI_PATTERNS\[Math\.floor\(Math\.random\(\)\*CONFETTI_PATTERNS\.length\)\];/);
});

test('renderLayout escalates the win overlay into a combo state on a 3+ hit streak', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var comboActive=hitStreak>=3;/);
  assert.match(page, /if\(hitStreak>=2\)\{overlayText\+=" 🔥COMBO x"\+hitStreak\+"!";\}/);
  assert.match(page, /showWinOverlay\(overlayText,overlayRainCount,overlayDuration,comboActive\);/);
  assert.match(page, /winOverlayEl\.classList\.toggle\("combo",!!comboActive\);/);
  assert.match(page, /\.roulette-win-overlay\.combo /);
});

test('renderLayout shows a near-miss tease when a losing reel lands adjacent to the winning index', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var nearMiss=false;/);
  assert.match(page, /if\(idxDiff===1\|\|idxDiff===candidates\.length-1\)\{nearMiss=true;\}/);
  assert.match(page, /miss\.textContent=nearMiss\?"😲 惜しい!あと1コマだった…":"😢 ハズレ…でもこれはどう\?";/);
  assert.match(page, /\.roulette-miss-banner\.near-miss\{/);
});

test('renderLayout renders an always-on ambient particle backdrop on the machine via CSS', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-ambient\{/);
  assert.match(page, /rouletteAmbientDrift/);
});

test('renderLayout shows a low-balance warning once credits drop below the spin cost with no free spins or coin queued', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /function updateLowBalanceWarning\(\)\{/);
  assert.match(page, /var show=freeSpinsRemaining<=0&&!coinInserted&&credits<\(SPIN_COST\+multilineCost\);/);
  assert.match(page, /setCredits\(next\)\{[\s\S]{0,300}updateLowBalanceWarning\(\);\}/);
  assert.match(page, /function insertCoin\(\)\{[\s\S]{0,250}updateLowBalanceWarning\(\);\}/);
});

test('renderLayout gives the credits counter a tabular/odometer-style punch animation on update', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /\.roulette-credits\{font-variant-numeric:tabular-nums\}/);
  assert.match(page, /#roulette-credits-value\.punch\{animation:rouletteCreditsPunch/);
  assert.match(page, /creditsEl\.classList\.add\("punch"\);/);
});

test('renderLayout supports switchable soundpacks that alter tone waveform/pitch, plus a low-volume ambient BGM loop started on coin insert', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var SOUNDPACK_KEY="ja_trans_shop_soundpack_v1";/);
  assert.match(page, /function loadSoundPack\(\)\{var v=localStorage\.getItem\(SOUNDPACK_KEY\);return \(v==="retro"\|\|v==="wafu"\)\?v:"default";\}/);
  assert.match(page, /osc\.type=packWaveform\(type\|\|"sine"\);/);
  assert.match(page, /osc\.frequency\.value=freq\*packPitch\(\);/);
  assert.match(page, /function startAmbientLoop\(\)\{/);
  assert.match(page, /function insertCoin\(\)\{[\s\S]{0,300}startAmbientLoop\(\);/);
});

test('renderLayout lets the shop adjust screen-shake intensity, applied via a CSS custom property scaled by lever-pull strength', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var SHAKE_KEY="ja_trans_shop_shake_v1";/);
  assert.match(page, /function loadShakeIntensity\(\)\{var v=Number\(localStorage\.getItem\(SHAKE_KEY\)\);return \(v===0\.5\|\|v===1\|\|v===1\.5\)\?v:1;\}/);
  assert.match(page, /translateX\(calc\(-8px \* var\(--shake-intensity,1\)\)\)/);
  assert.match(page, /page\.style\.setProperty\("--shake-intensity",\(baseShakeIntensity\*spinEffectStrength\)\.toFixed\(2\)\);/);
});

test('renderLayout scales the lever-pull strength (0.6-1.4) by how far the knob was dragged, feeding the win-overlay rain count', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var spinEffectStrength=1;/);
  assert.match(page, /var strengthRatio=Math\.max\(0\.6,Math\.min\(1\.4,0\.6\+\(delta\/LEVER_DRAG_MAX\)\*0\.8\)\);/);
  assert.match(page, /spinEffectStrength=strength\|\|1;/);
  assert.match(page, /overlayRainCount=Math\.round\(overlayRainCount\*spinEffectStrength\);/);
});

test('renderLayout lets a shop-purchased coin skin swap the coin image used by the insert coin, payout rain, and idle coin, and a lever skin add a CSS class to the lever', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var COIN_SKIN_CODES=\{default:"1fa99",gold:"1f947",gem:"1f48e"\};/);
  assert.match(page, /var COINSKIN_KEY="ja_trans_shop_coinskin_v1";/);
  assert.match(page, /if\(coin&&activeCoinSkin!=="default"\)\{coin\.setAttribute\("src",coinSkinUrl\(activeCoinSkin\)\);\}/);
  assert.match(page, /var coinImgUrl=coin\?coin\.getAttribute\("src"\):"";/);
  assert.match(page, /var LEVERSKIN_KEY="ja_trans_shop_leverskin_v1";/);
  assert.match(page, /if\(lever&&activeLeverSkin!=="default"\)\{lever\.classList\.add\("knob-"\+activeLeverSkin\);\}/);
  assert.match(page, /\.roulette-lever\.knob-blue \.roulette-lever-knob\{/);
  assert.match(page, /\.roulette-lever\.knob-black \.roulette-lever-knob\{/);
});

test('renderLayout wires up the shop soundpack and shake-intensity controls, with soundpack unlocks counting toward the shop-purchase achievement', () => {
  const page = renderLayout('<p>x</p>', {});
  const shopBlockStart = page.indexOf('document.querySelectorAll(".shop-page")');
  const shopBlock = page.slice(shopBlockStart);
  assert.match(shopBlock, /var SOUNDPACK_COST=250;/);
  assert.match(shopBlock, /function renderSoundpackItem\(\)\{/);
  assert.match(shopBlock, /function renderShakeItem\(\)\{/);
  assert.match(shopBlock, /saveActiveSoundPack\(id\);/);
  assert.match(shopBlock, /saveShakeIntensity\(v\);/);
});

test('renderLayout marks not-yet-purchased shop options with a lock icon and price, not just the affordability-based disabled state', () => {
  const page = renderLayout('<p>x</p>', {});
  const shopBlockStart = page.indexOf('document.querySelectorAll(".shop-page")');
  const shopBlock = page.slice(shopBlockStart);
  assert.match(shopBlock, /function applyLockedLabel\(btn,label,isUnlocked,cost\)\{/);
  assert.match(shopBlock, /btn\.classList\.toggle\("locked",!isUnlocked\);/);
  assert.match(shopBlock, /btn\.textContent=isUnlocked\?label:label\+" 🔒"\+cost;/);
  assert.match(shopBlock, /applyLockedLabel\(btn,THEME_LABELS\[id\],isUnlocked,THEME_COST\);/);
  assert.match(shopBlock, /applyLockedLabel\(btn,SOUNDPACK_LABELS\[id\],isUnlocked,SOUNDPACK_COST\);/);
  assert.match(shopBlock, /applyLockedLabel\(btn,COINSKIN_LABELS\[id\],isUnlocked,COINSKIN_COST\);/);
  assert.match(shopBlock, /applyLockedLabel\(btn,LEVERSKIN_LABELS\[id\],isUnlocked,LEVERSKIN_COST\);/);
  assert.match(page, /\.shop-theme-btn\.locked\{/);
});

test('renderLayout wires a data-reset button that confirms, clears every roulette/shop localStorage key, and reloads', () => {
  const page = renderLayout('<p>x</p>', {});
  const shopBlockStart = page.indexOf('document.querySelectorAll(".shop-page")');
  const shopBlock = page.slice(shopBlockStart);
  assert.match(shopBlock, /var resetBtn=page\.querySelector\("#shop-reset-data"\);/);
  assert.match(shopBlock, /if\(!window\.confirm\(/);
  assert.match(shopBlock, /RESET_KEYS\.forEach\(function\(k\)\{localStorage\.removeItem\(k\);\}\);/);
  assert.match(shopBlock, /location\.reload\(\);/);
  // must cover every persisted key, not just credits
  const resetKeyNames = ['CREDITS_KEY', 'PAYOUT_BOOST_KEY', 'THEME_KEY', 'THEME_UNLOCKED_KEY', 'SOUNDPACK_KEY', 'SOUNDPACK_UNLOCKED_KEY',
    'COINSKIN_KEY', 'COINSKIN_UNLOCKED_KEY', 'LEVERSKIN_KEY', 'LEVERSKIN_UNLOCKED_KEY', 'SHAKE_KEY', 'BGM_KEY'];
  resetKeyNames.forEach((key) => {
    assert.match(shopBlock, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `RESET_KEYS must include ${key}`);
  });
  assert.match(shopBlock, /"ja_trans_stats_v1"/);
  assert.match(shopBlock, /"ja_trans_achievements_v1"/);
  // guards against silently forgetting to add a key to the array itself as new persisted state is introduced
  const resetKeysLine = shopBlock.slice(shopBlock.indexOf('var RESET_KEYS='), shopBlock.indexOf('var resetBtn='));
  const entryCount = (resetKeysLine.match(/,/g) || []).length + 1;
  assert.equal(entryCount, resetKeyNames.length + 4, 'RESET_KEYS entry count must include all named *_KEY constants plus the four inline string keys (jackpot, freespins, stats, achievements)');
});

test('renderLayout offers a diagonal-line side bet, evaluated client-side from the server-supplied reelIndexes/candidates without the client choosing the outcome', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var MULTILINE_COST=8;/);
  assert.match(page, /var DIAGONAL_PAYOUT=16;/);
  assert.match(page, /lastSpinMultiline=!!\(multilineCheckbox&&multilineCheckbox\.checked&&credits>=MULTILINE_COST\);/);
  assert.match(page, /if\(lastSpinMultiline\)\{setCredits\(credits-MULTILINE_COST\);\}/);
  // a failed spin fetch must refund the side-bet charge too, not just the main spin cost
  assert.match(page, /if\(lastSpinMultiline\)\{setCredits\(credits\+MULTILINE_COST\);lastSpinMultiline=false;\}/);
  assert.match(page, /var mlTop=\(reelIndexes\[0\]-1\+mlLen\)%mlLen;/);
  assert.match(page, /var mlMid=reelIndexes\[1\]%mlLen;/);
  assert.match(page, /var mlBot=\(reelIndexes\[2\]\+1\)%mlLen;/);
  assert.match(page, /var diagonalHit=\(mlTop===mlMid\)&&\(mlMid===mlBot\);/);
  assert.match(page, /\.roulette-reels\{position:relative;/);
  assert.match(page, /\.roulette-reels\.diagonal-hit::after\{/);
});

test('renderLayout accounts for the multiline side-bet cost in the low-balance warning threshold', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /var multilineCost=\(multilineCheckbox&&multilineCheckbox\.checked\)\?MULTILINE_COST:0;/);
  assert.match(page, /var show=freeSpinsRemaining<=0&&!coinInserted&&credits<\(SPIN_COST\+multilineCost\);/);
});

test('renderLayout lets the shop toggle the ambient BGM loop on/off, and startAmbientLoop respects it', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /function isBgmEnabled\(\)\{return localStorage\.getItem\(BGM_KEY\)!=="off";\}/);
  assert.match(page, /function startAmbientLoop\(\)\{'?\s*if\(ambientLoopId\|\|!isBgmEnabled\(\)\)return;/);
  const shopBlockStart = page.indexOf('document.querySelectorAll(".shop-page")');
  const shopBlock = page.slice(shopBlockStart);
  assert.match(shopBlock, /function loadBgmEnabled\(\)\{return localStorage\.getItem\(BGM_KEY\)!=="off";\}/);
  assert.match(shopBlock, /function saveBgmEnabled\(v\)\{localStorage\.setItem\(BGM_KEY,v\?"on":"off"\);\}/);
  assert.match(shopBlock, /saveBgmEnabled\(v==="on"\);/);
});

test('renderLayout occasionally offers a pick-a-card bonus round after a double-up resolves, gating the spin button until it is resolved so a new spin cannot wipe it', () => {
  const page = renderLayout('<p>x</p>', {});
  assert.match(page, /function finishDoubleup\(\)\{clearTimeout\(autoCashoutId\);doubleupDone=true;doubleupDiv\.innerHTML="";maybeStartCardBonus\(\);\}/);
  assert.match(page, /function maybeStartCardBonus\(\)\{if\(Math\.random\(\)<0\.15\)\{startCardBonusRound\(function\(\)\{resetButton\(\);runBonusRoll\(\);\}\);\}else\{resetButton\(\);runBonusRoll\(\);\}\}/);
  assert.match(page, /function startCardBonusRound\(onDone\)\{/);
  // the auto-resolve safety timeout must exist so the spin button cannot get stuck disabled forever
  assert.match(page, /var autoPickId=setTimeout\(function\(\)\{/);
  assert.match(page, /clearTimeout\(autoPickId\);/);
});

test('renderLayout wires up the shop coin-skin and lever-skin controls with escalating unlock costs', () => {
  const page = renderLayout('<p>x</p>', {});
  const shopBlockStart = page.indexOf('document.querySelectorAll(".shop-page")');
  const shopBlock = page.slice(shopBlockStart);
  assert.match(shopBlock, /var COINSKIN_COST=300;/);
  assert.match(shopBlock, /var LEVERSKIN_COST=300;/);
  assert.match(shopBlock, /function renderCoinSkinItem\(\)\{/);
  assert.match(shopBlock, /function renderLeverSkinItem\(\)\{/);
  assert.match(shopBlock, /saveActiveCoinSkin\(id\);/);
  assert.match(shopBlock, /saveActiveLeverSkin\(id\);/);
});
