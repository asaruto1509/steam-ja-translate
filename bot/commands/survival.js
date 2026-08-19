'use strict';
var steamLib = require('../lib/steam.js');
var promptContext = require('../lib/promptContext.js');

var DEFAULT_OCCUPATION = 'Discordの一般市民';

function buildSurvivalPrompt(gameName, gameContext, shortDescription, occupation) {
  var contextLine = promptContext.buildContextLine(gameContext);
  return 'あなたはユーモア溢れる異世界転生シミュレーターAIです。'
    + '「' + occupation + '」が、Steamゲーム「' + gameName + '」' + contextLine
    + (shortDescription ? '(' + shortDescription + ')' : '') + 'の世界に、今の能力のまま転生したら生き残れるかを診断してください。\n'
    + '日本語で、ゲームのお約束やあるあるネタを交えつつ、以下の構成で作成してください。前置きは不要です。\n'
    + '📊 生存難易度と📈推定生存率\n'
    + '🎒 初期装備(職業とゲーム世界を掛け合わせたアイテム)\n'
    + '🎯 初日の最優先目標\n'
    + '⚠️ 現地での禁忌\n'
    + '📖 1週間の生存日誌(1日目/3日目/7日目)';
}

var FAILURE_MESSAGES = {
  not_found: 'が見つからなかった…',
  no_api_key: 'AIが使えないので診断できなかった…'
};

function formatSurvivalReply(gameName, occupation, resultText, appid, failureReason) {
  if (!resultText) {
    return { content: '「' + gameName + '」' + (FAILURE_MESSAGES[failureReason] || FAILURE_MESSAGES.not_found) };
  }
  var embed = {
    title: '🌌 異世界転生シミュレーター: 『' + gameName + '』×『' + occupation + '』',
    color: 0x66c0f4,
    description: resultText
  };
  if (appid) {
    embed.url = steamLib.storeUrl(appid);
    embed.image = { url: steamLib.headerImageUrl(appid) };
  }
  return { embeds: [embed] };
}

async function handleSurvivalCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  var occupation = interaction.options.getString('occupation') || DEFAULT_OCCUPATION;
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();

  var found = await deps.searchGame(gameName);
  if (!found) {
    await interaction.editReply(formatSurvivalReply(gameName, occupation, null, null, 'not_found'));
    return;
  }
  if (!apiKey) {
    await interaction.editReply(formatSurvivalReply(found.name, occupation, null, found.id, 'no_api_key'));
    return;
  }

  var gameContext = await deps.fetchGameContext(found.id);
  var priceDetail = await deps.fetchPriceDetail(found.id);
  var prompt = buildSurvivalPrompt(found.name, gameContext, priceDetail && priceDetail.shortDescription, occupation);
  var resultText = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });

  await interaction.editReply(formatSurvivalReply(found.name, occupation, resultText, found.id, null));
}

module.exports = {
  buildSurvivalPrompt: buildSurvivalPrompt,
  formatSurvivalReply: formatSurvivalReply,
  handleSurvivalCommand: handleSurvivalCommand
};
