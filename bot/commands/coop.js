'use strict';
var steamLib = require('../lib/steam.js');
var priceFormat = require('../lib/priceFormat.js');
var promptContext = require('../lib/promptContext.js');

function buildKeywordPrompt(tastes) {
  return 'あなたはSteam検索キーワード生成AIです。以下のバラバラな好みのプレイヤーたちが、一緒にオンラインで遊べるゲーム'
    + '(マルチプレイ・協力プレイ要素必須)を探しています。この条件に合致しそうなゲームをSteamストアで検索するための、'
    + '英語の検索キーワードを2〜3単語だけで出力してください。説明や記号は一切不要です。\n\n'
    + 'プレイヤーたちの好み: ' + tastes;
}

function buildCompromisePrompt(tastes, gameName, gameContext) {
  var contextLine = promptContext.buildContextLine(gameContext);
  return 'プレイヤーたちの異なる好みは「' + tastes + '」です。\n'
    + 'このグループでSteamゲーム「' + gameName + '」' + contextLine + 'を一緒に遊ぶための折衷プランを考えます。\n'
    + 'それぞれの好みに合わせて、このゲーム内でどんな役割・遊び方をとれば全員が楽しめるか、'
    + '気さくなタメ口寄りの日本語で、前置きや結びなしで1〜2文にまとめて提案してください。';
}

var FAILURE_MESSAGES = {
  no_api_key: 'AIが使えないので提案できなかった…',
  not_found: 'メンバー全員の好みを満たしそうなマルチプレイゲームが見つからなかった…'
};

function formatCoopReply(tastes, game, priceDetail, compromiseText, failureReason) {
  if (!game) {
    return { content: FAILURE_MESSAGES[failureReason] || FAILURE_MESSAGES.not_found };
  }
  var embed = {
    title: '👥 ' + game.name,
    url: steamLib.storeUrl(game.id),
    color: 0x66c0f4,
    image: { url: steamLib.headerImageUrl(game.id) },
    description: compromiseText || '折衷プランの生成に失敗した…',
    fields: [
      { name: '持ち込まれた好み', value: tastes },
      { name: '価格', value: priceFormat.formatPriceLine(priceDetail), inline: true }
    ]
  };
  return { embeds: [embed] };
}

async function handleCoopCommand(interaction, deps) {
  var tastes = interaction.options.getString('tastes');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();

  if (!apiKey) {
    await interaction.editReply(formatCoopReply(tastes, null, null, null, 'no_api_key'));
    return;
  }

  var keywords = await deps.fetchChatReply(buildKeywordPrompt(tastes), apiKey, { webSearch: false });
  // 生成キーワードでの検索はDLC/サントラ等がヒットしやすいため、先頭1件を鵜呑みにせず本編判定を通す。
  var candidates = await deps.searchGameChoices((keywords || '').trim() + ' multiplayer');
  var found = (await deps.pickRealGames(candidates, 1, deps.isRealGame, 10))[0] || null;

  if (!found) {
    await interaction.editReply(formatCoopReply(tastes, null, null, null, 'not_found'));
    return;
  }

  var gameContext = await deps.fetchGameContext(found.id);
  var priceDetail = await deps.fetchPriceDetail(found.id);
  var compromiseText = await deps.fetchChatReply(buildCompromisePrompt(tastes, found.name, gameContext), apiKey, { webSearch: false });

  await interaction.editReply(formatCoopReply(tastes, found, priceDetail, compromiseText, null));
}

module.exports = {
  buildKeywordPrompt: buildKeywordPrompt,
  buildCompromisePrompt: buildCompromisePrompt,
  formatCoopReply: formatCoopReply,
  handleCoopCommand: handleCoopCommand
};
