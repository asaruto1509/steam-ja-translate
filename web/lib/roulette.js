'use strict';

// 3リール共通の「当たり/ハズレ」抽選。rngはこの順で消費する:
// 1) 候補プールから当選ゲームのindexを1回抽選
// 2) 当たり/ハズレ判定に1回消費(winRate未満なら当たり)
// 3) ハズレの場合のみ、2本目・3本目のリールが止まる位置をそれぞれ1回ずつ抽選
//    (1本目の当選indexと必ず異なる位置になるよう調整するが、rng消費自体は追加しない)
// 候補が1件しかない場合はハズレを表現しようがないため常に当たり扱いにする。
function pickTripleResult(candidates, rng, winRate) {
  rng = rng || Math.random;
  // 当初75%だったが、当選のたびに増える払い出しと組み合わせると残高が際限なく増え続け
  // 「ギャンブル」としての緊張感がなくなる(ユーザー指摘)。40%に引き下げる。
  winRate = typeof winRate === 'number' ? winRate : 0.4;
  var winnerIndex = Math.floor(rng() * candidates.length);
  var hit = candidates.length <= 1 ? true : rng() < winRate;
  if (hit) {
    return { hit: true, reelIndexes: [winnerIndex, winnerIndex, winnerIndex], winnerIndex: winnerIndex };
  }
  var second = Math.floor(rng() * candidates.length);
  if (second === winnerIndex) second = (second + 1) % candidates.length;
  var third = Math.floor(rng() * candidates.length);
  if (third === winnerIndex && third === second) third = (third + 1) % candidates.length;
  return { hit: false, reelIndexes: [winnerIndex, second, third], winnerIndex: null };
}

// 直前のスピンで出た候補を除外したプールを返す。除外後にminCount未満しか残らない場合は
// (全体プールが小さいモード等で毎回除外し尽くしてしまうため)除外せず元のプールを返す。
function excludeRecentlyShown(pool, recentIds, minCount) {
  var excluded = pool.filter(function (item) {
    return recentIds.indexOf(item.id) === -1;
  });
  return excluded.length >= minCount ? excluded : pool;
}

function buildSpinPayload(candidates, result) {
  return {
    candidates: candidates.map(function (c) {
      return { id: c.id, name: c.name, imageUrl: c.imageUrl };
    }),
    hit: result.hit,
    reelIndexes: result.reelIndexes,
    winnerIndex: result.winnerIndex
  };
}

module.exports = {
  pickTripleResult: pickTripleResult,
  excludeRecentlyShown: excludeRecentlyShown,
  buildSpinPayload: buildSpinPayload
};
