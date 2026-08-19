'use strict';
var steamLib = require('../lib/steam.js');

function buildHypePrompt(gameName, reviewTexts) {
  var joined = reviewTexts.join('\n---\n').slice(0, 3000);
  return 'あなたはSteamゲームの魅力を伝えるコピーライターです。以下は「' + gameName + '」のユーザーレビュー抜粋です。\n'
    + '次のJSON形式のみで回答してください。説明文やコードブロックは不要です。\n'
    + '{"catchphrase":"一瞬で魅力が伝わるキャッチコピー(20字程度)",'
    + '"goodPoints":["なぜハマるのか、具体的な良い点を最大3つ(20字程度)"],'
    + '"cautionPoints":["どんな人には合わないか、を最大2つ(20字程度)"]}\n\n'
    + 'レビュー:\n' + joined;
}

function extractJsonBlock(text) {
  var start = text.indexOf('{');
  if (start === -1) return null;
  var depth = 0;
  for (var i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseHypeResult(text) {
  // qwen3系の<think>推論ブロックに例示JSONが混じっていると誤抽出するため、先に除去する。
  var cleaned = (text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  var block = extractJsonBlock(cleaned);
  if (!block) return null;
  try {
    return JSON.parse(block);
  } catch (e) {
    return null;
  }
}

var FAILURE_MESSAGES = {
  not_found: 'が見つからなかった…',
  no_reviews: 'はレビューがまだ無いみたい…',
  parse_failed: 'のキャッチコピー生成にちょっと失敗した…もう一度試してみて'
};

function formatHypeReply(gameName, result, appid, failureReason) {
  if (!result) {
    return { content: '「' + gameName + '」' + (FAILURE_MESSAGES[failureReason] || FAILURE_MESSAGES.not_found) };
  }
  var fields = [];
  if (result.goodPoints && result.goodPoints.length) {
    fields.push({ name: '✓ 良い点', value: result.goodPoints.map(function (p) { return '・' + p; }).join('\n'), inline: true });
  }
  if (result.cautionPoints && result.cautionPoints.length) {
    fields.push({ name: '⚠ こんな人には合わないかも', value: result.cautionPoints.map(function (p) { return '・' + p; }).join('\n'), inline: true });
  }
  var embed = {
    title: gameName,
    color: 0x66c0f4,
    description: '🔥 **' + (result.catchphrase || '') + '**',
    fields: fields
  };
  if (appid) {
    embed.url = steamLib.storeUrl(appid);
    embed.image = { url: steamLib.headerImageUrl(appid) };
  }
  return { embeds: [embed] };
}

async function handleHypeCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var found = await deps.searchGame(gameName);
  var result = null;
  var failureReason = 'not_found';
  if (found) {
    failureReason = 'no_reviews';
    if (apiKey) {
      var reviews = await deps.fetchReviews(found.id, 15);
      if (reviews.length) {
        failureReason = 'parse_failed';
        var prompt = buildHypePrompt(found.name, reviews);
        var raw = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });
        result = parseHypeResult(raw);
        if (!result) console.error('/hype AI応答のパースに失敗しました。生テキスト: ' + String(raw).slice(0, 500));
      }
    }
  }
  await interaction.editReply(formatHypeReply(found ? found.name : gameName, result, found ? found.id : null, failureReason));
}

module.exports = {
  buildHypePrompt: buildHypePrompt,
  parseHypeResult: parseHypeResult,
  formatHypeReply: formatHypeReply,
  handleHypeCommand: handleHypeCommand
};
