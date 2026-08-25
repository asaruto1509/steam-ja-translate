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
  assert.match(html, /sum\*prestigeMult;/);
  assert.match(html, /setInterval\(function\(\)\{/);
  assert.match(html, /var d=Math\.max\(0,Math\.min\(OFFLINE_CAP_SECONDS,\(now-lastTick\)\/1000\)\);/);
  assert.match(html, /addDp\(totalOutputPerSec\(\)\*d\);/);
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
  assert.match(html, /localStorage\.setItem\(CREDITS_KEY,String\(have-amount\)\);/);
  assert.match(html, /addDp\(amount\/EXCHANGE_RATE\);/);
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
  assert.match(html, /var creditsGain=Math\.min\(remaining,Math\.floor\(dpAmount\*DP_TO_CREDITS_RATE\)\);/);
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
  assert.match(html, /prestigeMult=1\+PRESTIGE_COEF\*Math\.sqrt\(lifetimeDp\/PRESTIGE_DIVISOR\);/);
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
  assert.match(html, /if\(lastAchievedCount!==null&&achieved>lastAchievedCount\)\{playAchievementSound\(\);\}/);
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
  assert.match(html, /var bonus=Math\.max\(10,totalOutputPerSec\(\)\*30\+CLICK_BASE\*20\);/);
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
