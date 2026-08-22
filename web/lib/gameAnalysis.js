'use strict';

var NO_REVIEWS = { positive: [], negative: [] };
var MAX_SIMILAR_GAMES = 5;

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

async function fetchSimilarGameData(name, deps) {
  var found = await safe(function () { return deps.searchGame(name); }, null);
  if (!found) return null;
  var results = await Promise.all([
    safe(function () { return deps.fetchPriceDetail(found.id); }, null),
    safe(function () { return deps.fetchReviewSummary(found.id); }, null),
    safe(function () { return deps.fetchPlayerCount(found.id); }, null)
  ]);
  return { name: found.name, appid: found.id, priceDetail: results[0], reviewSummary: results[1], playerCount: results[2] };
}

async function fetchSimilarGamesData(names, deps, primaryAppid) {
  if (!Array.isArray(names) || !names.length) return [];
  var settled = await Promise.all(
    names.slice(0, MAX_SIMILAR_GAMES).map(function (name) { return fetchSimilarGameData(name, deps); })
  );
  return settled.filter(function (g) { return g !== null && g.appid !== primaryAppid; });
}

async function fetchGameAnalysis(name, deps) {
  var found = await deps.searchGame(name);
  if (!found) {
    return {
      found: null, priceDetail: null, reviewSummary: null, gameContext: null,
      playerCount: null, achievementStats: null, priceHistory: [], similarGamesData: [], analysis: null
    };
  }

  var results = await Promise.all([
    safe(function () { return deps.fetchPriceDetail(found.id); }, null),
    safe(function () { return deps.fetchReviewSummary(found.id); }, null),
    safe(function () { return deps.fetchGameContext(found.id); }, null),
    safe(function () { return deps.fetchPlayerCount(found.id); }, null),
    safe(function () { return deps.fetchAchievementStats(found.id); }, null),
    deps.apiKey ? safe(function () { return deps.fetchOpposingReviews(found.id, 10); }, NO_REVIEWS) : Promise.resolve(NO_REVIEWS),
    deps.itadApiKey ? safe(function () { return deps.fetchPriceHistory(found.id, deps.itadApiKey); }, []) : Promise.resolve([])
  ]);
  var priceDetail = results[0];
  var reviewSummary = results[1];
  var gameContext = results[2];
  var playerCount = results[3];
  var achievementStats = results[4];
  var reviews = results[5];
  var priceHistory = results[6];

  var analysis = await fetchAnalysis(deps, found, gameContext, reviews, { playerCount: playerCount, achievementStats: achievementStats });
  var similarGamesData = analysis ? await fetchSimilarGamesData(analysis.similarGames, deps, found.id) : [];

  return {
    found: found, priceDetail: priceDetail, reviewSummary: reviewSummary, gameContext: gameContext,
    playerCount: playerCount, achievementStats: achievementStats, priceHistory: priceHistory,
    similarGamesData: similarGamesData, analysis: analysis
  };
}

module.exports = { fetchGameAnalysis: fetchGameAnalysis };
