'use strict';
var steamLib = require('../lib/steam.js');
var priceFormat = require('../lib/priceFormat.js');
var promptContext = require('../lib/promptContext.js');

function pickHiddenGem(candidates, minPositivePct, maxPlayerCount) {
  var eligible = candidates.filter(function (g) {
    return typeof g.positivePct === 'number' && g.positivePct >= minPositivePct
      && typeof g.playerCount === 'number' && g.playerCount <= maxPlayerCount;
  });
  if (!eligible.length) return null;
  return eligible.sort(function (a, b) { return b.positivePct - a.positivePct; })[0];
}

function buildHiddenGemPrompt(gameName, gameContext) {
  return 'あなたはSteamの隠れた名作発掘AIです。「' + gameName + '」' + promptContext.buildContextLine(gameContext) + 'は高評価なのにプレイヤーが少ない知る人ぞ知る作品です。'
    + 'なぜ埋もれているのに面白いのか、気さくなタメ口寄りの日本語で1〜2文で紹介してください。前置きは不要です。';
}

function formatHiddenGemReply(game, blurb, priceDetail) {
  if (!game) {
    return { content: '条件に合う隠れた名作が見つからなかった…' };
  }
  return {
    embeds: [{
      title: game.name,
      url: steamLib.storeUrl(game.id),
      color: 0x66c0f4,
      description: blurb || 'うまく紹介文を生成できなかった…',
      image: { url: steamLib.headerImageUrl(game.id) },
      fields: [
        { name: '💎 発掘データ', value: 'ポジティブ率 ' + game.positivePct + '% / 同時接続 ' + game.playerCount.toLocaleString() + '人', inline: true },
        { name: '💴 価格', value: priceFormat.formatPriceLine(priceDetail), inline: true }
      ]
    }]
  };
}

async function handleHiddenGemCommand(interaction, deps) {
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var pool = await deps.fetchFeaturedPool();
  var shuffled = deps.pickRandomGames(pool, pool.length);
  var sample = await deps.pickRealGames(shuffled, 15, deps.isRealGame, 25);
  var candidates = await Promise.all(sample.map(async function (g) {
    var summary = await deps.fetchReviewSummary(g.id);
    var playerCount = await deps.fetchPlayerCount(g.id);
    return { id: g.id, name: g.name, positivePct: summary ? summary.positivePct : null, playerCount: playerCount };
  }));
  var gem = pickHiddenGem(candidates, 85, 300);
  var blurb = null;
  var priceDetail = null;
  if (gem) {
    priceDetail = await deps.fetchPriceDetail(gem.id);
    if (apiKey) {
      var gameContext = await deps.fetchGameContext(gem.id);
      blurb = await deps.fetchChatReply(buildHiddenGemPrompt(gem.name, gameContext), apiKey, { webSearch: false });
    }
  }
  await interaction.editReply(formatHiddenGemReply(gem, blurb, priceDetail));
}

module.exports = {
  pickHiddenGem: pickHiddenGem,
  buildHiddenGemPrompt: buildHiddenGemPrompt,
  formatHiddenGemReply: formatHiddenGemReply,
  handleHiddenGemCommand: handleHiddenGemCommand
};
