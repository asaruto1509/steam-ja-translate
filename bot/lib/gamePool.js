'use strict';

// Steamのfeaturedcategories/specials一覧は数値typeだけではDLCを本編ゲームと区別できないため、
// appdetailsのtype==='game'判定(isRealGameFn)で候補を検査しながらcount件集める。
async function pickRealGames(candidates, count, isRealGameFn, maxChecks) {
  maxChecks = maxChecks || candidates.length;
  var picked = [];
  for (var i = 0; i < candidates.length && i < maxChecks && picked.length < count; i++) {
    if (await isRealGameFn(candidates[i].id)) picked.push(candidates[i]);
  }
  return picked;
}

module.exports = { pickRealGames: pickRealGames };
