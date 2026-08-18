'use strict';

function formatPriceLine(detail) {
  if (!detail) return '価格情報なし';
  if (detail.finalPrice === 0) return '無料';
  if (detail.discountPercent > 0) {
    return '~~¥' + detail.originalPrice.toLocaleString() + '~~ → **¥' + detail.finalPrice.toLocaleString() + '** (-' + detail.discountPercent + '%)';
  }
  return '¥' + detail.finalPrice.toLocaleString();
}

module.exports = { formatPriceLine: formatPriceLine };
