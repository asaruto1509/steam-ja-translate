'use strict';
var steamLib = require('./lib/steam.js');
var priceFormat = require('./lib/priceFormat.js');
var fetchWithTimeout = require('./lib/fetchWithTimeout.js').fetchWithTimeout;

// AI応答はWeb検索や推論を伴い数十秒かかることがあるため、Steam API向けの短いデフォルトより長めに取る。
var AI_FETCH_TIMEOUT_MS = 45000;

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
    + '気さくにタメ口寄りの日本語で、2〜3文程度の短さで返信してください。'
    + '会話の中で他のSteamゲームのタイトルに言及するときは、必ず『ゲーム名』のように括弧で囲んでください。\n\n'
    + '会話:\n' + lines.join('\n') + '\nBot:';
}

function extractGameMentions(text, maxCount) {
  maxCount = maxCount || 5;
  var seen = [];
  var re = /[「『]([^」』]+)[」』]/g;
  var match;
  while ((match = re.exec(text || '')) !== null && seen.length < maxCount) {
    if (seen.indexOf(match[1]) === -1) seen.push(match[1]);
  }
  return seen;
}

// メッセージ本文にURLを生で貼るとDiscordが英語/ドル建てのOGPプレビューを勝手に展開してしまうため、
// 自前でEmbed(円建て価格・画像・リンク)を作って添付する。本文にはURLを含めない。
function buildMentionEmbed(game, priceDetail) {
  var embed = {
    title: game.name,
    url: steamLib.storeUrl(game.id),
    color: 0x66c0f4,
    image: { url: steamLib.headerImageUrl(game.id) },
    fields: [{ name: '価格', value: priceFormat.formatPriceLine(priceDetail), inline: true }]
  };
  if (priceDetail && priceDetail.shortDescription) {
    embed.description = priceDetail.shortDescription;
  }
  return embed;
}

// Steamの一部タイトルはl=japanese指定でも日本語紹介文が用意されておらず英語のまま返ってくるため、
// (このプロジェクト自体がSteam日本語化ツールなので)日本語が含まれていなければAI翻訳にかける。
var JAPANESE_CHAR_RE = /[぀-ヿ一-鿿]/;

function needsTranslation(text) {
  return !!text && !JAPANESE_CHAR_RE.test(text);
}

function buildTranslatePrompt(text) {
  return '次の英語のSteamゲーム紹介文を、自然な日本語に1〜2文で要約翻訳してください。翻訳文以外は出力しないでください。\n\n' + text;
}

// qwen3系の推論モデルは<think>...</think>を出力に混ぜてくることがあり、
// これまでJSON応答を扱う一部コマンドだけが個別に除去していた。素の文章を返す
// 大半のAIコマンドでは除去していなかったため、ここfetchChatReply側で一括して除去する。
function stripThinkBlock(text) {
  var cleaned = (text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  // 出力トークン制限等で閉じタグが欠落した場合のフォールバック。開始タグ以降を丸ごと落とす。
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
  return cleaned.trim();
}

async function fetchChatReply(prompt, apiKey, options) {
  var webSearch = (options && options.webSearch) || false;
  var body = {
    type: 'UNIFY_CHAT_WITH_AI',
    model: 'qwen3-8b',
    promptObject: { prompt: prompt, settings: { historySettings: { isMixed: false, historyMessageLimit: 0 }, webSearchSettings: { webSearch: webSearch } } }
  };
  var r = await fetchWithTimeout('https://api.1min.ai/api/chat-with-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-KEY': apiKey },
    body: JSON.stringify(body)
  }, AI_FETCH_TIMEOUT_MS);
  var d = await r.json();
  if (!r.ok || d.errorCode) throw new Error(d.message || String(r.status));
  var text = (d.aiRecord && d.aiRecord.aiRecordDetail && d.aiRecord.aiRecordDetail.resultObject && d.aiRecord.aiRecordDetail.resultObject[0]) || '';
  return stripThinkBlock(text);
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
    var embeds = [];
    if (options && options.searchGame && options.fetchPriceDetail) {
      var mentions = extractGameMentions(replyText, 3);
      for (var i = 0; i < mentions.length; i++) {
        var found = await options.searchGame(mentions[i]);
        if (!found) continue;
        var detail = await options.fetchPriceDetail(found.id);
        if (detail && needsTranslation(detail.shortDescription)) {
          try {
            var translated = await fetchChatReply(buildTranslatePrompt(detail.shortDescription), apiKey, { webSearch: false });
            if (translated) detail = Object.assign({}, detail, { shortDescription: translated });
          } catch (e) { /* 翻訳失敗時は英語のまま表示 */ }
        }
        embeds.push(buildMentionEmbed(found, detail));
      }
    }
    await message.channel.send(embeds.length ? { content: replyText, embeds: embeds } : replyText);
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
  extractGameMentions: extractGameMentions,
  buildMentionEmbed: buildMentionEmbed,
  needsTranslation: needsTranslation,
  buildTranslatePrompt: buildTranslatePrompt,
  stripThinkBlock: stripThinkBlock,
  fetchChatReply: fetchChatReply,
  handleChatMessage: handleChatMessage
};
