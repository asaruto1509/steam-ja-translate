'use strict';
var steamLib = require('../lib/steam.js');

function buildDebatePrompt(gameName, positiveReviews, negativeReviews) {
  var posText = positiveReviews.map(function (r, i) { return (i + 1) + ': ' + r; }).join('\n');
  var negText = negativeReviews.map(function (r, i) { return (i + 1) + ': ' + r; }).join('\n');
  return 'あなたはSteamゲームの対話ジェネレーターです。ゲーム「' + gameName + '」について、実際のユーザーレビューを元に、'
    + '肯定派「ポジ丸(熱血カジュアルゲーマー)」と否定派「ネガ介(辛口コアゲーマー)」の2人によるミニ討論を、'
    + '1ターンずつ合計4発言で日本語で作成してください。最後に一言まとめも添えてください。挨拶や前置きは不要です。\n\n'
    + '【好評レビュー】\n' + posText + '\n\n【不評レビュー】\n' + negText;
}

var FAILURE_MESSAGES = {
  not_found: 'が見つからなかった…',
  no_reviews: 'は賛否が分かれるほどのレビューがまだ無いみたい…'
};

function formatBattleReply(gameName, debateText, appid, failureReason) {
  if (!debateText) {
    return { content: '「' + gameName + '」' + (FAILURE_MESSAGES[failureReason] || FAILURE_MESSAGES.not_found) };
  }
  var embed = {
    title: '⚔️ 討論会: ' + gameName,
    color: 0xff4500,
    description: debateText,
    footer: { text: '君はどっちの意見に共感する？' }
  };
  if (appid) {
    embed.url = steamLib.storeUrl(appid);
    embed.image = { url: steamLib.headerImageUrl(appid) };
  }
  return { embeds: [embed] };
}

async function handleBattleCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var found = await deps.searchGame(gameName);
  var debateText = null;
  var failureReason = 'not_found';
  if (found) {
    failureReason = 'no_reviews';
    if (apiKey) {
      var reviews = await deps.fetchOpposingReviews(found.id, 5);
      if (reviews.positive.length && reviews.negative.length) {
        var prompt = buildDebatePrompt(found.name, reviews.positive, reviews.negative);
        debateText = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });
      }
    }
  }
  await interaction.editReply(formatBattleReply(found ? found.name : gameName, debateText, found ? found.id : null, failureReason));
}

module.exports = {
  buildDebatePrompt: buildDebatePrompt,
  formatBattleReply: formatBattleReply,
  handleBattleCommand: handleBattleCommand
};
