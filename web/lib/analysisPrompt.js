'use strict';
var reviewCategories = require('../../bot/lib/reviewCategories.js');

function buildContextLine(gameContext) {
  if (!gameContext) return '';
  var hasGenres = gameContext.genres && gameContext.genres.length;
  var hasCategories = gameContext.categories && gameContext.categories.length;
  if (!hasGenres && !hasCategories) return '';
  return 'このゲームは' + (gameContext.genres || []).join('・') + 'に属し、'
    + (gameContext.categories || []).join('・') + 'に対応しています。\n';
}

function buildStatsLine(extra) {
  var parts = [];
  if (typeof extra.playerCount === 'number') {
    parts.push('現在の同時接続プレイヤー数: ' + extra.playerCount.toLocaleString() + '人');
  }
  if (extra.achievementStats && typeof extra.achievementStats.count === 'number') {
    var stats = extra.achievementStats;
    parts.push('実績数: ' + stats.count + '個、平均達成率: ' + stats.avgUnlockPct + '%');
    if (stats.rarest) {
      parts.push('最もレアな実績「' + stats.rarest.name + '」の達成率: ' + stats.rarest.percent + '%');
    }
  }
  return parts.length ? parts.join('\n') + '\n' : '';
}

function buildAnalysisPrompt(gameName, reviewsBySentiment, gameContext, extra) {
  extra = extra || {};
  var positive = (reviewsBySentiment && reviewsBySentiment.positive) || [];
  var negative = (reviewsBySentiment && reviewsBySentiment.negative) || [];

  return 'あなたはSteamゲームレビューの詳細分析AIです。以下は「' + gameName + '」の好評レビューと不評レビューの抜粋です。'
    + '両方を踏まえて公平に判断してください。'
    + 'また、Web検索でこのゲームの外部評価(Metacritic、OpenCritic、IGN等の実在するレビューサイトのスコアや評)を調べ、分かった範囲で反映してください。\n'
    + buildContextLine(gameContext)
    + buildStatsLine(extra)
    + '次のJSON形式のみで回答してください。説明文やコードブロックは不要です。\n'
    + '{"verdict":"今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか",'
    + '"reason":"判定理由(80字程度、具体的に)",'
    + '"categories":[' + reviewCategories.buildCategorySchema() + '],'
    + '"pros":["具体的な良い点(40字程度)を最大5つ"],'
    + '"cons":["具体的な悪い点(40字程度)を最大5つ"],'
    + '"audienceFor":["こんな人向け、を最大3つ"],'
    + '"audienceAgainst":["向いていない人、を最大3つ"],'
    + '"similarGames":["似ている実在のSteamゲームのタイトルを最大5つ"],'
    + '"externalScores":[{"source":"サイト名(例: Metacritic)","score":"スコアや評価(例: 87/100)"}を検索で見つかった範囲で最大4つ、見つからなければ空配列]}\n\n'
    + '【好評レビュー】\n' + positive.join('\n---\n').slice(0, 2000) + '\n\n'
    + '【不評レビュー】\n' + negative.join('\n---\n').slice(0, 2000);
}

module.exports = { buildAnalysisPrompt: buildAnalysisPrompt };
