'use strict';

// 既存のbackground.js内checkWishlistPricesと同じロジック(閾値未満の下落ではhistを更新しない)を
// ブラウザ非依存のNode.js純粋関数として移植したもの。
function detectPriceDrops(items, history, minDiscountPct) {
  var drops = [];
  var updatedHistory = Object.assign({}, history);
  items.forEach(function (item) {
    var prev = updatedHistory[item.id];
    if (prev != null && item.price < prev) {
      var dropPct = prev > 0 ? Math.round((prev - item.price) / prev * 100) : 0;
      if (dropPct >= minDiscountPct) {
        drops.push({ id: item.id, name: item.name, prevPrice: prev, price: item.price, dropPct: dropPct });
        updatedHistory[item.id] = item.price;
      }
      // 閾値未満の下落はhistを更新しない。何日も積み重なった末の大きな値下げを検知できるようにするため。
    } else if (prev !== item.price) {
      updatedHistory[item.id] = item.price;
    }
  });
  return { drops: drops, updatedHistory: updatedHistory };
}

module.exports = { detectPriceDrops: detectPriceDrops };
