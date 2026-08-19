'use strict';
var steamLib = require('./steam.js');
var promptContext = require('./promptContext.js');

function buildDetectivePrompt(gameName, gameContext, question) {
  var contextLine = promptContext.buildContextLine(gameContext);
  return 'あなたはSteamゲーム当てゲーム「AIゲーム探偵」の出題AIです。秘密のゲームは「' + gameName + '」' + contextLine + 'です。\n'
    + 'このゲームのタイトルや開発会社名、シリーズ名を絶対に口にしないでください。\n'
    + 'ユーザーからの質問に対して「はい」「いいえ」「わからない」のいずれか一言だけで、余計な説明なしに答えてください。\n\n'
    + '質問: ' + question;
}

function parseDetectiveAnswer(text) {
  var cleaned = (text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  var firstLine = cleaned.split('\n')[0].trim();
  return (firstLine || 'わからない').slice(0, 200);
}

function normalize(text) {
  return (text || '').toLowerCase().replace(/[\s　]+/g, '');
}

function isDirectGuess(text, gameName) {
  var normalizedGuess = normalize(text);
  var normalizedName = normalize(gameName);
  if (!normalizedGuess || !normalizedName) return false;
  return normalizedGuess.indexOf(normalizedName) !== -1;
}

function buildRevealEmbed(gameName, appid) {
  return {
    title: '🎉 正解は「' + gameName + '」でした！',
    color: 0x66c0f4,
    url: steamLib.storeUrl(appid),
    image: { url: steamLib.headerImageUrl(appid) }
  };
}

async function handleDetectiveMessage(message, detectiveThreads, apiKey, deps) {
  var state = detectiveThreads.get(message.channelId);
  if (!state) return;

  if (isDirectGuess(message.content, state.name)) {
    detectiveThreads.delete(message.channelId);
    await message.channel.send({ embeds: [buildRevealEmbed(state.name, state.id)] });
    return;
  }

  message.channel.sendTyping().catch(function () {});
  var prompt = buildDetectivePrompt(state.name, { genres: state.genres, categories: state.categories }, message.content);
  var raw = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });
  var answer = parseDetectiveAnswer(raw);
  state.questionCount++;
  await message.channel.send(answer);

  if (state.questionCount >= state.maxQuestions) {
    detectiveThreads.delete(message.channelId);
    await message.channel.send({ embeds: [buildRevealEmbed(state.name, state.id)] });
  }
}

module.exports = {
  buildDetectivePrompt: buildDetectivePrompt,
  parseDetectiveAnswer: parseDetectiveAnswer,
  isDirectGuess: isDirectGuess,
  buildRevealEmbed: buildRevealEmbed,
  handleDetectiveMessage: handleDetectiveMessage
};
