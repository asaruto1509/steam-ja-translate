'use strict';
var steamLib = require('../lib/steam.js');
var promptContext = require('../lib/promptContext.js');
var priceFormat = require('../lib/priceFormat.js');

function filterCheapPool(pool, maxPrice) {
  return pool.filter(function (g) { return g.finalPrice <= maxPrice; });
}

function rarityForPositivePct(pct) {
  if (typeof pct === 'number' && pct >= 90) return { grade: 'SSR', emoji: '🌟' };
  if (typeof pct === 'number' && pct >= 70) return { grade: 'SR', emoji: '✨' };
  if (typeof pct === 'number' && pct >= 50) return { grade: 'R', emoji: '🔹' };
  return { grade: 'N', emoji: '▪' };
}

function buildGachaFlavorPrompt(gameName, gameContext) {
  return 'あなたはゲーム紹介AIです。「' + gameName + '」' + promptContext.buildContextLine(gameContext) + 'というSteamゲームについて、'
    + 'ユーモラスかつ気さくなタメ口寄りの日本語で、1〜2文の面白い紹介文を作ってください。前置きは不要です。';
}

function formatGachaReply(game, positivePct, flavorText) {
  if (!game) {
    return { content: 'ガチャ対象のゲームが見つからなかった…' };
  }
  var rarity = rarityForPositivePct(positivePct);
  return {
    embeds: [{
      title: rarity.emoji + ' [' + rarity.grade + '] ' + game.name,
      url: steamLib.storeUrl(game.id),
      color: 0x66c0f4,
      description: flavorText || 'うまく紹介文を生成できなかった…',
      image: { url: steamLib.headerImageUrl(game.id) },
      fields: [{ name: '価格', value: priceFormat.formatPriceLine(game), inline: true }]
    }]
  };
}

async function handleGachaCommand(interaction, deps) {
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var pool = await deps.fetchSpecialsPool();
  var cheap = filterCheapPool(pool, 1000);
  var shuffled = deps.pickRandomGames(cheap, cheap.length);
  var picked = (await deps.pickRealGames(shuffled, 1, deps.isRealGame, 15))[0] || null;
  var positivePct = null;
  var flavorText = null;
  if (picked) {
    var summary = await deps.fetchReviewSummary(picked.id);
    positivePct = summary ? summary.positivePct : null;
    if (apiKey) {
      var gameContext = await deps.fetchGameContext(picked.id);
      flavorText = await deps.fetchChatReply(buildGachaFlavorPrompt(picked.name, gameContext), apiKey, { webSearch: false });
    }
  }
  await interaction.editReply(formatGachaReply(picked, positivePct, flavorText));
}

module.exports = {
  filterCheapPool: filterCheapPool,
  rarityForPositivePct: rarityForPositivePct,
  buildGachaFlavorPrompt: buildGachaFlavorPrompt,
  formatGachaReply: formatGachaReply,
  handleGachaCommand: handleGachaCommand
};
