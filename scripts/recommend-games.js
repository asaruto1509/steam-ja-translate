'use strict';

var { fetchReviews } = require('./check-wishlist-prices.js');

// top_sellersとnew_releasesの両方に同じゲームが載っているケースがあるため、
// 選出前にid重複を除去する(同じゲームが1日の投稿内で2回出るのを防ぐ)。
function _dedupeById(pool) {
  var seen = {};
  return pool.filter(function (item) {
    if (seen[item.id]) return false;
    seen[item.id] = true;
    return true;
  });
}

// Fisher-Yatesシャッフルで先頭n件を返す。rngを注入可能にすることで
// テストから決定的な乱数列を渡せるようにしている。
function pickRandomGames(pool, n, rng) {
  rng = rng || Math.random;
  var arr = _dedupeById(pool).slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, n);
}

// shuffledPoolの並び順を維持したまま、reviewsByGameId[game.id]の件数がminReviews以上のものを
// 先頭にまとめ、残り(レビュー不足)を後ろに回した上でn件返す。レビューがある候補が足りない日でも
// 必ずn件返す(不足分はprice-onlyカードとして表示するため)。
function pickAnalyzableGames(shuffledPool, n, reviewsByGameId, minReviews) {
  minReviews = minReviews || 1;
  var analyzable = [];
  var leftover = [];
  shuffledPool.forEach(function (g) {
    var count = (reviewsByGameId[g.id] || []).length;
    if (count >= minReviews) {
      analyzable.push(g);
    } else {
      leftover.push(g);
    }
  });
  return analyzable.concat(leftover).slice(0, n);
}

// 本日発生した「複雑なJSONスキーマだとAIが指示文の書き写しをそのまま返す」不具合と同じ検知パターン。
// main.jsの_isLeakedStringと同じ正規表現(数値+「字以内/以上/程度」)を流用し、
// プロンプト内の文字数指示がそのまま値として書き写された場合にその項目だけを無効化する。
var LEAK_PATTERN = /\d+字(以内|以上|程度)?/;
function _isLeaked(s) {
  return typeof s === 'string' && LEAK_PATTERN.test(s);
}

function _extractJsonObject(text) {
  var match = String(text || '').match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function parseGameAnalysis(text) {
  var jsonStr = _extractJsonObject(text);
  if (!jsonStr) return null;
  var obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  var verdict = (typeof obj.verdict === 'string' && !_isLeaked(obj.verdict)) ? obj.verdict : null;
  var reason = (typeof obj.reason === 'string' && !_isLeaked(obj.reason)) ? obj.reason.slice(0, 200) : '';
  var good = Array.isArray(obj.good)
    ? obj.good.filter(function (g) { return typeof g === 'string' && !_isLeaked(g); }).slice(0, 3).map(function (g) { return g.slice(0, 200); })
    : [];
  var concern = (typeof obj.concern === 'string' && !_isLeaked(obj.concern)) ? obj.concern.slice(0, 200) : '';

  return { verdict: verdict, reason: reason, good: good, concern: concern };
}

// AI分析が失敗した場合(analysisがnull)でも、価格情報だけの簡易embedとして必ず1件は出す
// (5本中1本もAI分析が成功しなかった場合でも「紹介自体はする」という設計方針)。
function buildRecommendEmbeds(games) {
  return games.map(function (g) {
    var priceLine = g.finalPrice === 0
      ? '無料'
      : g.discountPercent > 0
        ? '~~¥' + g.originalPrice.toLocaleString() + '~~ → **¥' + g.finalPrice.toLocaleString() + '** (-' + g.discountPercent + '%)'
        : '¥' + g.finalPrice.toLocaleString();
    var fields = [{ name: '価格', value: priceLine, inline: true }];

    var a = g.analysis;
    if (a && a.verdict) fields.push({ name: 'AI判定', value: a.verdict, inline: true });
    if (a && a.reason) fields.push({ name: '理由', value: a.reason, inline: false });
    if (a && a.good && a.good.length) {
      fields.push({ name: '👍 良い点', value: a.good.map(function (x) { return '・' + x; }).join('\n'), inline: true });
    }
    if (a && a.concern) fields.push({ name: '⚠ 懸念', value: a.concern, inline: true });

    var embed = {
      title: g.name,
      url: 'https://store.steampowered.com/app/' + g.id + '/',
      color: 0x66c0f4,
      fields: fields
    };
    if (g.image) embed.thumbnail = { url: g.image };
    return embed;
  });
}

async function fetchFeaturedPool() {
  var r = await fetch('https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese');
  if (!r.ok) throw new Error('featuredcategories取得に失敗しました(' + r.status + ')');
  var d = await r.json();
  var pool = [];
  ['top_sellers', 'new_releases'].forEach(function (key) {
    var items = (d[key] && d[key].items) || [];
    items.forEach(function (it) {
      // typeが0以外(パッケージ/バンドル等)はレビューが存在せずストアリンクも無効なため除外する
      if (it.type !== 0) return;
      pool.push({
        id: String(it.id),
        name: it.name,
        finalPrice: Math.floor((it.final_price || 0) / 100),
        originalPrice: Math.floor((it.original_price || it.final_price || 0) / 100),
        discountPercent: it.discount_percent || 0,
        image: it.large_capsule_image || it.header_image || null
      });
    });
  });
  return pool;
}

// check-wishlist-prices.jsのfetchReviewsはlanguage=japanese固定でシグネチャ変更不可のため、
// 0件だった場合だけこちらで全言語版を追加取得する(そのファイル自体は一切変更しない)。
async function fetchReviewsWithFallback(appid, count) {
  var reviews = await fetchReviews(appid, count);
  if (reviews.length) return reviews;
  try {
    var r = await fetch('https://store.steampowered.com/appreviews/' + appid
      + '?json=1&num_per_page=' + (count || 15) + '&language=all&filter=recent&purchase_type=all');
    if (!r.ok) return [];
    var d = await r.json();
    return (d.reviews || []).map(function (rv) { return rv.review; }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function fetchGameAnalysis(gameName, reviewTexts, apiKey) {
  if (!reviewTexts.length) return null;
  var joined = reviewTexts.join('\n---\n').slice(0, 3000);
  var prompt = 'あなたはSteamゲームレビューの要約AIです。以下は「' + gameName + '」のユーザーレビュー抜粋です。\n'
    + '次のJSON形式のみで回答してください。説明文やコードブロックは不要です。\n'
    + '{"verdict":"今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか","reason":"一言理由(20字程度)","good":["良い点1(15字程度)","良い点2(15字程度)"],"concern":"懸念点(15字程度、無ければ空文字)"}\n\n'
    + 'レビュー:\n' + joined;
  var body = {
    type: 'UNIFY_CHAT_WITH_AI',
    model: 'qwen3-8b',
    promptObject: { prompt: prompt, settings: { historySettings: { isMixed: false, historyMessageLimit: 0 }, webSearchSettings: { webSearch: false } } }
  };
  var r = await fetch('https://api.1min.ai/api/chat-with-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-KEY': apiKey },
    body: JSON.stringify(body)
  });
  var d = await r.json();
  if (!r.ok || d.errorCode) throw new Error(d.message || String(r.status));
  var text = (d.aiRecord && d.aiRecord.aiRecordDetail && d.aiRecord.aiRecordDetail.resultObject && d.aiRecord.aiRecordDetail.resultObject[0]) || '';
  return parseGameAnalysis(text);
}

async function sendDiscordEmbeds(embeds, webhookUrl) {
  var r = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '🎮 今日のおすすめゲーム', embeds: embeds })
  });
  if (!r.ok) throw new Error('Discord webhook送信に失敗しました(' + r.status + ')');
}

async function main() {
  var webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  var apiKey = process.env.ONEMIN_API_KEY;
  var pickCount = Number(process.env.RECOMMEND_COUNT || 5);
  if (!pickCount || pickCount < 1) pickCount = 5;

  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL は必須です');
    process.exit(1);
  }

  var pool = await fetchFeaturedPool();
  console.log('候補プール件数: ' + pool.length);
  if (!pool.length) {
    console.error('候補プールが0件でした');
    process.exit(1);
  }

  var shuffled = pickRandomGames(pool, pool.length);
  var reviewsByGameId = {};
  var analyzedCount = 0;
  for (var i = 0; i < shuffled.length; i++) {
    var sg = shuffled[i];
    try {
      reviewsByGameId[sg.id] = await fetchReviewsWithFallback(sg.id, 15);
    } catch (e) {
      reviewsByGameId[sg.id] = [];
    }
  }

  var picked = pickAnalyzableGames(shuffled, pickCount, reviewsByGameId, 3);
  console.log('選出件数: ' + picked.length);
  console.log('レビュー3件以上の候補: ' + Object.keys(reviewsByGameId).filter(function (id) { return reviewsByGameId[id].length >= 3; }).length + '/' + shuffled.length);

  if (!apiKey) {
    console.warn('ONEMIN_API_KEY が未設定のため、全ゲームがAI分析なしで表示されます');
  }

  for (var j = 0; j < picked.length; j++) {
    var pg = picked[j];
    var reviews = reviewsByGameId[pg.id] || [];
    try {
      pg.analysis = (apiKey && reviews.length) ? await fetchGameAnalysis(pg.name, reviews, apiKey) : null;
      if (pg.analysis) analyzedCount++;
    } catch (e) {
      console.error('AI分析失敗(appid=' + pg.id + '): ' + e.message);
      pg.analysis = null;
    }
  }
  console.log('AI分析成功: ' + analyzedCount + '/' + picked.length);

  var embeds = buildRecommendEmbeds(picked);
  await sendDiscordEmbeds(embeds, webhookUrl);
  console.log('Discord通知を送信しました');
}

if (require.main === module) {
  main().catch(function (e) {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  pickRandomGames: pickRandomGames,
  pickAnalyzableGames: pickAnalyzableGames,
  parseGameAnalysis: parseGameAnalysis,
  buildRecommendEmbeds: buildRecommendEmbeds,
  fetchFeaturedPool: fetchFeaturedPool,
  fetchGameAnalysis: fetchGameAnalysis,
  sendDiscordEmbeds: sendDiscordEmbeds,
  main: main
};
