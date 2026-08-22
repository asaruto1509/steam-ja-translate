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

// 1段階目: JSON制約を課さず自由記述でじっくり考察させる(qwen3-vl-8b-thinkingで実行、Web検索有効)。
function buildReasoningPrompt(gameName, reviewsBySentiment, gameContext, extra) {
  extra = extra || {};
  var positive = (reviewsBySentiment && reviewsBySentiment.positive) || [];
  var negative = (reviewsBySentiment && reviewsBySentiment.negative) || [];

  return 'あなたはSteamゲームレビューの詳細分析AIです。以下は「' + gameName + '」の好評レビューと不評レビューの抜粋です。'
    + '両方を踏まえて公平に判断してください。'
    + 'Web検索でこのゲームの外部評価(Metacritic、OpenCritic、IGN等の実在するレビューサイトのスコアや評)も調べてください。'
    + '似ている実在のSteamゲームも思い浮かべてください。\n'
    + buildContextLine(gameContext)
    + buildStatsLine(extra)
    + '次の観点を自由な文章でじっくり考察してください。結論を急がず、レビューの具体的な内容を踏まえて書いてください。\n'
    + '・総合的な買い時判定(今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか)とその理由\n'
    + '・次の評価軸それぞれについて、レビューから読み取れる範囲で所感と5段階の星評価(1〜5の整数)。該当する情報が無い軸は星評価を書かず省略してよい: '
    + reviewCategories.CATEGORY_NAMES.join('、') + '\n'
    + '・具体的な良い点、悪い点(それぞれ複数)\n'
    + '・こんな人におすすめ/おすすめできない人\n'
    + '・似ている実在のSteamゲーム\n'
    + '・調べて分かった外部評価\n\n'
    + '【好評レビュー】\n' + positive.join('\n---\n').slice(0, 4000) + '\n\n'
    + '【不評レビュー】\n' + negative.join('\n---\n').slice(0, 4000);
}

// 2段階目: 1段階目の考察文を、既存の表示に使うJSON形式へ機械的に変換するだけの軽い呼び出し(webSearch不要)。
function buildStructuringPrompt(gameName, reasoningText) {
  return '以下は「' + gameName + '」についてのAIによる分析メモです。この内容だけを根拠に、次のJSON形式のみで出力してください。説明文やコードブロックは不要です。メモに書かれていない項目はnullまたは空配列にしてください。\n'
    + '{"verdict":"今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか",'
    + '"reason":"判定理由(80字程度、具体的に)",'
    + '"categories":[' + reviewCategories.buildCategorySchema() + '],'
    + '"pros":["具体的な良い点(40字程度)を最大5つ"],'
    + '"cons":["具体的な悪い点(40字程度)を最大5つ"],'
    + '"audienceFor":["こんな人向け、を最大3つ"],'
    + '"audienceAgainst":["向いていない人、を最大3つ"],'
    + '"similarGames":["似ている実在のSteamゲームのタイトルを最大5つ"],'
    + '"externalScores":[{"source":"サイト名(例: Metacritic)","score":"スコアや評価(例: 87/100)"}を最大4つ、無ければ空配列]}\n\n'
    + '分析メモ:\n' + reasoningText;
}

module.exports = { buildReasoningPrompt: buildReasoningPrompt, buildStructuringPrompt: buildStructuringPrompt };
