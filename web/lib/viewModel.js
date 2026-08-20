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
    analysis: null
  };

  if (result.analysis) {
    var a = result.analysis;
    vm.analysis = {
      verdict: a.verdict || '判定不明',
      reason: a.reason || '',
      categoryLines: (a.categories || [])
        .filter(function (c) { return c && typeof c.stars === 'number'; })
        .map(function (c) { return { name: c.name, stars: starsLine(c.stars) }; }),
      pros: a.pros || [],
      cons: a.cons || [],
      audienceFor: a.audienceFor || [],
      audienceAgainst: a.audienceAgainst || []
    };
  }

  return vm;
}

module.exports = { buildAnalysisViewModel: buildAnalysisViewModel };
