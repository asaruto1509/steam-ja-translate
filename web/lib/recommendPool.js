'use strict';

// おすすめルーレット専用の候補プール取得。
// featuredcategories(top_sellers+new_releases+specials)だけだと実測46件程度しかなく、
// 16件ずつ表示するルーレットは3スピン目には過半数が既出になる(実機確認済み: 6連続スピンで
// spin3=16件中11件既出、spin6=16件中16件既出=完全一巡)。ストア検索一覧(category1=998=ゲーム)
// をページングして数百件規模の候補を確保し、根本的にプールを拡張する。
// scripts/**は変更禁止のためfeaturedcategories取得は独自実装として維持する。
function extractItems(data, key) {
  var items = (data[key] && data[key].items) || [];
  return items.filter(function (it) { return it.type === 0; }).map(function (it) {
    return {
      id: String(it.id),
      name: it.name,
      image: it.large_capsule_image || it.header_image || null
    };
  });
}

// search/resultsのjson=1レスポンスはappidを直接返さないが、logo画像URLの
// .../steam/apps/{appid}/... の部分に埋め込まれているため、そこから抽出する。
function extractIdFromLogo(url) {
  var m = String(url || '').match(/\/steam\/apps\/(\d+)\//);
  return m ? m[1] : null;
}

function parseSearchResults(data) {
  var items = (data && data.items) || [];
  return items.map(function (it) {
    var id = extractIdFromLogo(it.logo);
    if (!id) return null;
    return { id: id, name: it.name, image: it.logo || null };
  }).filter(Boolean);
}

function dedupeById(pool) {
  var seen = {};
  return pool.filter(function (item) {
    if (seen[item.id]) return false;
    seen[item.id] = true;
    return true;
  });
}

async function fetchCatalogPage(start, count) {
  var url = 'https://store.steampowered.com/search/results/?query&start=' + start + '&count=' + count
    + '&sort_by=_ASC&category1=998&cc=jp&l=japanese&json=1';
  var r = await fetch(url);
  if (!r.ok) throw new Error('search/results取得に失敗しました(' + r.status + ')');
  var d = await r.json();
  return parseSearchResults(d);
}

// pages*countの規模でストア検索一覧を並列取得する(1ページ50件がStoreの実用上限に近いため
// 小分けにページングする)。1ページの取得失敗は無視し、成功したページ分だけ使う
// (一部ページが落ちても候補プール自体は返せるようにするため)。
async function fetchLargeCatalogPool(pages, pageSize) {
  pages = pages || 4;
  pageSize = pageSize || 50;
  var results = await Promise.all(
    Array.from({ length: pages }, function (_, i) {
      return fetchCatalogPage(i * pageSize, pageSize).catch(function () { return []; });
    })
  );
  var pool = [];
  results.forEach(function (page) { pool = pool.concat(page); });
  return dedupeById(pool);
}

// スピンのたびにfeaturedcategories+検索4ページを叩くと、テスト等で連続スピンした際に
// Steam側のレート制限(403)に引っかかる(実機で確認済み)。数分キャッシュし、キャッシュ窓の間は
// Steamに一切アクセスしない。プール自体はどのみち数分単位でしか変化しないため実害もない。
var poolCache = null;
var POOL_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchExpandedPool() {
  var now = Date.now();
  if (poolCache && (now - poolCache.at) < POOL_CACHE_TTL_MS) {
    return poolCache.pool;
  }
  var r = await fetch('https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese');
  if (!r.ok) throw new Error('featuredcategories取得に失敗しました(' + r.status + ')');
  var d = await r.json();
  var curated = []
    .concat(extractItems(d, 'top_sellers'))
    .concat(extractItems(d, 'new_releases'))
    .concat(extractItems(d, 'specials'));
  var catalog = await fetchLargeCatalogPool(4, 50);
  var pool = dedupeById(curated.concat(catalog));
  poolCache = { pool: pool, at: now };
  return pool;
}

module.exports = {
  extractItems: extractItems,
  extractIdFromLogo: extractIdFromLogo,
  parseSearchResults: parseSearchResults,
  dedupeById: dedupeById,
  fetchCatalogPage: fetchCatalogPage,
  fetchLargeCatalogPool: fetchLargeCatalogPool,
  fetchExpandedPool: fetchExpandedPool
};
