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

module.exports = {
  pickWinner: pickWinner,
  buildSpinPayload: buildSpinPayload
};
