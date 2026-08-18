'use strict';
var steamLib = require('../lib/steam.js');
var priceFormat = require('../lib/priceFormat.js');

function formatPriceReply(gameName, detail) {
  if (!detail) {
    return { content: '「' + gameName + '」が見つからなかった…' };
  }
  var priceLine = priceFormat.formatPriceLine(detail);
  return {
    embeds: [{
      title: detail.name,
      url: steamLib.storeUrl(detail.id),
      color: 0x66c0f4,
      image: { url: steamLib.headerImageUrl(detail.id) },
      fields: [{ name: '価格', value: priceLine, inline: true }]
    }]
  };
}

async function handlePriceCommand(interaction, steamLib) {
  var gameName = interaction.options.getString('name');
  await interaction.deferReply();
  var found = await steamLib.searchGame(gameName);
  var detail = found ? await steamLib.fetchPriceDetail(found.id) : null;
  await interaction.editReply(formatPriceReply(gameName, detail));
}

module.exports = { formatPriceReply: formatPriceReply, handlePriceCommand: handlePriceCommand };
