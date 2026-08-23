'use strict';

function pickWinner(candidates, rng) {
  rng = rng || Math.random;
  return Math.floor(rng() * candidates.length);
}

function buildSpinPayload(candidates, winnerIndex) {
  return {
    candidates: candidates.map(function (c) {
      return { id: c.id, name: c.name, imageUrl: c.imageUrl };
    }),
    winnerIndex: winnerIndex
  };
}

// 直前のスピンで出た候補を除外したプールを返す。除外後にminCount未満しか残らない場合は
// (全体プールが小さいモード等で毎回除外し尽くしてしまうため)除外せず元のプールを返す。
function excludeRecentlyShown(pool, recentIds, minCount) {
  var excluded = pool.filter(function (item) {
    return recentIds.indexOf(item.id) === -1;
  });
  return excluded.length >= minCount ? excluded : pool;
}

module.exports = {
  pickWinner: pickWinner,
  buildSpinPayload: buildSpinPayload,
  excludeRecentlyShown: excludeRecentlyShown
};
