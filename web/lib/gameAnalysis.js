'use strict';

var NO_REVIEWS = { positive: [], negative: [] };

async function safe(promiseFn, fallback) {
  try {
    return await promiseFn();
  } catch (e) {
    return fallback;
  }
}

function hasReviews(reviews) {
  return !!(reviews && ((reviews.positive && reviews.positive.length) || (reviews.negative && reviews.negative.length)));
}

async function fetchAnalysis(deps, found, gameContext, reviews, extra) {
  if (!deps.apiKey || !hasReviews(reviews)) return null;
  return safe(function () {
    var prompt = deps.buildAnalysisPrompt(found.name, reviews, gameContext, extra);
    return deps.fetchChatReply(prompt, deps.apiKey, { webSearch: false }).then(function (raw) {
      return deps.parseAnalysis(raw);
    });
  }, null);
}

async function fetchGameAnalysis(name, deps) {
  var found = await deps.searchGame(name);
  if (!found) {
    return {
      found: null, priceDetail: null, reviewSummary: null, gameContext: null,
      playerCount: null, achievementStats: null, analysis: null
    };
  }

  var results = await Promise.all([
    safe(function () { return deps.fetchPriceDetail(found.id); }, null),
    safe(function () { return deps.fetchReviewSummary(found.id); }, null),
    safe(function () { return deps.fetchGameContext(found.id); }, null),
    safe(function () { return deps.fetchPlayerCount(found.id); }, null),
    safe(function () { return deps.fetchAchievementStats(found.id); }, null),
    deps.apiKey ? safe(function () { return deps.fetchOpposingReviews(found.id, 10); }, NO_REVIEWS) : Promise.resolve(NO_REVIEWS)
  ]);
  var priceDetail = results[0];
  var reviewSummary = results[1];
  var gameContext = results[2];
  var playerCount = results[3];
  var achievementStats = results[4];
  var reviews = results[5];

  var analysis = await fetchAnalysis(deps, found, gameContext, reviews, { playerCount: playerCount, achievementStats: achievementStats });

  return {
    found: found, priceDetail: priceDetail, reviewSummary: reviewSummary, gameContext: gameContext,
    playerCount: playerCount, achievementStats: achievementStats, analysis: analysis
  };
}

module.exports = { fetchGameAnalysis: fetchGameAnalysis };
