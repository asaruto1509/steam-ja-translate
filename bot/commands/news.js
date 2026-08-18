'use strict';
var steamLib = require('../lib/steam.js');

function buildNewsSummaryPrompt(gameName, newsTitle, newsContents) {
  return 'あなたはSteamゲームニュースの要約AIです。「' + gameName + '」の最新アップデート情報です。\n'
    + 'タイトル: ' + newsTitle + '\n'
    + '本文: ' + newsContents.slice(0, 2000) + '\n\n'
    + '新機能・調整点・バグ修正などのポイントを、気さくなタメ口寄りの日本語で3〜4行の箇条書きに要約してください。箇条書き以外の前置きは不要です。';
}

function formatNewsReply(gameName, newsItem, summary, appid) {
  if (!newsItem) {
    return { content: '「' + gameName + '」の最新ニュースが見つからなかった…' };
  }
  var embed = {
    title: gameName + ' - ' + newsItem.title,
    url: newsItem.url,
    color: 0x66c0f4,
    description: summary || 'うまく要約を生成できなかった…',
    image: { url: steamLib.headerImageUrl(appid) }
  };
  if (newsItem.date) {
    embed.timestamp = new Date(newsItem.date * 1000).toISOString();
  }
  return { embeds: [embed] };
}

async function handleNewsCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var found = await deps.searchGame(gameName);
  var newsItem = found ? await deps.fetchLatestNews(found.id) : null;
  var summary = null;
  if (newsItem && apiKey) {
    var prompt = buildNewsSummaryPrompt(found.name, newsItem.title, newsItem.contents);
    summary = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });
  }
  await interaction.editReply(formatNewsReply(found ? found.name : gameName, newsItem, summary, found ? found.id : null));
}

module.exports = {
  buildNewsSummaryPrompt: buildNewsSummaryPrompt,
  formatNewsReply: formatNewsReply,
  handleNewsCommand: handleNewsCommand
};
