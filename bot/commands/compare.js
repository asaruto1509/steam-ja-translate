'use strict';
var steamLib = require('../lib/steam.js');
var priceFormat = require('../lib/priceFormat.js');

function buildCompareAnalysisPrompt(a, b) {
  return 'あなたはSteamゲーム比較AIです。以下の2本のゲームを比較してください。\n\n'
    + 'A: ' + a.name + ' (価格' + priceFormat.formatPriceLine(a.detail) + ', ポジティブ率' + (typeof a.positivePct === 'number' ? a.positivePct + '%' : '不明') + ')\n'
    + 'B: ' + b.name + ' (価格' + priceFormat.formatPriceLine(b.detail) + ', ポジティブ率' + (typeof b.positivePct === 'number' ? b.positivePct + '%' : '不明') + ')\n\n'
    + 'ゲーム性の違い、それぞれどんな人におすすめかを、気さくなタメ口寄りの日本語で3〜4文にまとめてください。前置きは不要です。';
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
        { name: '💴 ' + a.name, value: priceFormat.formatPriceLine(a.detail) + (typeof a.positivePct === 'number' ? '\nポジティブ率 ' + a.positivePct + '%' : ''), inline: true },
        { name: '💴 ' + b.name, value: priceFormat.formatPriceLine(b.detail) + (typeof b.positivePct === 'number' ? '\nポジティブ率 ' + b.positivePct + '%' : ''), inline: true }
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

  var a = { id: foundA.id, name: foundA.name, detail: detailA, positivePct: summaryA ? summaryA.positivePct : null };
  var b = { id: foundB.id, name: foundB.name, detail: detailB, positivePct: summaryB ? summaryB.positivePct : null };

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
