'use strict';

function buildAskPrompt(gameName, question) {
  return 'あなたはSteamゲームに詳しいアシスタントです。'
    + '必要ならWeb検索結果を踏まえて、気さくなタメ口寄りの日本語で簡潔に答えてください。\n\n'
    + 'ゲーム: ' + gameName + '\n'
    + '質問: ' + question;
}

function formatAskReply(gameName, question, answer) {
  var answerText = (answer || 'うまく回答を生成できなかった…').slice(0, 1024);
  return {
    embeds: [{
      title: gameName + ' について',
      color: 0x66c0f4,
      fields: [
        { name: '質問', value: question.slice(0, 1024) },
        { name: '回答', value: answerText }
      ]
    }]
  };
}

async function handleAskCommand(interaction, deps) {
  var gameName = interaction.options.getString('game');
  var question = interaction.options.getString('question');
  await interaction.deferReply();
  var prompt = buildAskPrompt(gameName, question);
  var answer = await deps.fetchChatReply(prompt, deps.apiKey, { webSearch: true });
  await interaction.editReply(formatAskReply(gameName, question, answer));
}

module.exports = {
  buildAskPrompt: buildAskPrompt,
  formatAskReply: formatAskReply,
  handleAskCommand: handleAskCommand
};
