'use strict';

// おすすめルーレット専用の候補プール取得。既存のscripts/recommend-games.jsの
// fetchFeaturedPool(top_sellers+new_releasesのみ、計30件台)は候補数がルーレットの
// 表示件数(16件)に対して小さすぎ、回すたびにほぼ同じ顔ぶれが出てしまう(実機確認済み)。
// specialsカテゴリも合わせて取り込みプールを拡張する。scripts/**は変更禁止のため
// 同じfeaturedcategories APIを独自に叩く専用実装として新規に用意する。
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

function dedupeById(pool) {
  var seen = {};
  return pool.filter(function (item) {
    if (seen[item.id]) return false;
    seen[item.id] = true;
    return true;
  });
}

async function fetchExpandedPool() {
  var r = await fetch('https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese');
  if (!r.ok) throw new Error('featuredcategories取得に失敗しました(' + r.status + ')');
  var d = await r.json();
  var pool = []
    .concat(extractItems(d, 'top_sellers'))
    .concat(extractItems(d, 'new_releases'))
    .concat(extractItems(d, 'specials'));
  return dedupeById(pool);
}

module.exports = {
  extractItems: extractItems,
  dedupeById: dedupeById,
  fetchExpandedPool: fetchExpandedPool
};
