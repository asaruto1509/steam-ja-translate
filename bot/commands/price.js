'use strict';

function formatPriceReply(gameName, detail) {
  if (!detail) {
    return { content: '「' + gameName + '」が見つからなかった…' };
  }
  var priceLine = detail.finalPrice === 0
    ? '無料'
    : detail.discountPercent > 0
      ? '~~¥' + detail.originalPrice.toLocaleString() + '~~ → **¥' + detail.finalPrice.toLocaleString() + '** (-' + detail.discountPercent + '%)'
      : '¥' + detail.finalPrice.toLocaleString();
  return {
    embeds: [{
      title: detail.name,
      url: 'https://store.steampowered.com/app/' + detail.id + '/',
      color: 0x66c0f4,
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
