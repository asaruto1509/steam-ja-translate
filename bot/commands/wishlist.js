'use strict';

function buildWishlistDealsEmbed(deals) {
  if (!deals.length) {
    return { content: '今値下げ中のウィッシュリストタイトルはないみたい。' };
  }
  var description = deals.map(function (d) {
    return '**' + d.name + '**\n~~¥' + d.originalPrice.toLocaleString() + '~~ → ¥' + d.finalPrice.toLocaleString() + '（-' + d.discountPercent + '%）';
  }).join('\n\n');
  return {
    embeds: [{
      title: '💰 ウィッシュリスト値下げ中 ' + deals.length + '件',
      url: 'https://store.steampowered.com/wishlist/',
      color: 0x66c0f4,
      description: description
    }]
  };
}

async function handleWishlistCommand(interaction, steamId64, scripts, steamLib) {
  await interaction.deferReply();
  var wishlist = await scripts.fetchWishlist(steamId64);
  var deals = [];
  var CHUNK = 4;
  for (var i = 0; i < wishlist.length; i += CHUNK) {
    var chunk = wishlist.slice(i, i + CHUNK);
    var results = await Promise.all(chunk.map(function (w) {
      return steamLib.fetchPriceDetail(w.appid).catch(function () { return null; });
    }));
    results.forEach(function (r) { if (r && r.discountPercent > 0) deals.push(r); });
  }
  await interaction.editReply(buildWishlistDealsEmbed(deals));
}

module.exports = { buildWishlistDealsEmbed: buildWishlistDealsEmbed, handleWishlistCommand: handleWishlistCommand };
