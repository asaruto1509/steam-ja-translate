'use strict';
var steamLib = require('../lib/steam.js');
var promptContext = require('../lib/promptContext.js');

function buildUpcomingPrompt(games) {
  var names = games.map(function (g) { return g.name + promptContext.buildContextLine(g.context); }).join('、');
  return 'あなたはSteam新作紹介AIです。以下は近日リリース予定のタイトルです。\n' + names + '\n\n'
    + 'この中で気になるものを、気さくなタメ口寄りの日本語で1〜2文の紹介コメントにまとめてください。前置きは不要です。';
}

function formatUpcomingReply(games, aiBlurb) {
  if (!games || !games.length) {
    return { content: '近日リリース予定のタイトルが見つからなかった…' };
  }
  return {
    embeds: [{
      title: '🆕 近日リリース予定',
      color: 0x66c0f4,
      description: aiBlurb || '',
      fields: games.map(function (g) {
        return { name: g.name, value: steamLib.storeUrl(g.id), inline: true };
      }),
      image: { url: steamLib.headerImageUrl(games[0].id) }
    }]
  };
}

async function handleUpcomingCommand(interaction, deps) {
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var pool = await deps.fetchUpcomingPool();
  var shuffled = deps.pickRandomGames(pool, pool.length);
  var games = await deps.pickRealGames(shuffled, 4, deps.isRealGame, 20);
  var blurb = null;
  if (games.length && apiKey) {
    await Promise.all(games.map(async function (g) {
      g.context = await deps.fetchGameContext(g.id);
    }));
    blurb = await deps.fetchChatReply(buildUpcomingPrompt(games), apiKey, { webSearch: false });
  }
  await interaction.editReply(formatUpcomingReply(games, blurb));
}

module.exports = {
  buildUpcomingPrompt: buildUpcomingPrompt,
  formatUpcomingReply: formatUpcomingReply,
  handleUpcomingCommand: handleUpcomingCommand
};
