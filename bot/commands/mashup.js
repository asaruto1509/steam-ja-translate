'use strict';
var steamLib = require('../lib/steam.js');
var priceFormat = require('../lib/priceFormat.js');
var promptContext = require('../lib/promptContext.js');

function buildMashupPrompt(genreA, genreB, gameName, gameContext) {
  return '「' + genreA + '」と「' + genreB + '」を掛け合わせたようなSteamゲームを探していたら「' + gameName + '」' + promptContext.buildContextLine(gameContext) + 'が見つかりました。\n'
    + 'このゲームが両方の要素をどう融合しているか、気さくなタメ口寄りの日本語で1〜2文で紹介してください。前置きは不要です。';
}

function formatMashupReply(genreA, genreB, game, blurb, priceDetail) {
  if (!game) {
    return { content: '「' + genreA + '」×「' + genreB + '」に合いそうなゲームが見つからなかった…' };
  }
  return {
    embeds: [{
      title: game.name,
      url: steamLib.storeUrl(game.id),
      color: 0x66c0f4,
      description: blurb || 'うまく紹介文を生成できなかった…',
      image: { url: steamLib.headerImageUrl(game.id) },
      fields: [{ name: '💴 価格', value: priceFormat.formatPriceLine(priceDetail), inline: true }],
      footer: { text: genreA + ' × ' + genreB }
    }]
  };
}

async function handleMashupCommand(interaction, deps) {
  var genreA = interaction.options.getString('genre_a');
  var genreB = interaction.options.getString('genre_b');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  // ジャンル語同士の検索はDLC/サントラ等がヒットしやすいため、先頭1件を鵜呑みにせず本編判定を通す。
  var candidates = await deps.searchGameChoices(genreA + ' ' + genreB);
  var found = (await deps.pickRealGames(candidates, 1, deps.isRealGame, 10))[0] || null;
  var blurb = null;
  var priceDetail = null;
  if (found) {
    priceDetail = await deps.fetchPriceDetail(found.id);
    if (apiKey) {
      var gameContext = await deps.fetchGameContext(found.id);
      blurb = await deps.fetchChatReply(buildMashupPrompt(genreA, genreB, found.name, gameContext), apiKey, { webSearch: false });
    }
  }
  await interaction.editReply(formatMashupReply(genreA, genreB, found, blurb, priceDetail));
}

module.exports = {
  buildMashupPrompt: buildMashupPrompt,
  formatMashupReply: formatMashupReply,
  handleMashupCommand: handleMashupCommand
};
