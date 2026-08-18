'use strict';

// AIが未知の(新作・マイナー)ゲームについて憶測で語らないよう、実データのジャンル/カテゴリを
// プロンプトに混ぜ込むための共通ヘルパー。
function buildContextLine(gameContext) {
  if (!gameContext) return '';
  var genres = gameContext.genres || [];
  var categories = gameContext.categories || [];
  if (!genres.length && !categories.length) return '';
  var parts = [];
  if (genres.length) parts.push('ジャンル: ' + genres.join('・'));
  if (categories.length) parts.push('特徴: ' + categories.join('・'));
  return '(' + parts.join(', ') + ')';
}

module.exports = { buildContextLine: buildContextLine };
