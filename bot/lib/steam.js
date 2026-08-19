'use strict';
var fetchWithTimeout = require('./fetchWithTimeout.js').fetchWithTimeout;

// Steam公開検索API。認証不要、ゲーム名から先頭一致のappidを取る。
async function searchGame(name) {
  var r = await fetchWithTimeout('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(name) + '&cc=jp&l=japanese');
  if (!r.ok) return null;
  var d = await r.json();
  var items = d.items || [];
  if (!items.length) return null;
  var it = items[0];
  return { id: String(it.id), name: it.name };
}

// オートコンプリート用。先頭一致に限らずAPIが返す候補をそのまま複数件返す。
async function searchGameChoices(name) {
  var r = await fetchWithTimeout('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(name) + '&cc=jp&l=japanese');
  if (!r.ok) return [];
  var d = await r.json();
  var items = d.items || [];
  return items.map(function (it) { return { id: String(it.id), name: it.name }; });
}

// check-wishlist-prices.jsのfetchPriceは価格のみでdiscount_percent/originalPriceを持たないため、
// /price・/wishlistコマンド用に割引情報込みで別途取得する専用関数(scripts/*.jsは変更しない方針のため)。
async function fetchPriceDetail(appid) {
  var r = await fetchWithTimeout('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,price_overview&cc=jp&l=japanese');
  if (!r.ok) return null;
  var d = await r.json();
  var info = d && d[appid] && d[appid].data;
  if (!info) return null;
  var po = info.price_overview;
  if (!po) return { id: String(appid), name: info.name, finalPrice: 0, originalPrice: 0, discountPercent: 0, shortDescription: info.short_description || null };
  // 一部タイトルはcc=jp指定でも円建て価格が無くドル等のまま返ってくることがあるため、
  // 通貨がJPYでなければ「価格取得不可」として扱う(誤った円換算表示を避ける)。
  if (po.currency !== 'JPY') return null;
  return {
    id: String(appid),
    name: info.name,
    finalPrice: Math.floor(po.final / 100),
    originalPrice: Math.floor(po.initial / 100),
    discountPercent: po.discount_percent || 0,
    shortDescription: info.short_description || null
  };
}

// /reviewのポジティブ率表示用。AIの推測ではなくSteamの実レビュー集計をそのまま使う。
async function fetchReviewSummary(appid) {
  var r = await fetchWithTimeout('https://store.steampowered.com/appreviews/' + appid + '?json=1&num_per_page=0&purchase_type=all');
  if (!r.ok) return null;
  var d = await r.json();
  var qs = d.query_summary;
  if (!qs || !qs.total_reviews) return null;
  return {
    positivePct: Math.round((qs.total_positive / qs.total_reviews) * 100),
    totalReviews: qs.total_reviews
  };
}

// /stats用。キー不要の公開Steam Web API。
async function fetchPlayerCount(appid) {
  var r = await fetchWithTimeout('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=' + appid);
  if (!r.ok) return null;
  var d = await r.json();
  var count = d.response && d.response.player_count;
  return typeof count === 'number' ? count : null;
}

async function fetchAchievementStats(appid) {
  var r = await fetchWithTimeout('https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=' + appid);
  if (!r.ok) return null;
  var d = await r.json();
  var list = d.achievementpercentages && d.achievementpercentages.achievements;
  if (!list || !list.length) return null;
  var total = 0;
  var rarest = list[0];
  list.forEach(function (a) {
    var pct = parseFloat(a.percent);
    total += pct;
    if (pct < parseFloat(rarest.percent)) rarest = a;
  });
  return {
    count: list.length,
    avgUnlockPct: total / list.length,
    rarest: { name: rarest.name, percent: parseFloat(rarest.percent) }
  };
}

// /reviewのAI分析に文脈を与える用。appdetailsのgenres/categoriesフィルタ。
async function fetchGameContext(appid) {
  var r = await fetchWithTimeout('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=genres,categories&cc=jp&l=japanese');
  if (!r.ok) return null;
  var d = await r.json();
  var info = d && d[appid] && d[appid].data;
  if (!info) return null;
  return {
    genres: (info.genres || []).map(function (g) { return g.description; }),
    categories: (info.categories || []).map(function (c) { return c.description; })
  };
}

// /news用。キー不要の公開Steam Web API。BBCode/HTMLタグは簡易除去してAIに渡す。
async function fetchLatestNews(appid) {
  var r = await fetchWithTimeout('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=' + appid + '&count=1&maxlength=3000');
  if (!r.ok) return null;
  var d = await r.json();
  var items = d.appnews && d.appnews.newsitems;
  if (!items || !items.length) return null;
  var it = items[0];
  var contents = (it.contents || '').replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>/g, '').trim();
  if (!contents) return null;
  return { title: it.title, url: it.url, date: it.date, contents: contents };
}

// /sales・/gacha用。featuredcategoriesのspecials枠(値下げ中タイトル一覧)。
async function fetchSpecialsPool() {
  var r = await fetchWithTimeout('https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese');
  if (!r.ok) return [];
  var d = await r.json();
  var items = (d.specials && d.specials.items) || [];
  return items
    .filter(function (it) { return it.type === 0 && it.currency === 'JPY'; })
    .map(function (it) {
      return {
        id: String(it.id),
        name: it.name,
        finalPrice: Math.floor((it.final_price || 0) / 100),
        originalPrice: Math.floor((it.original_price || it.final_price || 0) / 100),
        discountPercent: it.discount_percent || 0
      };
    });
}

// /upcoming用。featuredcategoriesのcoming_soon枠。
async function fetchUpcomingPool() {
  var r = await fetchWithTimeout('https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese');
  if (!r.ok) return [];
  var d = await r.json();
  var items = (d.coming_soon && d.coming_soon.items) || [];
  return items
    .filter(function (it) { return it.type === 0; })
    .map(function (it) { return { id: String(it.id), name: it.name }; });
}

// /challenge用。fetchAchievementStatsと同じAPIから、レア実績を複数件返す。
async function fetchRareAchievements(appid, count) {
  var r = await fetchWithTimeout('https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=' + appid);
  if (!r.ok) return [];
  var d = await r.json();
  var list = d.achievementpercentages && d.achievementpercentages.achievements;
  if (!list || !list.length) return [];
  return list
    .map(function (a) { return { name: a.name, percent: parseFloat(a.percent) }; })
    .sort(function (a, b) { return a.percent - b.percent; })
    .slice(0, count);
}

// おすすめ系プールにDLCが紛れる問題の対策。featuredcategoriesの数値typeだけでは
// DLCと本編を区別できないため、appdetailsの文字列type("game"/"dlc"等)で最終確認する。
// ついでに価格が円建てで取得できるかも確認し、ドル建てのまま円表示される誤表示も防ぐ。
async function isRealGame(appid) {
  var r = await fetchWithTimeout('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,price_overview&cc=jp&l=japanese');
  if (!r.ok) return false;
  var d = await r.json();
  var info = d && d[appid] && d[appid].data;
  if (!info || info.type !== 'game') return false;
  if (info.price_overview && info.price_overview.currency !== 'JPY') return false;
  return true;
}

async function fetchReviewPage(appid, count, language, type) {
  var url = 'https://store.steampowered.com/appreviews/' + appid + '?json=1&num_per_page=' + count + '&language=' + language + '&purchase_type=all'
    + (type ? '&review_type=' + type : '&filter=recent');
  var r = await fetchWithTimeout(url);
  if (!r.ok) return [];
  var d = await r.json();
  return (d.reviews || []).map(function (rv) { return rv.review; }).filter(Boolean);
}

// 日本語レビューだけでは母数が少なすぎるゲームがあるため、不足分を全言語レビューで補って
// AI分析の精度を上げる(要約自体はプロンプト側で日本語出力を指示しているので元言語は問わない)。
function mergeReviewTexts(primary, fallback, count) {
  var merged = primary.slice();
  for (var i = 0; i < fallback.length && merged.length < count; i++) {
    if (merged.indexOf(fallback[i]) === -1) merged.push(fallback[i]);
  }
  return merged;
}

// /review・/quiz・/recommend・/hype・/urbanlegend用。日本語優先、不足時は全言語で補完する。
async function fetchReviewTexts(appid, count) {
  var japanese = await fetchReviewPage(appid, count, 'japanese', null);
  if (japanese.length >= count) return japanese;
  var all = await fetchReviewPage(appid, count, 'all', null);
  return mergeReviewTexts(japanese, all, count);
}

// /battle・/redesign用。討論/企画書を成立させるため好評/不評レビューを別々に取得する。
async function fetchOpposingReviews(appid, count) {
  async function fetchSide(type) {
    var japanese = await fetchReviewPage(appid, count, 'japanese', type);
    if (japanese.length >= count) return japanese;
    var all = await fetchReviewPage(appid, count, 'all', type);
    return mergeReviewTexts(japanese, all, count);
  }
  var positive = await fetchSide('positive');
  var negative = await fetchSide('negative');
  return { positive: positive, negative: negative };
}

function headerImageUrl(appid) {
  return 'https://cdn.akamai.steamstatic.com/steam/apps/' + appid + '/header.jpg';
}

function storeUrl(appid) {
  return 'https://store.steampowered.com/app/' + appid + '/';
}

module.exports = {
  searchGame: searchGame,
  searchGameChoices: searchGameChoices,
  fetchPriceDetail: fetchPriceDetail,
  fetchReviewSummary: fetchReviewSummary,
  fetchPlayerCount: fetchPlayerCount,
  fetchAchievementStats: fetchAchievementStats,
  fetchGameContext: fetchGameContext,
  fetchLatestNews: fetchLatestNews,
  fetchSpecialsPool: fetchSpecialsPool,
  fetchUpcomingPool: fetchUpcomingPool,
  fetchRareAchievements: fetchRareAchievements,
  isRealGame: isRealGame,
  mergeReviewTexts: mergeReviewTexts,
  fetchReviewTexts: fetchReviewTexts,
  fetchOpposingReviews: fetchOpposingReviews,
  headerImageUrl: headerImageUrl,
  storeUrl: storeUrl
};
