'use strict';

// レビュー0件の「実在するゲーム」ばかり当たると価格だけのカードに落ちてしまうため、
// cronの日替わりおすすめ(scripts/recommend-games.js)と同じ「レビューがある候補を優先」方式に揃える。
// 最終的に3件選ぶが、そのために少し多めの候補を検査してレビュー有無で並べ替える。
var CANDIDATE_COUNT = 8;
var CANDIDATE_MAX_CHECKS = 25;
var MIN_REVIEWS = 3;

async function handleRecommendCommand(interaction, deps) {
  await interaction.deferReply();
  var pool = await deps.fetchFeaturedPool();
  var shuffled = deps.pickRandomGames(pool, pool.length);
  var candidates = await deps.pickRealGames(shuffled, CANDIDATE_COUNT, deps.isRealGame, CANDIDATE_MAX_CHECKS);
  var apiKey = process.env.ONEMIN_API_KEY;

  var reviewsByGameId = {};
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    try {
      reviewsByGameId[c.id] = await deps.fetchReviews(c.id, 15);
    } catch (e) {
      reviewsByGameId[c.id] = [];
    }
  }

  var picked = deps.pickAnalyzableGames(candidates, 3, reviewsByGameId, MIN_REVIEWS);

  for (var j = 0; j < picked.length; j++) {
    var g = picked[j];
    var reviews = reviewsByGameId[g.id] || [];
    try {
      g.analysis = (apiKey && reviews.length) ? await deps.fetchGameAnalysis(g.name, reviews, apiKey) : null;
    } catch (e) {
      g.analysis = null;
    }
  }

  var embeds = [deps.buildHeaderEmbed(picked.length)].concat(deps.buildRecommendEmbeds(picked));
  await interaction.editReply({ embeds: embeds });
}

module.exports = { handleRecommendCommand: handleRecommendCommand };
