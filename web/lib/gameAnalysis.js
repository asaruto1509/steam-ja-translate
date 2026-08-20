'use strict';

async function safe(promiseFn, fallback) {
  try {
    return await promiseFn();
  } catch (e) {
    return fallback;
  }
}

async function fetchAnalysis(deps, found, gameContext, reviews) {
  if (!deps.apiKey || !Array.isArray(reviews) || !reviews.length) return null;
  return safe(function () {
    var prompt = deps.buildAnalysisPrompt(found.name, reviews, gameContext);
    return deps.fetchChatReply(prompt, deps.apiKey, { webSearch: false }).then(function (raw) {
      return deps.parseAnalysis(raw);
    });
  }, null);
}

async function fetchGameAnalysis(name, deps) {
  var found = await deps.searchGame(name);
  if (!found) {
    return { found: null, priceDetail: null, reviewSummary: null, gameContext: null, analysis: null };
  }

  var results = await Promise.all([
    safe(function () { return deps.fetchPriceDetail(found.id); }, null),
    safe(function () { return deps.fetchReviewSummary(found.id); }, null),
    safe(function () { return deps.fetchGameContext(found.id); }, null),
    deps.apiKey ? safe(function () { return deps.fetchReviewTexts(found.id, 15); }, []) : Promise.resolve([])
  ]);
  var priceDetail = results[0];
  var reviewSummary = results[1];
  var gameContext = results[2];
  var reviews = results[3];

  var analysis = await fetchAnalysis(deps, found, gameContext, reviews);

  return { found: found, priceDetail: priceDetail, reviewSummary: reviewSummary, gameContext: gameContext, analysis: analysis };
}

module.exports = { fetchGameAnalysis: fetchGameAnalysis };
