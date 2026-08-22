'use strict';
var steamLib = require('../lib/steam.js');

var VERDICT_EMOJI = { '今すぐ買い': '🔥', '買い': '✅', 'セール待ち': '⏳', '人を選ぶ': '🤔', '見送り': '⛔' };

function buildAnalysisPrompt(gameName, reviewTexts, gameContext) {
  var joined = reviewTexts.join('\n---\n').slice(0, 3000);
  var contextLine = '';
  if (gameContext && ((gameContext.genres && gameContext.genres.length) || (gameContext.categories && gameContext.categories.length))) {
    contextLine = 'このゲームは' + (gameContext.genres || []).join('・') + 'に属し、'
      + (gameContext.categories || []).join('・') + 'に対応しています。これを踏まえて判断してください。\n';
  }
  return 'あなたはSteamゲームレビューの要約AIです。以下は「' + gameName + '」のユーザーレビュー抜粋です。\n'
    + contextLine
    + 'また、Web検索でこのゲームの外部評価(Metacritic、OpenCritic、IGN等の実在するレビューサイトのスコアや評)を調べ、分かった範囲で反映してください。\n'
    + '次のJSON形式のみで回答してください。説明文やコードブロックは不要です。\n'
    + '{"verdict":"今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか",'
    + '"reason":"一言理由(20字程度)",'
    + '"categories":[{"name":"ゲームプレイ","stars":1-5の整数またはnull},{"name":"ストーリー","stars":..},{"name":"グラフィック","stars":..},{"name":"サウンド","stars":..},{"name":"コスパ","stars":..},{"name":"安定性","stars":..}],'
    + '"pros":["具体的な良い点(20字程度)を最大3つ"],'
    + '"cons":["具体的な悪い点(20字程度)を最大3つ"],'
    + '"audienceFor":["こんな人向け、を最大2つ"],'
    + '"audienceAgainst":["向いていない人、を最大2つ"],'
    + '"externalScores":[{"source":"サイト名(例: Metacritic)","score":"スコアや評価(例: 87/100)"}を検索で見つかった範囲で最大4つ、見つからなければ空配列]}\n\n'
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

function parseAnalysis(text) {
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

function starsLine(stars) {
  var n = Math.max(0, Math.min(5, stars));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

var FAILURE_MESSAGES = {
  not_found: 'が見つからなかった…',
  no_reviews: 'はレビューがまだ無いみたい…',
  parse_failed: 'のAI分析にちょっと失敗した…もう一度試してみて'
};

function formatReviewReply(gameName, analysis, reviewSummary, appid, gameContext, failureReason) {
  if (!analysis) {
    return { content: '「' + gameName + '」' + (FAILURE_MESSAGES[failureReason] || FAILURE_MESSAGES.not_found) };
  }
  var emoji = VERDICT_EMOJI[analysis.verdict] || '▪';
  var description = emoji + ' **' + (analysis.verdict || '判定不明') + '**'
    + (analysis.reason ? '\n' + analysis.reason : '');

  var fields = [];

  if (gameContext && ((gameContext.genres && gameContext.genres.length) || (gameContext.categories && gameContext.categories.length))) {
    var tagParts = [];
    if (gameContext.genres && gameContext.genres.length) tagParts.push('🏷️ ' + gameContext.genres.join(', '));
    if (gameContext.categories && gameContext.categories.length) tagParts.push('🎮 ' + gameContext.categories.join(', '));
    fields.push({ name: 'ジャンル/特徴', value: tagParts.join('\n') });
  }

  var categoryLines = (analysis.categories || [])
    .filter(function (c) { return c && typeof c.stars === 'number'; })
    .map(function (c) { return c.name + ' ' + starsLine(c.stars); });
  if (categoryLines.length) fields.push({ name: '📊 カテゴリ評価', value: categoryLines.join('\n') });

  if (analysis.pros && analysis.pros.length) fields.push({ name: '✓ 良い点', value: analysis.pros.map(function (p) { return '・' + p; }).join('\n'), inline: true });
  if (analysis.cons && analysis.cons.length) fields.push({ name: '✗ 悪い点', value: analysis.cons.map(function (c) { return '・' + c; }).join('\n'), inline: true });

  if (analysis.audienceFor && analysis.audienceFor.length) fields.push({ name: '👍 こんな人向け', value: analysis.audienceFor.map(function (a) { return '・' + a; }).join('\n'), inline: true });
  if (analysis.audienceAgainst && analysis.audienceAgainst.length) fields.push({ name: '👎 向いていない人', value: analysis.audienceAgainst.map(function (a) { return '・' + a; }).join('\n'), inline: true });

  var externalScores = (analysis.externalScores || []).filter(function (s) { return s && s.source && s.score; });
  if (externalScores.length) {
    fields.push({ name: '🌐 外部評価', value: externalScores.map(function (s) { return s.source + ': ' + s.score; }).join('\n') });
  }

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
  var gameContext = null;
  var failureReason = 'not_found';
  if (found) {
    failureReason = 'no_reviews';
    reviewSummary = await deps.fetchReviewSummary(found.id);
    gameContext = await deps.fetchGameContext(found.id);
    if (apiKey) {
      var reviews = await deps.fetchReviews(found.id, 15);
      if (reviews.length) {
        failureReason = 'parse_failed';
        var prompt = buildAnalysisPrompt(found.name, reviews, gameContext);
        try {
          var raw = await deps.fetchChatReply(prompt, apiKey, { webSearch: true });
          analysis = parseAnalysis(raw);
          if (!analysis) console.error('/review AI応答のパースに失敗しました。生テキスト: ' + String(raw).slice(0, 500));
        } catch (e) {
          console.error('/review AI分析呼び出しに失敗しました: ' + e.message);
        }
      }
    }
  }
  await interaction.editReply(formatReviewReply(found ? found.name : gameName, analysis, reviewSummary, found ? found.id : null, gameContext, failureReason));
}

module.exports = {
  buildAnalysisPrompt: buildAnalysisPrompt,
  parseAnalysis: parseAnalysis,
  formatReviewReply: formatReviewReply,
  handleReviewCommand: handleReviewCommand
};
