'use strict';
var steamLib = require('../lib/steam.js');
var promptContext = require('../lib/promptContext.js');

function buildKeywordPrompt(query) {
  return 'あなたはSteamストア検索キーワード生成AIです。次のユーザーの気分・要望に合うゲームを探すための、'
    + 'Steamの英語ストア検索に適した2〜4単語のキーワードだけを出力してください。説明や前置きは不要です。\n\n'
    + '気分・要望: ' + query;
}

function buildMoodReasonPrompt(query, gameName, gameContext) {
  return 'ユーザーの気分・要望は「' + query + '」でした。それに対して「' + gameName + '」' + promptContext.buildContextLine(gameContext) + 'というSteamゲームが見つかりました。\n'
    + 'このゲームがなぜその気分・要望にマッチするか、気さくなタメ口寄りの日本語で1〜2文で説明してください。前置きは不要です。';
}

function formatMoodReply(query, game, reason) {
  if (!game) {
    return { content: '「' + query + '」に合いそうなゲームが見つからなかった…' };
  }
  return {
    embeds: [{
      title: game.name,
      url: steamLib.storeUrl(game.id),
      color: 0x66c0f4,
      description: reason || 'うまく理由を生成できなかった…',
      image: { url: steamLib.headerImageUrl(game.id) }
    }]
  };
}

async function handleMoodCommand(interaction, deps) {
  var query = interaction.options.getString('query');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  if (!apiKey) {
    await interaction.editReply(formatMoodReply(query, null, null));
    return;
  }
  var keywords = await deps.fetchChatReply(buildKeywordPrompt(query), apiKey, { webSearch: false });
  var found = keywords ? await deps.searchGame(keywords.trim()) : null;
  var reason = null;
  if (found) {
    var gameContext = await deps.fetchGameContext(found.id);
    reason = await deps.fetchChatReply(buildMoodReasonPrompt(query, found.name, gameContext), apiKey, { webSearch: false });
  }
  await interaction.editReply(formatMoodReply(query, found, reason));
}

module.exports = {
  buildKeywordPrompt: buildKeywordPrompt,
  buildMoodReasonPrompt: buildMoodReasonPrompt,
  formatMoodReply: formatMoodReply,
  handleMoodCommand: handleMoodCommand
};
