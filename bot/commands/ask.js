'use strict';
var steamLib = require('../lib/steam.js');

function buildAskPrompt(gameName, question) {
  return 'あなたはSteamゲームに詳しいアシスタントです。'
    + '必要ならWeb検索結果を踏まえて、気さくなタメ口寄りの日本語で簡潔に答えてください。\n\n'
    + 'ゲーム: ' + gameName + '\n'
    + '質問: ' + question;
}

function formatAskReply(gameName, question, answer, appid) {
  var answerText = (answer || 'うまく回答を生成できなかった…').slice(0, 1024);
  var embed = {
    title: gameName + ' について',
    color: 0x66c0f4,
    fields: [
      { name: '質問', value: question.slice(0, 1024) },
      { name: '回答', value: answerText }
    ]
  };
  if (appid) {
    embed.url = steamLib.storeUrl(appid);
    embed.image = { url: steamLib.headerImageUrl(appid) };
  }
  return { embeds: [embed] };
}

function buildThreadName(gameName) {
  var suffix = ' について';
  return gameName.slice(0, 100 - suffix.length) + suffix;
}

async function handleAskCommand(interaction, deps) {
  var rawGameName = interaction.options.getString('game');
  var question = interaction.options.getString('question');
  await interaction.deferReply();
  if (!deps.apiKey) {
    await interaction.editReply({ content: 'AIが使えないので回答できなかった…' });
    return;
  }
  var found = await deps.searchGame(rawGameName);
  var gameName = found ? found.name : rawGameName;
  var prompt = buildAskPrompt(gameName, question);
  var answer = await deps.fetchChatReply(prompt, deps.apiKey, { webSearch: true });
  await interaction.editReply(formatAskReply(gameName, question, answer, found ? found.id : null));

  try {
    var replyMessage = await interaction.fetchReply();
    var thread = await replyMessage.startThread({ name: buildThreadName(gameName), autoArchiveDuration: 60 });
    var seeded = deps.appendHistory(deps.historyStore.data, thread.id, { author: 'ユーザー', text: question });
    seeded = deps.appendHistory(seeded, thread.id, { author: 'Bot', text: answer });
    deps.historyStore.data = seeded;
    deps.askThreadIds.add(thread.id);
  } catch (e) {
    console.error('スレッド作成に失敗しました: ' + e.message);
  }
}

module.exports = {
  buildAskPrompt: buildAskPrompt,
  formatAskReply: formatAskReply,
  buildThreadName: buildThreadName,
  handleAskCommand: handleAskCommand
};
