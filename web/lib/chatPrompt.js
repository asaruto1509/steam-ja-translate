'use strict';

function buildContextLine(gameContext) {
  if (!gameContext) return '';
  var parts = ['「' + gameContext.name + '」というSteamゲームについての会話です。'];
  if (gameContext.reviewSummaryText) {
    parts.push('レビュー評価: ' + gameContext.reviewSummaryText + '。');
  }
  if (gameContext.categories && gameContext.categories.length) {
    parts.push('タグ: ' + gameContext.categories.join(', ') + '。');
  }
  return parts.join('') + '\n\n';
}

function buildChatPrompt(history, newMessage, gameContext) {
  var lines = (history || []).map(function (m) {
    return (m.role === 'assistant' ? 'AI' : 'ユーザー') + ': ' + m.text;
  });
  lines.push('ユーザー: ' + newMessage);
  return 'あなたはSteamゲームに詳しい、落ち着いた口調のアシスタントです。自然な日本語で会話に応じてください。'
    + 'Web検索は、具体的な情報(発売日・価格・評価・攻略情報など)が必要な質問の時だけ使ってください。'
    + '挨拶や雑談など検索が不要なメッセージでは、検索結果を無理に持ち出さず自然に会話してください。\n\n'
    + buildContextLine(gameContext)
    + '会話:\n' + lines.join('\n') + '\nAI:';
}

module.exports = { buildChatPrompt: buildChatPrompt };
