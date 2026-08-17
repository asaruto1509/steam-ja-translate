'use strict';

async function handleRecommendCommand(interaction, deps) {
  await interaction.deferReply();
  var pool = await deps.fetchFeaturedPool();
  var picked = deps.pickRandomGames(pool, 3);
  var apiKey = process.env.ONEMIN_API_KEY;

  for (var i = 0; i < picked.length; i++) {
    var g = picked[i];
    try {
      var reviews = await deps.fetchReviews(g.id, 15);
      g.analysis = (apiKey && reviews.length) ? await deps.fetchGameAnalysis(g.name, reviews, apiKey) : null;
    } catch (e) {
      g.analysis = null;
    }
  }

  var embeds = [deps.buildHeaderEmbed(picked.length)].concat(deps.buildRecommendEmbeds(picked));
  await interaction.editReply({ embeds: embeds });
}

module.exports = { handleRecommendCommand: handleRecommendCommand };
