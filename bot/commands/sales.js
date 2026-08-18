'use strict';
var steamLib = require('../lib/steam.js');

function pickTopSales(pool, count) {
  return pool.slice().sort(function (a, b) { return b.discountPercent - a.discountPercent; }).slice(0, count);
}

function buildSalesPrompt(games) {
  var lines = games.map(function (g) { return '・' + g.name + ' (-' + g.discountPercent + '%, ¥' + g.finalPrice + ')'; }).join('\n');
  return 'あなたはSteamセール情報の紹介AIです。以下は今週の値下げ中タイトルです。\n' + lines + '\n\n'
    + 'この中から今買う価値が高い理由を、気さくなタメ口寄りの日本語で2〜3文にまとめてください。前置きは不要です。';
}

function priceLine(g) {
  return '~~¥' + g.originalPrice.toLocaleString() + '~~ → **¥' + g.finalPrice.toLocaleString() + '** (-' + g.discountPercent + '%)';
}

function formatSalesReply(games, aiBlurb) {
  if (!games || !games.length) {
    return { content: '今セール中のおすすめタイトルが見つからなかった…' };
  }
  return {
    embeds: [{
      title: '🔖 今週のセールおすすめ',
      color: 0x66c0f4,
      description: aiBlurb || '',
      fields: games.map(function (g) {
        return { name: g.name, value: priceLine(g), inline: true };
      }),
      image: { url: steamLib.headerImageUrl(games[0].id) }
    }]
  };
}

async function handleSalesCommand(interaction, deps) {
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var pool = await deps.fetchSpecialsPool();
  var games = pickTopSales(pool.filter(function (g) { return g.discountPercent > 0; }), 5);
  var blurb = null;
  if (games.length && apiKey) {
    blurb = await deps.fetchChatReply(buildSalesPrompt(games), apiKey, { webSearch: false });
  }
  await interaction.editReply(formatSalesReply(games, blurb));
}

module.exports = {
  pickTopSales: pickTopSales,
  buildSalesPrompt: buildSalesPrompt,
  formatSalesReply: formatSalesReply,
  handleSalesCommand: handleSalesCommand
};
