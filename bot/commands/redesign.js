'use strict';
var steamLib = require('../lib/steam.js');

function buildRedesignPrompt(gameName, negativeReviews) {
  var joined = negativeReviews.map(function (r, i) { return (i + 1) + ': ' + r; }).join('\n');
  return 'あなたは熱意に満ちたゲームプロデューサーです。Steamで販売されているゲーム「' + gameName + '」に対して、'
    + 'プレイヤーから以下のような不満点(低評価レビュー)が寄せられています。\n\n'
    + '【寄せられた実際の不満】\n' + joined + '\n\n'
    + 'これらを踏まえ、ユーザーの信頼を取り戻すための、ユーモアと説得力を兼ね備えた「緊急大型アップデート(Ver.9.9.9)企画書」を'
    + '日本語で作成してください。前置きは不要で、以下の3構成にしてください。\n'
    + '【コミュニティの声(課題分析)】不満点を3つに要約\n'
    + '【奇跡のアップデート内容(Ver.9.9.9)】不満を大胆に解決する仕様変更案\n'
    + '【プロデューサーからファンの皆様へ】情熱的なメッセージ';
}

var FAILURE_MESSAGES = {
  not_found: 'が見つからなかった…',
  no_reviews: 'は改善企画書のもとになる不満点レビューが見つからなかった…褒められすぎ？'
};

function formatRedesignReply(gameName, pitchText, appid, failureReason) {
  if (!pitchText) {
    return { content: '「' + gameName + '」' + (FAILURE_MESSAGES[failureReason] || FAILURE_MESSAGES.not_found) };
  }
  var embed = {
    title: '🛠️ 『' + gameName + '』緊急大復活プロジェクト企画書',
    color: 0xff4757,
    description: pitchText,
    footer: { text: 'Powered by AI & Steamコミュニティの声' }
  };
  if (appid) {
    embed.url = steamLib.storeUrl(appid);
    embed.image = { url: steamLib.headerImageUrl(appid) };
  }
  return { embeds: [embed] };
}

async function handleRedesignCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var found = await deps.searchGame(gameName);
  var pitchText = null;
  var failureReason = 'not_found';
  if (found) {
    failureReason = 'no_reviews';
    if (apiKey) {
      var reviews = await deps.fetchOpposingReviews(found.id, 5);
      if (reviews.negative.length) {
        var prompt = buildRedesignPrompt(found.name, reviews.negative);
        pitchText = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });
      }
    }
  }
  await interaction.editReply(formatRedesignReply(found ? found.name : gameName, pitchText, found ? found.id : null, failureReason));
}

module.exports = {
  buildRedesignPrompt: buildRedesignPrompt,
  formatRedesignReply: formatRedesignReply,
  handleRedesignCommand: handleRedesignCommand
};
