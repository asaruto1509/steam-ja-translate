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

module.exports = { searchGame: searchGame, fetchPriceDetail: fetchPriceDetail };
