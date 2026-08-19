'use strict';
var steamLib = require('../lib/steam.js');
var promptContext = require('../lib/promptContext.js');

function buildUrbanLegendPrompt(gameName, gameContext, shortDescription, reviewTexts) {
  var contextLine = promptContext.buildContextLine(gameContext);
  var reviewsBlock = (reviewTexts || []).map(function (r) { return '- ' + r; }).join('\n') || '- (特筆すべき報告なし)';
  return 'あなたはゲームの都市伝説やインターネット・ミステリーを収集している研究家です。'
    + '以下のSteamゲームの実データとユーザーの報告(レビュー)を元に、このゲームに潜む「架空の都市伝説または奇妙な怪異現象」を1つ創作してください。\n\n'
    + '【ゲーム名】: ' + gameName + contextLine + '\n'
    + '【ゲーム概要】: ' + (shortDescription || '(不明)') + '\n'
    + '【ユーザーの報告】:\n' + reviewsBlock + '\n\n'
    + '以下の構成で、冷徹で客観的な調査報告書風のトーンで日本語で記述してください。前置きは不要です。\n'
    + '■ 調査報告書: 事案「(噂のタイトル)」\n'
    + '■ 現象の概要: (200字程度)\n'
    + '■ 実際の報告との整合性: (入力された報告と現象の関連性をこじつける)\n'
    + '■ 発生条件(フェイク手順): (3ステップの箇条書き)';
}

var FAILURE_MESSAGES = {
  not_found: 'が見つからなかった…',
  no_api_key: 'AIが使えないので調査できなかった…'
};

function formatUrbanLegendReply(gameName, resultText, appid, failureReason) {
  if (!resultText) {
    return { content: '「' + gameName + '」' + (FAILURE_MESSAGES[failureReason] || FAILURE_MESSAGES.not_found) };
  }
  var embed = {
    title: '👻 都市伝説調査ファイル: 『' + gameName + '』',
    color: 0x2f2f4f,
    description: resultText
  };
  if (appid) {
    embed.url = steamLib.storeUrl(appid);
    embed.image = { url: steamLib.headerImageUrl(appid) };
  }
  return { embeds: [embed] };
}

async function handleUrbanLegendCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();

  var found = await deps.searchGame(gameName);
  if (!found) {
    await interaction.editReply(formatUrbanLegendReply(gameName, null, null, 'not_found'));
    return;
  }
  if (!apiKey) {
    await interaction.editReply(formatUrbanLegendReply(found.name, null, found.id, 'no_api_key'));
    return;
  }

  var gameContext = await deps.fetchGameContext(found.id);
  var priceDetail = await deps.fetchPriceDetail(found.id);
  var reviews = await deps.fetchReviews(found.id, 5);
  var prompt = buildUrbanLegendPrompt(found.name, gameContext, priceDetail && priceDetail.shortDescription, reviews);
  var resultText = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });

  await interaction.editReply(formatUrbanLegendReply(found.name, resultText, found.id, null));
}

module.exports = {
  buildUrbanLegendPrompt: buildUrbanLegendPrompt,
  formatUrbanLegendReply: formatUrbanLegendReply,
  handleUrbanLegendCommand: handleUrbanLegendCommand
};
