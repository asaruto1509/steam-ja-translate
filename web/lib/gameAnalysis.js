'use strict';

async function fetchGameAnalysis(name, deps) {
  var found = await deps.searchGame(name);
  if (!found) {
    return { found: null, priceDetail: null, reviewSummary: null, gameContext: null, analysis: null };
  }

  var priceDetail = await deps.fetchPriceDetail(found.id);
  var reviewSummary = await deps.fetchReviewSummary(found.id);
  var gameContext = await deps.fetchGameContext(found.id);
  var analysis = null;

  if (deps.apiKey) {
    var reviews = await deps.fetchReviewTexts(found.id, 15);
    if (reviews.length) {
      var prompt = deps.buildAnalysisPrompt(found.name, reviews, gameContext);
      var raw = await deps.fetchChatReply(prompt, deps.apiKey, { webSearch: false });
      analysis = deps.parseAnalysis(raw);
    }
  }

  return { found: found, priceDetail: priceDetail, reviewSummary: reviewSummary, gameContext: gameContext, analysis: analysis };
}

module.exports = { fetchGameAnalysis: fetchGameAnalysis };
