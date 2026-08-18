'use strict';
var steamLib = require('../lib/steam.js');

function buildQuizPrompt(gameName, reviewTexts) {
  var joined = (reviewTexts || []).join('\n---\n').slice(0, 2000);
  return 'あなたはSteamゲーム当てクイズの出題AIです。以下は「' + gameName + '」のレビュー抜粋です。\n' + joined + '\n\n'
    + 'ゲーム名やシリーズ名、開発会社名を絶対に含めないで、特徴を伝えるヒントを3つ、箇条書き(・)で作ってください。前置きは不要です。';
}

function formatQuizReply(hints, gameName, appid) {
  if (!hints || !gameName) {
    return { content: 'クイズを出題できなかった…' };
  }
  return {
    embeds: [{
      title: '🎮 このゲームは何でしょう？',
      color: 0x66c0f4,
      description: hints,
      image: { url: steamLib.headerImageUrl(appid) },
      fields: [{ name: '答えはこちら(ネタバレ注意)', value: '||[' + gameName + '](' + steamLib.storeUrl(appid) + ')||' }]
    }]
  };
}

async function handleQuizCommand(interaction, deps) {
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  if (!apiKey) {
    await interaction.editReply({ content: 'クイズを出題できなかった…' });
    return;
  }
  var pool = await deps.fetchFeaturedPool();
  var picked = deps.pickRandomGames(pool, 1)[0] || null;
  if (!picked) {
    await interaction.editReply({ content: 'クイズを出題できなかった…' });
    return;
  }
  var reviews = await deps.fetchReviews(picked.id, 10);
  var hints = await deps.fetchChatReply(buildQuizPrompt(picked.name, reviews), apiKey, { webSearch: false });
  await interaction.editReply(formatQuizReply(hints, picked.name, picked.id));
}

module.exports = {
  buildQuizPrompt: buildQuizPrompt,
  formatQuizReply: formatQuizReply,
  handleQuizCommand: handleQuizCommand
};
