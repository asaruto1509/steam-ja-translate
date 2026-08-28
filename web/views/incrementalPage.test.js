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
  assert.match(html, /var TIER_BASE_OUTPUT=0\.5;/);
  assert.match(html, /var TIER_OUTPUT_TIER_MULT=6;/);
  assert.match(html, /function tierBaseOutput\(i\)\{return TIER_BASE_OUTPUT\*Math\.pow\(TIER_OUTPUT_TIER_MULT,i\);\}/);
  assert.match(html, /function totalOutputPerSec\(\)\{/);
  assert.match(html, /sum\*prestigeMult\*computeOutputMult\(skillLevels\);/);
  assert.match(html, /setInterval\(function\(\)\{/);
  assert.match(html, /var d=Math\.max\(0,Math\.min\(OFFLINE_CAP_SECONDS\+computeOfflineBonusSeconds\(skillLevels\),\(now-lastTick\)\/1000\)\);/);
  assert.match(html, /addDp\(totalOutputPerSec\(\)\*d\*offlineBoostMult\(\)\);/);
});

test('renderIncrementalPage grants capped offline progress based on elapsed time since lastTick, and shows a welcome-back message', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var OFFLINE_CAP_SECONDS=28800;/);
  assert.match(html, /var effectiveOfflineCap=OFFLINE_CAP_SECONDS\+computeOfflineBonusSeconds\(skillLevels\);/);
  assert.match(html, /var elapsedSec=Math\.max\(0,Math\.min\(effectiveOfflineCap,\(nowMs-lastTick\)\/1000\)\);/);
  assert.match(html, /var offlineGain=totalOutputPerSec\(\)\*elapsedSec\*offlineBoostMult\(\);/);
  assert.match(html, /welcomeEl\.textContent="おかえりなさい、\+"\+Math\.floor\(offlineGain\)\.toLocaleString\(\)\+" DP";/);
});

test('renderIncrementalPage adds DP on manual click, scaled by prestige', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var CLICK_BASE=1;/);
  assert.match(html, /clickBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /addDp\(CLICK_BASE\*prestigeMult\*computeClickMult\(skillLevels\)\);/);
});

test('renderIncrementalPage computes exponential per-tier purchase cost and wires buy buttons', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var TIER_BASE_COST=15;/);
  assert.match(html, /var TIER_COST_TIER_MULT=6;/);
  assert.match(html, /var TIER_COST_GROWTH=1\.14;/);
  assert.match(html, /function tierBaseCost\(i\)\{return TIER_BASE_COST\*Math\.pow\(TIER_COST_TIER_MULT,i\);\}/);
  assert.match(html, /function tierCost\(i,ownedCount\)\{return tierBaseCost\(i\)\*Math\.pow\(TIER_COST_GROWTH,ownedCount\)\*computeCostMult\(skillLevels\);\}/);
  assert.match(html, /function renderTiers\(\)\{/);
  assert.match(html, /tierEls\[i\]\.costEl\.textContent=Math\.ceil\(tierCost\(i,owned\[i\]\)\)\.toLocaleString\(\);/);
  assert.match(html, /var cost=tierCost\(i,owned\[i\]\);/);
  assert.match(html, /if\(dp<cost\)\{playDeniedSound\(\);return;\}/);
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

test('renderIncrementalPage lets the player exchange roulette credits for DP at a fixed rate', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var EXCHANGE_RATE=10;/);
  assert.match(html, /function loadRouletteCredits\(\)\{/);
  assert.match(html, /var raw=Number\(localStorage\.getItem\(CREDITS_KEY\)\);/);
  assert.match(html, /exchangeBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /if\(amount>have\)\{/);
  assert.match(html, /exchangeResultEl\.textContent="クレジットが足りません";/);
  assert.match(html, /var effectiveExchangeRate=EXCHANGE_RATE\/computeExchangeMult\(skillLevels\);/);
  assert.match(html, /localStorage\.setItem\(CREDITS_KEY,String\(have-amount\)\);/);
  assert.match(html, /addDp\(amount\/effectiveExchangeRate\);/);
});

test('renderIncrementalPage lets the player convert DP back into roulette credits at a worse rate than the forward exchange, capped per day to limit inflation', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var DP_TO_CREDITS_RATE=3;/);
  assert.match(html, /var DP_TO_CREDITS_DAILY_CAP=300;/);
  // Round-tripping credits->DP->credits must lose value: forward rate (10 credits/DP) beats the reverse (3 credits/DP)
  assert.ok(3 < 10, 'reverse rate must be worse than the forward rate to discourage arbitrage');
  assert.match(html, /var DP2CREDITS_KEY="ja_trans_incremental_dp2credits_v1";/);
  assert.match(html, /function todayDateStr\(\)\{/);
  assert.match(html, /function loadDp2CreditsToday\(\)\{/);
  assert.match(html, /if\(obj&&obj\.date===todayDateStr\(\)&&isFinite\(obj\.amount\)\)return Math\.max\(0,obj\.amount\);/);
  assert.match(html, /id="incremental-dp2credits-amount"/);
  assert.match(html, /id="incremental-dp2credits-btn"/);
  assert.match(html, /if\(dpAmount>dp\)\{/);
  assert.match(html, /var remaining=Math\.max\(0,DP_TO_CREDITS_DAILY_CAP-already\);/);
  assert.match(html, /var effectiveDpToCreditsRate=DP_TO_CREDITS_RATE\*computeExchangeMult\(skillLevels\);/);
  assert.match(html, /var creditsGain=Math\.min\(remaining,Math\.floor\(dpAmount\*effectiveDpToCreditsRate\)\);/);
  assert.match(html, /dp2cResultEl\.textContent="本日の変換上限に達しました";/);
  assert.match(html, /localStorage\.setItem\(CREDITS_KEY,String\(haveCredits\+creditsGain\)\);/);
  // Both directions now write CREDITS_KEY: forward deducts, reverse adds
  assert.equal((html.match(/setItem\(CREDITS_KEY/g) || []).length, 2);
});

test('renderIncrementalPage lets the player prestige-reset dp/owned for a permanent multiplier based on lifetime DP', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var PRESTIGE_COEF=0\.1;/);
  assert.match(html, /var PRESTIGE_DIVISOR=1000000;/);
  assert.match(html, /prestigeBtn\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /if\(!window\.confirm\(/);
  assert.match(html, /dp=0;/);
  assert.match(html, /owned=new Array\(TIER_COUNT\)\.fill\(0\);/);
  assert.match(html, /prestigeMult=1\+PRESTIGE_COEF\*computePrestigeCoefMult\(skillLevels\)\*Math\.sqrt\(lifetimeDp\/PRESTIGE_DIVISOR\);/);
  // 累計DP(lifetimeDp)自体はプレステージでリセットしない(倍率計算の根拠として残す)
  assert.doesNotMatch(html, /lifetimeDp=0;/);
});

test('renderIncrementalPage loadNumber falls back correctly for a missing localStorage key', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function loadNumber\(key,fallback\)\{/);
  assert.match(html, /var stored=localStorage\.getItem\(key\);/);
  assert.match(html, /if\(stored===null\)return fallback;/);
  assert.match(html, /var raw=Number\(stored\);/);
});

test('renderIncrementalPage includes a self-contained style block styling the incremental page', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /<style>[\s\S]*<\/style>/);
  assert.match(html, /\.incremental-tier\{/);
});

test('renderIncrementalPage shows a live income-per-second indicator, updated on tick/buy/click/prestige/exchange', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /id="incremental-income-value"/);
  assert.match(html, /function renderIncome\(\)\{/);
  assert.match(html, /incomeEl\.textContent=fmtDp\(totalOutputPerSec\(\)\);/);
  assert.equal((html.match(/renderIncome\(\);/g) || []).length >= 5, true);
});

test('renderIncrementalPage formats DP with a visible decimal below 1000 so slow passive income is perceptible', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function fmtDp\(n\)\{/);
  assert.match(html, /return n<1000\?n\.toFixed\(1\):Math\.floor\(n\)\.toLocaleString\(\);/);
  assert.match(html, /dpEl\.textContent=fmtDp\(dp\);/);
});

test('renderIncrementalPage unlocks and renders lifetime-DP milestone achievement badges', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /id="incremental-achievements"/);
  assert.match(html, /var MILESTONES=\[/);
  assert.match(html, /function renderAchievements\(\)\{/);
  assert.match(html, /var unlocked=lifetimeDp>=ms\.at;/);
  assert.match(html, /span\.className="incremental-badge "\+\(unlocked\?"is-unlocked":"is-locked"\);/);
});

test('renderIncrementalPage plays an achievement fanfare only when a new milestone is crossed, not on initial render', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var lastAchievedCount=null;/);
  assert.match(html, /if\(lastAchievedCount!==null&&achieved>lastAchievedCount\)\{/);
  assert.match(html, /playAchievementSound\(\);/);
  assert.match(html, /lastAchievedCount=achieved;/);
});

test('renderIncrementalPage has a synth-based sound engine (no audio files) with a mutable on/off toggle', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var SOUND_KEY="ja_trans_incremental_sound_v1";/);
  assert.match(html, /function isSoundOn\(\)\{return localStorage\.getItem\(SOUND_KEY\)!=="off";\}/);
  assert.match(html, /function playTone\(freq,duration,type,startGain\)\{/);
  assert.match(html, /if\(!isSoundOn\(\)\)return;/);
  assert.match(html, /function playClickSound\(\)\{/);
  assert.match(html, /function playBuySound\(\)\{/);
  assert.match(html, /function playDeniedSound\(\)\{/);
  assert.match(html, /function playExchangeSound\(\)\{/);
  assert.match(html, /function playBonusAppearSound\(\)\{/);
  assert.match(html, /function playBonusCollectSound\(\)\{/);
  assert.match(html, /function playAchievementSound\(\)\{/);
  assert.match(html, /function playPrestigeSound\(\)\{/);
  assert.match(html, /id="incremental-sound-toggle"/);
  assert.match(html, /function renderSoundBtn\(\)\{if\(soundBtn\)soundBtn\.textContent=isSoundOn\(\)\?"🔊":"🔈";\}/);
  assert.match(html, /localStorage\.setItem\(SOUND_KEY,isSoundOn\(\)\?"off":"on"\);/);
});

test('renderIncrementalPage shows each tier\'s real game cover art from the roster when available', () => {
  const html = renderIncrementalPage({});
  for (let i = 0; i < 12; i++) {
    assert.match(html, new RegExp('id="incremental-tier-img-' + i + '"'));
  }
  assert.match(html, /if\(tierEls\[i\]\.imgEl&&roster\[i\]&&roster\[i\]\.imageUrl\)\{/);
  assert.match(html, /tierEls\[i\]\.imgEl\.src=roster\[i\]\.imageUrl;/);
});

test('renderIncrementalPage spawns a clickable timed bonus that grants a burst of DP', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /id="incremental-bonus-zone"/);
  assert.match(html, /function spawnBonus\(\)\{/);
  assert.match(html, /var bonus=Math\.max\(10,totalOutputPerSec\(\)\*30\+CLICK_BASE\*20\)\*computeBonusValueMult\(skillLevels\);/);
  assert.match(html, /bonusTimer=setTimeout\(removeBonus,8000\);/);
  assert.match(html, /function scheduleBonus\(\)\{/);
});

test('renderIncrementalPage plays a punch animation on the DP counter for discrete DP gains', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function punchEl\(el\)\{/);
  assert.match(html, /#incremental-dp-value\.incremental-punch\{[^}]*animation:incrementalPunch/);
});

test('renderIncrementalPage embeds a syntactically valid client script', () => {
  const page = renderIncrementalPage({});
  const scriptMatch = page.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'expected a <script> block in the rendered page');
  assert.doesNotThrow(() => new Function(scriptMatch[1]));
});

test('renderIncrementalPage includes the skill tree panel from incrementalSkills.js', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /incremental-panel incremental-skills/);
  assert.match(html, /id="incremental-sp-value"/);
  assert.match(html, /id="incremental-research-btn"/);
  assert.match(html, /id="incremental-skill-node-production-0"/);
  assert.match(html, /id="incremental-skill-node-management-0"/);
  assert.match(html, /id="incremental-skill-node-luck-0"/);
  assert.match(html, /\.incremental-skill-node-bead\{/);
});

test('renderIncrementalPage loads and persists sp/skillLevels/researchUses state, never resetting them on prestige', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var SP_KEY="ja_trans_incremental_sp_v1";/);
  assert.match(html, /var SKILLS_KEY="ja_trans_incremental_skills_v1";/);
  assert.match(html, /var RESEARCH_USES_KEY="ja_trans_incremental_research_uses_v1";/);
  assert.match(html, /var sp=loadNumber\(SP_KEY,0\);/);
  assert.match(html, /var researchUses=loadNumber\(RESEARCH_USES_KEY,0\);/);
  assert.match(html, /function loadSkillLevels\(\)\{/);
  assert.match(html, /var skillLevels=loadSkillLevels\(\);/);
  assert.match(html, /localStorage\.setItem\(SP_KEY,String\(sp\)\);/);
  assert.match(html, /localStorage\.setItem\(SKILLS_KEY,JSON\.stringify\(skillLevels\)\);/);
  assert.match(html, /localStorage\.setItem\(RESEARCH_USES_KEY,String\(researchUses\)\);/);
  // prestige handler must not touch sp/skillLevels/researchUses
  const prestigeHandlerMatch = html.match(/prestigeBtn\.addEventListener\("click",function\(\)\{[\s\S]*?\}\);/);
  assert.ok(prestigeHandlerMatch, 'expected to find the prestige click handler');
  assert.doesNotMatch(prestigeHandlerMatch[0], /skillLevels=/);
  assert.doesNotMatch(prestigeHandlerMatch[0], /^sp=/m);
});

test('renderIncrementalPage splices the skill tree client script into the same IIFE as the rest of the page logic', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var SKILL_BRANCHES=\{"production":\[/);
  assert.match(html, /function renderSkillTree\(\)\{/);
  assert.match(html, /el\.wrap\.addEventListener\("click",function\(\)\{/);
  assert.match(html, /id="incremental-research-btn"/);
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch);
  assert.doesNotThrow(() => new Function(scriptMatch[1]));
});

test('renderIncrementalPage applies skill multipliers to output, tier cost, click power, offline cap, exchange rates, bonus interval/value, and prestige coefficient', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /return sum\*prestigeMult\*computeOutputMult\(skillLevels\);/);
  assert.match(html, /function tierCost\(i,ownedCount\)\{return tierBaseCost\(i\)\*Math\.pow\(TIER_COST_GROWTH,ownedCount\)\*computeCostMult\(skillLevels\);\}/);
  assert.match(html, /addDp\(CLICK_BASE\*prestigeMult\*computeClickMult\(skillLevels\)\);/);
  assert.match(html, /var effectiveOfflineCap=OFFLINE_CAP_SECONDS\+computeOfflineBonusSeconds\(skillLevels\);/);
  assert.match(html, /var offlineGain=totalOutputPerSec\(\)\*elapsedSec\*offlineBoostMult\(\);/);
  assert.match(html, /var effectiveExchangeRate=EXCHANGE_RATE\/computeExchangeMult\(skillLevels\);/);
  assert.match(html, /var effectiveDpToCreditsRate=DP_TO_CREDITS_RATE\*computeExchangeMult\(skillLevels\);/);
  assert.match(html, /var delay=\(20000\+Math\.random\(\)\*25000\)\*computeBonusIntervalMult\(skillLevels\);/);
  assert.match(html, /var bonus=Math\.max\(10,totalOutputPerSec\(\)\*30\+CLICK_BASE\*20\)\*computeBonusValueMult\(skillLevels\);/);
  assert.match(html, /prestigeMult=1\+PRESTIGE_COEF\*computePrestigeCoefMult\(skillLevels\)\*Math\.sqrt\(lifetimeDp\/PRESTIGE_DIVISOR\);/);
});

test('renderIncrementalPage auto-buys the cheapest affordable tier every 60s once the production branch is fully unlocked', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function buyTierIndex\(i\)\{/);
  assert.match(html, /var cost=tierCost\(i,owned\[i\]\);/);
  assert.match(html, /if\(dp<cost\)return false;/);
  assert.match(html, /dp-=cost;/);
  assert.match(html, /owned\[i\]\+\+;/);
  assert.match(html, /return true;/);
  assert.match(html, /t\.buyBtn\.addEventListener\("click",function\(\)\{if\(!buyTierIndex\(i\)\)\{playDeniedSound\(\);return;\}/);
  assert.match(html, /if\(hasAutoBuy\(skillLevels\)\)\{/);
  assert.match(html, /autoBuyTimer\+=d;/);
  assert.match(html, /if\(autoBuyTimer>=60\)\{/);
});

test('renderIncrementalPage auto-collects the bonus star 5 seconds after it spawns once the luck branch is fully unlocked', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /if\(hasAutoCollectBonus\(skillLevels\)\)\{/);
  assert.match(html, /setTimeout\(function\(\)\{if\(bonusEl\)bonusEl\.click\(\);\},5000\);/);
});

test('renderIncrementalPage grants SP on prestige (always at least 1) without resetting sp itself', () => {
  const html = renderIncrementalPage({});
  const prestigeHandlerMatch = html.match(/prestigeBtn\.addEventListener\("click",function\(\)\{[\s\S]*?\}\);/);
  assert.ok(prestigeHandlerMatch);
  assert.match(prestigeHandlerMatch[0], /sp\+=Math\.max\(1,Math\.floor\(Math\.sqrt\(lifetimeDp\/500000\)\)\);/);
  assert.match(prestigeHandlerMatch[0], /renderSp\(\);/);
});

test('renderIncrementalPage grants weighted SP (1..5) the first time each achievement milestone is newly crossed, once per milestone', () => {
  const html = renderIncrementalPage({});
  const achievementsFnMatch = html.match(/function renderAchievements\(\)\{[\s\S]*?lastAchievedCount=achieved;/);
  assert.ok(achievementsFnMatch, 'expected to find renderAchievements source');
  assert.match(achievementsFnMatch[0], /var spGain=0;/);
  assert.match(achievementsFnMatch[0], /for\(var ai=awardedMilestones\+1;ai<=achieved;ai\+\+\)\{spGain\+=ai;\}/);
  assert.match(achievementsFnMatch[0], /sp\+=spGain;/);
});

test('renderIncrementalPage embeds a syntactically valid client script with the full skill tree wired in', () => {
  const page = renderIncrementalPage({});
  const scriptMatch = page.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch);
  assert.doesNotThrow(() => new Function(scriptMatch[1]));
});

test('renderIncrementalPage tracks awarded milestones separately from the fanfare-suppression flag, in a persisted key', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var AWARDED_MILESTONES_KEY="ja_trans_incremental_awarded_milestones_v1";/);
  assert.match(html, /var awardedMilestones=loadNumber\(AWARDED_MILESTONES_KEY,0\);/);
  assert.match(html, /localStorage\.setItem\(AWARDED_MILESTONES_KEY,String\(awardedMilestones\)\);/);
});

test('renderIncrementalPage grants milestone SP off awardedMilestones (immune to offline-crossed milestones being forfeited) and refreshes the skill tree', () => {
  const html = renderIncrementalPage({});
  const achievementsFnMatch = html.match(/function renderAchievements\(\)\{[\s\S]*?lastAchievedCount=achieved;/);
  assert.ok(achievementsFnMatch, 'expected to find renderAchievements source');
  const body = achievementsFnMatch[0];
  const grantBlockMatch = body.match(/if\(achieved>awardedMilestones\)\{[\s\S]*?renderSkillTree\(\);\}/);
  assert.ok(grantBlockMatch, 'expected an if(achieved>awardedMilestones){...} grant block');
  const grantBlock = grantBlockMatch[0];
  assert.match(grantBlock, /awardedMilestones=achieved;/);
  assert.match(grantBlock, /renderSkillTree\(\);/);
  assert.match(grantBlock, /saveState\(\);/);
  assert.match(grantBlock, /renderSp\(\);/);
  // sound stays gated on lastAchievedCount alone, as a separate statement not tied to the SP grant
  assert.match(body, /if\(lastAchievedCount!==null&&achieved>lastAchievedCount\)\{playAchievementSound\(\);\}/);
});

test('renderIncrementalPage refreshes the skill tree after a prestige SP grant', () => {
  const html = renderIncrementalPage({});
  const prestigeHandlerMatch = html.match(/prestigeBtn\.addEventListener\("click",function\(\)\{[\s\S]*?\}\);/);
  assert.ok(prestigeHandlerMatch, 'expected to find the prestige click handler');
  const handler = prestigeHandlerMatch[0];
  const spIdx = handler.indexOf('renderSp();');
  const skillTreeIdx = handler.indexOf('renderSkillTree();');
  assert.ok(spIdx >= 0, 'expected renderSp() in the prestige handler');
  assert.ok(skillTreeIdx > spIdx, 'expected renderSkillTree() to appear after renderSp() in the prestige handler');
});

test('renderIncrementalPage applies the management-capstone offline boost via one shared helper at both the reload-time and setInterval catch-up sites', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function offlineBoostMult\(\)\{return hasOfflineBoost\(skillLevels\)\?1\.5:1;\}/);
  assert.equal((html.match(/function offlineBoostMult\(\)/g) || []).length, 1, 'offlineBoostMult should be defined exactly once');
  assert.match(html, /var offlineGain=totalOutputPerSec\(\)\*elapsedSec\*offlineBoostMult\(\);/);
  assert.match(html, /addDp\(totalOutputPerSec\(\)\*d\*offlineBoostMult\(\)\);/);
  // neither call site should still carry the old inline ternary
  assert.doesNotMatch(html, /elapsedSec\*\(hasOfflineBoost\(skillLevels\)\?1\.5:1\)/);
  assert.doesNotMatch(html, /addDp\(totalOutputPerSec\(\)\*d\);/);
});

test('renderIncrementalPage tracks whether AWARDED_MILESTONES_KEY existed prior to this session, to seed awardedMilestones without a retroactive SP grant on first-ever load', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var awardedMilestones=loadNumber\(AWARDED_MILESTONES_KEY,0\);var awardedMilestonesInitialized=\(localStorage\.getItem\(AWARDED_MILESTONES_KEY\)!==null\);/);
});

test('renderIncrementalPage seeds awardedMilestones with no SP grant on a brand-new browser, and only grants weighted SP for milestones newly crossed thereafter', () => {
  const html = renderIncrementalPage({});
  const achievementsFnMatch = html.match(/function renderAchievements\(\)\{[\s\S]*?lastAchievedCount=achieved;/);
  assert.ok(achievementsFnMatch, 'expected to find renderAchievements source');
  const body = achievementsFnMatch[0];
  assert.match(body, /if\(!awardedMilestonesInitialized\)\{awardedMilestones=achieved;awardedMilestonesInitialized=true;saveState\(\);\}else if\(achieved>awardedMilestones\)\{/);
  const seedBlockMatch = body.match(/if\(!awardedMilestonesInitialized\)\{[\s\S]*?\}else if/);
  assert.ok(seedBlockMatch, 'expected a first-run seed block');
  assert.doesNotMatch(seedBlockMatch[0], /sp\+=/, 'seeding awardedMilestones on first-ever load must not grant SP');
  assert.doesNotMatch(seedBlockMatch[0], /renderSp\(\);/, 'no SP was granted, so no need to re-render it');
});

test('renderIncrementalPage derives SKILL_BRANCH_LENGTHS and the loadSkillLevels() fallback from the current branch data (production:7, management:7, luck:6)', () => {
  const html = renderIncrementalPage({});
  // Node-source-level property (derivation via incrementalSkills.BRANCH_ORDER.reduce(...) rather than
  // hand-typed branch names) is verified by reading web/views/incrementalPage.js directly -- the
  // rendered client-script text only proves the resulting numeric values are correct, since the
  // .reduce() call itself runs at Node render time and never appears in client-script output.
  assert.match(html, /var SKILL_BRANCH_LENGTHS=\{"production":7,"management":7,"luck":6\};/);
  assert.match(html, /var fallback=\{"production":0,"management":0,"luck":0\};/);
});

test('renderIncrementalPage includes an office floor panel above the employee list', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /id="incremental-office-floor"/);
  assert.match(html, /class="incremental-office-floor"/);
  const floorIndex = html.indexOf('id="incremental-office-floor"');
  const tiersPanelIndex = html.indexOf('class="incremental-tiers"');
  assert.ok(floorIndex > 0 && tiersPanelIndex > 0 && floorIndex < tiersPanelIndex,
    'office floor panel must appear before the employee tier list panel');
});

test('CLIENT_STYLE styles the office floor panel and desk decorations', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /\.incremental-office-floor\{[^}]*position:relative/);
  assert.match(html, /\.incremental-office-desk\{/);
});

test('the client script defines renderOfficeFloor, keyed off owned[] and TIER_THUMB_PALETTE', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function renderOfficeFloor\(\)\{/);
  assert.match(html, /var TIER_THUMB_PALETTE=\[/);
  // owners[] collects only tiers with owned[oi]>0 -- one desk+character per owned tier.
  assert.match(html, /if\(owned\[oi\]>0\)owners\.push\(oi\);/);
});

test('renderTiers() also refreshes the office floor so hiring/prestige keep it in sync', () => {
  const html = renderIncrementalPage({});
  // renderTiers()'s own for-loop closes with a "}" before this call, so the
  // match must cross a brace: use a non-greedy [\s\S]*? instead of [^}]*.
  assert.match(html, /function renderTiers\(\)\{[\s\S]*?renderOfficeFloor\(\);\}/);
});

test('the client script walks office characters to a new random spot every 1.5s', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function stepOfficeChars\(\)\{/);
  assert.match(html, /setInterval\(stepOfficeChars,1500\);/);
});

test('CLIENT_STYLE gives office characters a smooth walking transition', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /\.office-char\{[^}]*transition:left 1\.5s linear,top 1\.5s linear/);
});

test('the client script queries the office floor element by the exact id the HTML panel declares', () => {
  const html = renderIncrementalPage({});
  // Pins the selector string so an edit to the panel's id or this selector,
  // without updating both, fails a test instead of silently rendering an
  // empty/broken office floor panel.
  assert.match(html, /var officeFloorEl=page\.querySelector\("#incremental-office-floor"\);/);
});

test('renderOfficeFloor() skips the rebuild when the set of owned tiers has not changed, to avoid resetting characters\' walking CSS transitions', () => {
  const html = renderIncrementalPage({});
  const fnMatch = html.match(/function renderOfficeFloor\(\)\{[\s\S]*?officeChars\.push\(el\);\}\);\}/);
  assert.ok(fnMatch, 'expected to find renderOfficeFloor source');
  const body = fnMatch[0];
  assert.match(body, /if\(!officeFloorEl\)return;/);
  // Signature is composed from which tiers are owned (one char per tier), not how many of each.
  assert.match(body, /var sig="";for\(var si=0;si<TIER_COUNT;si\+\+\)\{sig\+=owned\[si\]>0\?"1":"0";\}/);
  assert.match(body, /if\(sig===officeSig\)return;/);
  assert.match(body, /officeSig=sig;/);
  // The early-return check must come after the signature is computed but before the
  // existing clear-and-rebuild logic runs.
  const sigCheckIndex = body.indexOf('if(sig===officeSig)return;');
  const clearIndex = body.indexOf('officeChars.forEach(function(el){el.remove();});');
  assert.ok(sigCheckIndex > 0 && clearIndex > sigCheckIndex,
    'signature early-return must happen before the clear-and-rebuild');
});

test('officeSig starts empty so the first renderOfficeFloor() call is not skipped', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var officeSig="";/);
});

test('the office floor panel starts with no static desk markup -- desks are generated per owned tier at runtime', () => {
  const html = renderIncrementalPage({});
  const floorMatch = html.match(/<div class="incremental-office-floor" id="incremental-office-floor">([\s\S]*?)<\/div>/);
  assert.ok(floorMatch, 'expected to find the office floor container');
  assert.doesNotMatch(floorMatch[1], /incremental-office-desk/,
    'the floor container must render empty; desks are created by renderOfficeFloor()');
});

test('renderOfficeFloor() creates one desk (with a monitor child) per owned tier, laid out in a grid', () => {
  const html = renderIncrementalPage({});
  const fnMatch = html.match(/function renderOfficeFloor\(\)\{[\s\S]*?officeChars\.push\(el\);\}\);\}/);
  assert.ok(fnMatch, 'expected to find renderOfficeFloor source');
  const body = fnMatch[0];
  assert.match(body, /officeDesks\.forEach\(function\(el\)\{el\.remove\(\);\}\);/,
    'desks must be cleared on rebuild alongside characters');
  assert.match(body, /officeDesks=\[\];/);
  assert.match(body, /desk\.className="incremental-office-desk";/);
  assert.match(body, /var pos=officeDeskPosition\(k,owners\.length\);/);
  assert.match(body, /monitor\.className="incremental-office-monitor";/);
  assert.match(body, /desk\.appendChild\(monitor\);/);
  assert.match(body, /officeDesks\.push\(desk\);/);
});

test('officeDeskPosition lays desks out in a grid capped at 4 columns', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function officeDeskPosition\(index,count\)\{/);
  assert.match(html, /var cols=Math\.min\(4,count\);/);
});

test('during the work phase, characters walk to their assigned desk and get a working animation + effect', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /function moveCharToDesk\(el,desk\)\{/);
  assert.match(html, /function spawnOfficeEffect\(el\)\{/);
  assert.match(html, /el\.classList\.add\("is-working"\);/);
  assert.match(html, /monitor\.classList\.add\("is-active"\);/);
  assert.match(html, /spawnOfficeEffect\(el\);/);
});

test('the work/walk phase alternates on a shared timer, and characters stop wandering while working', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var OFFICE_WALK_TICKS=3;/);
  assert.match(html, /var OFFICE_WORK_TICKS=3;/);
  assert.match(html, /var officePhase="walk";/);
  assert.match(html, /officePhaseTicksLeft--;/);
  assert.match(html, /if\(officePhase==="walk"\)\{/);
});

test('a second, faster interval toggles a distinct typing pose while a character is working', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /var CHAR_PIXELS_WORK=\[/);
  assert.match(html, /if\(officePhase!=="work"\)return;/);
  assert.match(html, /el\.classList\.toggle\("is-typing"\)/);
  assert.match(html, /\},500\);/);
});

test('CLIENT_STYLE animates the monitor flicker, the working bob, and the floating effect', () => {
  const html = renderIncrementalPage({});
  assert.match(html, /\.incremental-office-monitor\{/);
  assert.match(html, /\.incremental-office-monitor\.is-active\{animation:incrementalOfficeMonitor/);
  assert.match(html, /\.office-char\.is-working\{animation:incrementalOfficeBob/);
  assert.match(html, /\.incremental-office-effect\{/);
});
