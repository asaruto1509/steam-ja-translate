'use strict';

function starsLine(stars) {
  var n = Math.max(0, Math.min(5, stars || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function formatPriceHtml(detail) {
  if (!detail) return '価格情報なし';
  if (detail.finalPrice === 0) return '無料';
  if (detail.discountPercent > 0) {
    return '<span class="orig">¥' + detail.originalPrice.toLocaleString() + '</span> → <strong>¥'
      + detail.finalPrice.toLocaleString() + '</strong> (-' + detail.discountPercent + '%)';
  }
  return '¥' + detail.finalPrice.toLocaleString();
}

function formatPlayerCount(playerCount) {
  return typeof playerCount === 'number' ? playerCount.toLocaleString() + '人' : null;
}

function formatAchievementStats(stats) {
  if (!stats || typeof stats.count !== 'number') return null;
  return {
    count: stats.count,
    avgUnlockPct: typeof stats.avgUnlockPct === 'number' ? stats.avgUnlockPct.toFixed(1) : null,
    rarestName: stats.rarest ? stats.rarest.name : null,
    rarestPercent: stats.rarest && typeof stats.rarest.percent === 'number' ? stats.rarest.percent : null
  };
}

function formatSimilarGames(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (g) {
    return {
      name: g.name,
      appid: g.appid,
      priceHtml: formatPriceHtml(g.priceDetail),
      reviewSummaryText: g.reviewSummary
        ? g.reviewSummary.positivePct + '% (' + g.reviewSummary.totalReviews.toLocaleString() + '件)'
        : 'レビュー情報なし',
      playerCountText: formatPlayerCount(g.playerCount)
    };
  });
}

function buildAnalysisViewModel(result) {
  if (!result.found) {
    return { notFound: true };
  }

  var vm = {
    notFound: false,
    name: result.found.name,
    appid: result.found.id,
    priceHtml: formatPriceHtml(result.priceDetail),
    reviewSummaryText: result.reviewSummary
      ? result.reviewSummary.positivePct + '% (' + result.reviewSummary.totalReviews.toLocaleString() + '件)'
      : 'レビュー情報なし',
    genres: (result.gameContext && result.gameContext.genres) || [],
    categories: (result.gameContext && result.gameContext.categories) || [],
    playerCountText: formatPlayerCount(result.playerCount),
    achievementInfo: formatAchievementStats(result.achievementStats),
    priceHistoryPoints: Array.isArray(result.priceHistory) ? result.priceHistory : [],
    reviewPositivePct: result.reviewSummary ? result.reviewSummary.positivePct : null,
    similarGames: formatSimilarGames(result.similarGamesData),
    isFavorite: result.isFavorite === true,
    analysis: null
  };

  if (result.analysis) {
    var a = result.analysis;
    vm.analysis = {
      verdict: a.verdict || '判定不明',
      reason: a.reason || '',
      categoryLines: (Array.isArray(a.categories) ? a.categories : [])
        .filter(function (c) { return c && typeof c.stars === 'number'; })
        .map(function (c) { return { name: c.name, stars: starsLine(c.stars), starCount: c.stars }; }),
      pros: Array.isArray(a.pros) ? a.pros : [],
      cons: Array.isArray(a.cons) ? a.cons : [],
      audienceFor: Array.isArray(a.audienceFor) ? a.audienceFor : [],
      audienceAgainst: Array.isArray(a.audienceAgainst) ? a.audienceAgainst : []
    };
  }

  return vm;
}

module.exports = { buildAnalysisViewModel: buildAnalysisViewModel };
