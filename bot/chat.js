'use strict';

var MAX_HISTORY = 6;

// 履歴はイミュータブルに扱う(呼び出し元のオブジェクトを書き換えない)。
function appendHistory(history, channelId, entry, maxLen) {
  maxLen = maxLen || MAX_HISTORY;
  var next = Object.assign({}, history);
  var list = (next[channelId] || []).concat([entry]);
  next[channelId] = list.slice(-maxLen);
  return next;
}

function buildChatPrompt(historyEntries, newMessage) {
  var lines = (historyEntries || []).map(function (e) {
    return e.author + ': ' + e.text;
  });
  lines.push('ユーザー: ' + newMessage);
  return 'あなたはSteamゲーム好きが集まるDiscordサーバーの雑談Botです。'
    + '気さくにタメ口寄りの日本語で、2〜3文程度の短さで返信してください。\n\n'
    + '会話:\n' + lines.join('\n') + '\nBot:';
}

async function fetchChatReply(prompt, apiKey, options) {
  var webSearch = (options && options.webSearch) || false;
  var body = {
    type: 'UNIFY_CHAT_WITH_AI',
    model: 'qwen3-8b',
    promptObject: { prompt: prompt, settings: { historySettings: { isMixed: false, historyMessageLimit: 0 }, webSearchSettings: { webSearch: webSearch } } }
  };
  var r = await fetch('https://api.1min.ai/api/chat-with-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-KEY': apiKey },
    body: JSON.stringify(body)
  });
  var d = await r.json();
  if (!r.ok || d.errorCode) throw new Error(d.message || String(r.status));
  var text = (d.aiRecord && d.aiRecord.aiRecordDetail && d.aiRecord.aiRecordDetail.resultObject && d.aiRecord.aiRecordDetail.resultObject[0]) || '';
  return text.trim();
}

async function handleChatMessage(message, historyStore, apiKey, options) {
  var channelId = message.channelId;
  var beforeHistory = (historyStore.data[channelId] || []);
  var entry = { author: message.author.username, text: message.content };
  historyStore.data = appendHistory(historyStore.data, channelId, entry, MAX_HISTORY);

  var prompt = buildChatPrompt(beforeHistory, message.content);
  // sendTypingは約10秒で自動的に切れるため、応答が届くまで打ち直し続ける。
  message.channel.sendTyping().catch(function () {});
  var typingInterval = setInterval(function () {
    message.channel.sendTyping().catch(function () {});
  }, 8000);
  try {
    var reply = await fetchChatReply(prompt, apiKey, options);
    var replyText = (reply || 'うまく返答を生成できなかった…').slice(0, 2000);
    await message.channel.send(replyText);
    historyStore.data = appendHistory(historyStore.data, channelId, { author: 'Bot', text: replyText }, MAX_HISTORY);
  } catch (e) {
    console.error('チャット応答生成に失敗しました: ' + e.message);
    await message.channel.send('うまく返答を生成できなかった…').catch(function () {});
  } finally {
    clearInterval(typingInterval);
  }
}

module.exports = {
  MAX_HISTORY: MAX_HISTORY,
  appendHistory: appendHistory,
  buildChatPrompt: buildChatPrompt,
  fetchChatReply: fetchChatReply,
  handleChatMessage: handleChatMessage
};
