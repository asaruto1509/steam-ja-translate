'use strict';

// Steam公開検索API。認証不要、ゲーム名から先頭一致のappidを取る。
async function searchGame(name) {
  var r = await fetch('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(name) + '&cc=jp&l=japanese');
  if (!r.ok) return null;
  var d = await r.json();
  var items = d.items || [];
  if (!items.length) return null;
  var it = items[0];
  return { id: String(it.id), name: it.name };
}

// オートコンプリート用。先頭一致に限らずAPIが返す候補をそのまま複数件返す。
async function searchGameChoices(name) {
  var r = await fetch('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(name) + '&cc=jp&l=japanese');
  if (!r.ok) return [];
  var d = await r.json();
  var items = d.items || [];
  return items.map(function (it) { return { id: String(it.id), name: it.name }; });
}

// check-wishlist-prices.jsのfetchPriceは価格のみでdiscount_percent/originalPriceを持たないため、
// /price・/wishlistコマンド用に割引情報込みで別途取得する専用関数(scripts/*.jsは変更しない方針のため)。
async function fetchPriceDetail(appid) {
  var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,price_overview&cc=jp&l=japanese');
  if (!r.ok) return null;
  var d = await r.json();
  var info = d && d[appid] && d[appid].data;
  if (!info) return null;
  var po = info.price_overview;
  if (!po) return { id: String(appid), name: info.name, finalPrice: 0, originalPrice: 0, discountPercent: 0 };
  return {
    id: String(appid),
    name: info.name,
    finalPrice: Math.floor(po.final / 100),
    originalPrice: Math.floor(po.initial / 100),
    discountPercent: po.discount_percent || 0
  };
}

// /reviewのポジティブ率表示用。AIの推測ではなくSteamの実レビュー集計をそのまま使う。
async function fetchReviewSummary(appid) {
  var r = await fetch('https://store.steampowered.com/appreviews/' + appid + '?json=1&num_per_page=0&purchase_type=all');
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
  var r = await fetch('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=' + appid);
  if (!r.ok) return null;
  var d = await r.json();
  var count = d.response && d.response.player_count;
  return typeof count === 'number' ? count : null;
}

async function fetchAchievementStats(appid) {
  var r = await fetch('https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=' + appid);
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
  var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=genres,categories&cc=jp&l=japanese');
  if (!r.ok) return null;
  var d = await r.json();
  var info = d && d[appid] && d[appid].data;
  if (!info) return null;
  return {
    genres: (info.genres || []).map(function (g) { return g.description; }),
    categories: (info.categories || []).map(function (c) { return c.description; })
  };
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
  headerImageUrl: headerImageUrl,
  storeUrl: storeUrl
};
