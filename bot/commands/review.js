'use strict';
var steamLib = require('../lib/steam.js');

var VERDICT_EMOJI = { '今すぐ買い': '🔥', '買い': '✅', 'セール待ち': '⏳', '人を選ぶ': '🤔', '見送り': '⛔' };

function buildAnalysisPrompt(gameName, reviewTexts) {
  var joined = reviewTexts.join('\n---\n').slice(0, 3000);
  return 'あなたはSteamゲームレビューの要約AIです。以下は「' + gameName + '」のユーザーレビュー抜粋です。\n'
    + '次のJSON形式のみで回答してください。説明文やコードブロックは不要です。\n'
    + '{"verdict":"今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか",'
    + '"reason":"一言理由(20字程度)",'
    + '"categories":[{"name":"ゲームプレイ","stars":1-5の整数またはnull},{"name":"ストーリー","stars":..},{"name":"グラフィック","stars":..},{"name":"サウンド","stars":..},{"name":"コスパ","stars":..},{"name":"安定性","stars":..}],'
    + '"pros":["具体的な良い点(20字程度)を最大3つ"],'
    + '"cons":["具体的な悪い点(20字程度)を最大3つ"],'
    + '"audienceFor":["こんな人向け、を最大2つ"],'
    + '"audienceAgainst":["向いていない人、を最大2つ"]}\n\n'
    + 'レビュー:\n' + joined;
}

function parseAnalysis(text) {
  var match = (text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
}

function starsLine(stars) {
  var n = Math.max(0, Math.min(5, stars));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function formatReviewReply(gameName, analysis, reviewSummary, appid) {
  if (!analysis) {
    return { content: '「' + gameName + '」のレビューが見つからなかった…' };
  }
  var emoji = VERDICT_EMOJI[analysis.verdict] || '▪';
  var description = emoji + ' **' + (analysis.verdict || '判定不明') + '**'
    + (analysis.reason ? '\n' + analysis.reason : '');

  var fields = [];

  var categoryLines = (analysis.categories || [])
    .filter(function (c) { return c && typeof c.stars === 'number'; })
    .map(function (c) { return c.name + ' ' + starsLine(c.stars); });
  if (categoryLines.length) fields.push({ name: '📊 カテゴリ評価', value: categoryLines.join('\n') });

  if (analysis.pros && analysis.pros.length) fields.push({ name: '✓ 良い点', value: analysis.pros.map(function (p) { return '・' + p; }).join('\n'), inline: true });
  if (analysis.cons && analysis.cons.length) fields.push({ name: '✗ 悪い点', value: analysis.cons.map(function (c) { return '・' + c; }).join('\n'), inline: true });

  if (analysis.audienceFor && analysis.audienceFor.length) fields.push({ name: '👍 こんな人向け', value: analysis.audienceFor.map(function (a) { return '・' + a; }).join('\n'), inline: true });
  if (analysis.audienceAgainst && analysis.audienceAgainst.length) fields.push({ name: '👎 向いていない人', value: analysis.audienceAgainst.map(function (a) { return '・' + a; }).join('\n'), inline: true });

  if (reviewSummary) {
    fields.push({ name: '💬 ポジティブ率', value: reviewSummary.positivePct + '% (' + reviewSummary.totalReviews.toLocaleString() + '件のレビュー)' });
  }

  var embed = {
    title: gameName,
    color: 0x66c0f4,
    description: description,
    fields: fields
  };
  if (appid) {
    embed.url = steamLib.storeUrl(appid);
    embed.image = { url: steamLib.headerImageUrl(appid) };
  }
  return { embeds: [embed] };
}

async function handleReviewCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var found = await deps.searchGame(gameName);
  var analysis = null;
  var reviewSummary = null;
  if (found) {
    reviewSummary = await deps.fetchReviewSummary(found.id);
    if (apiKey) {
      var reviews = await deps.fetchReviews(found.id, 15);
      if (reviews.length) {
        var prompt = buildAnalysisPrompt(found.name, reviews);
        var raw = await deps.fetchChatReply(prompt, apiKey, { webSearch: false });
        analysis = parseAnalysis(raw);
      }
    }
  }
  await interaction.editReply(formatReviewReply(found ? found.name : gameName, analysis, reviewSummary, found ? found.id : null));
}

module.exports = {
  buildAnalysisPrompt: buildAnalysisPrompt,
  parseAnalysis: parseAnalysis,
  formatReviewReply: formatReviewReply,
  handleReviewCommand: handleReviewCommand
};
