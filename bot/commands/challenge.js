'use strict';
var steamLib = require('../lib/steam.js');
var promptContext = require('../lib/promptContext.js');

function buildChallengePrompt(gameName, achievements, gameContext) {
  var names = achievements.map(function (a) { return a.name; }).join('、');
  return 'あなたはSteamゲームの縛りプレイ企画AIです。「' + gameName + '」' + promptContext.buildContextLine(gameContext) + 'には次のレア実績があります: ' + names + '\n\n'
    + 'これらのレア実績の解除を絡めた、面白い縛りプレイ・チャレンジ企画を1つ、気さくなタメ口寄りの日本語で2〜3文で提案してください。前置きは不要です。';
}

function formatChallengeReply(gameName, achievements, challengeText, appid) {
  if (!achievements || !achievements.length) {
    return { content: '「' + gameName + '」のレア実績データが見つからなかった…' };
  }
  var lines = achievements.map(function (a) { return '・`' + a.name + '` (達成率 ' + a.percent.toFixed(1) + '%)'; }).join('\n');
  var embed = {
    title: gameName + ' チャレンジ',
    color: 0x66c0f4,
    description: challengeText || 'うまく企画を生成できなかった…',
    fields: [{ name: '🏆 レア実績', value: lines }]
  };
  if (appid) {
    embed.url = steamLib.storeUrl(appid);
    embed.image = { url: steamLib.headerImageUrl(appid) };
  }
  return { embeds: [embed] };
}

async function handleChallengeCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var found = await deps.searchGame(gameName);
  var achievements = found ? await deps.fetchRareAchievements(found.id, 3) : [];
  var challengeText = null;
  if (achievements.length && apiKey) {
    var gameContext = await deps.fetchGameContext(found.id);
    challengeText = await deps.fetchChatReply(buildChallengePrompt(found.name, achievements, gameContext), apiKey, { webSearch: false });
  }
  await interaction.editReply(formatChallengeReply(found ? found.name : gameName, achievements, challengeText, found ? found.id : null));
}

module.exports = {
  buildChallengePrompt: buildChallengePrompt,
  formatChallengeReply: formatChallengeReply,
  handleChallengeCommand: handleChallengeCommand
};
