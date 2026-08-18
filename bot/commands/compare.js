'use strict';
var steamLib = require('../lib/steam.js');

function buildCompareAnalysisPrompt(a, b) {
  return 'あなたはSteamゲーム比較AIです。以下の2本のゲームを比較してください。\n\n'
    + 'A: ' + a.name + ' (価格¥' + a.finalPrice + ', ポジティブ率' + a.positivePct + '%)\n'
    + 'B: ' + b.name + ' (価格¥' + b.finalPrice + ', ポジティブ率' + b.positivePct + '%)\n\n'
    + 'ゲーム性の違い、それぞれどんな人におすすめかを、気さくなタメ口寄りの日本語で3〜4文にまとめてください。前置きは不要です。';
}

function priceLine(g) {
  if (g.finalPrice === 0) return '無料';
  if (g.discountPercent > 0) return '~~¥' + g.originalPrice.toLocaleString() + '~~ → **¥' + g.finalPrice.toLocaleString() + '** (-' + g.discountPercent + '%)';
  return '¥' + g.finalPrice.toLocaleString();
}

function formatCompareReply(a, b, aiSummary, missingName) {
  if (!a || !b) {
    return { content: '「' + missingName + '」が見つからなかった…' };
  }
  return {
    embeds: [{
      title: a.name + ' 🆚 ' + b.name,
      color: 0x66c0f4,
      description: aiSummary || 'うまく比較を生成できなかった…',
      fields: [
        { name: '💴 ' + a.name, value: priceLine(a) + (typeof a.positivePct === 'number' ? '\nポジティブ率 ' + a.positivePct + '%' : ''), inline: true },
        { name: '💴 ' + b.name, value: priceLine(b) + (typeof b.positivePct === 'number' ? '\nポジティブ率 ' + b.positivePct + '%' : ''), inline: true }
      ]
    }]
  };
}

async function handleCompareCommand(interaction, deps) {
  var nameA = interaction.options.getString('game_a');
  var nameB = interaction.options.getString('game_b');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();

  var foundA = await deps.searchGame(nameA);
  var foundB = await deps.searchGame(nameB);
  if (!foundA || !foundB) {
    await interaction.editReply(formatCompareReply(null, null, null, !foundA ? nameA : nameB));
    return;
  }

  var detailA = await deps.fetchPriceDetail(foundA.id);
  var detailB = await deps.fetchPriceDetail(foundB.id);
  var summaryA = await deps.fetchReviewSummary(foundA.id);
  var summaryB = await deps.fetchReviewSummary(foundB.id);

  var a = { id: foundA.id, name: foundA.name, finalPrice: detailA ? detailA.finalPrice : 0, originalPrice: detailA ? detailA.originalPrice : 0, discountPercent: detailA ? detailA.discountPercent : 0, positivePct: summaryA ? summaryA.positivePct : null };
  var b = { id: foundB.id, name: foundB.name, finalPrice: detailB ? detailB.finalPrice : 0, originalPrice: detailB ? detailB.originalPrice : 0, discountPercent: detailB ? detailB.discountPercent : 0, positivePct: summaryB ? summaryB.positivePct : null };

  var aiSummary = null;
  if (apiKey) {
    var prompt = buildCompareAnalysisPrompt(a, b);
    aiSummary = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });
  }
  await interaction.editReply(formatCompareReply(a, b, aiSummary));
}

module.exports = {
  buildCompareAnalysisPrompt: buildCompareAnalysisPrompt,
  formatCompareReply: formatCompareReply,
  handleCompareCommand: handleCompareCommand
};
