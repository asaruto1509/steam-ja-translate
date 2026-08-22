'use strict';
var steamLib = require('../lib/steam.js');
var reviewCategories = require('../lib/reviewCategories.js');
var THINKING_MODEL = require('../chat.js').THINKING_MODEL;

var VERDICT_EMOJI = { '今すぐ買い': '🔥', '買い': '✅', 'セール待ち': '⏳', '人を選ぶ': '🤔', '見送り': '⛔' };

// 1段階目: JSON制約を課さず自由記述でじっくり考察させる(qwen3-vl-8b-thinkingで実行、Web検索有効)。
// 好評/不評を別々に渡すことで、母数の多い側に判定が引っ張られるのを防ぐ(dashboard分析と同じ方式)。
function buildReasoningPrompt(gameName, reviewsBySentiment, gameContext) {
  var positive = (reviewsBySentiment && reviewsBySentiment.positive) || [];
  var negative = (reviewsBySentiment && reviewsBySentiment.negative) || [];
  var contextLine = '';
  if (gameContext && ((gameContext.genres && gameContext.genres.length) || (gameContext.categories && gameContext.categories.length))) {
    contextLine = 'このゲームは' + (gameContext.genres || []).join('・') + 'に属し、'
      + (gameContext.categories || []).join('・') + 'に対応しています。これを踏まえて判断してください。\n';
  }
  return 'あなたはSteamゲームレビューの詳細分析AIです。以下は「' + gameName + '」の好評レビューと不評レビューの抜粋です。'
    + '両方を踏まえて公平に判断してください。\n'
    + contextLine
    + 'Web検索でこのゲームの外部評価(Metacritic、OpenCritic、IGN等の実在するレビューサイトのスコアや評)も調べてください。\n'
    + '次の観点を自由な文章でじっくり考察してください。結論を急がず、レビューの具体的な内容を踏まえて書いてください。\n'
    + '・総合的な買い時判定(今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか)とその理由\n'
    + '・次の評価軸それぞれについて、レビューから読み取れる範囲で所感と5段階の星評価(1〜5の整数)。該当する情報が無い軸は星評価を書かず省略してよい: '
    + reviewCategories.CATEGORY_NAMES.join('、') + '\n'
    + '・具体的な良い点、悪い点\n'
    + '・こんな人におすすめ/おすすめできない人\n'
    + '・調べて分かった外部評価\n\n'
    + '【好評レビュー】\n' + positive.join('\n---\n').slice(0, 4000) + '\n\n'
    + '【不評レビュー】\n' + negative.join('\n---\n').slice(0, 4000);
}

// 2段階目: 1段階目の考察文を、既存の表示に使うJSON形式へ機械的に変換するだけの軽い呼び出し(webSearch不要)。
function buildStructuringPrompt(gameName, reasoningText) {
  return '以下は「' + gameName + '」についてのAIによる分析メモです。この内容だけを根拠に、次のJSON形式のみで出力してください。説明文やコードブロックは不要です。メモに書かれていない項目はnullまたは空配列にしてください。\n'
    + '{"verdict":"今すぐ買い/買い/セール待ち/人を選ぶ/見送りのいずれか",'
    + '"reason":"一言理由(20字程度)",'
    + '"categories":[' + reviewCategories.buildCategorySchema() + '],'
    + '"pros":["具体的な良い点(20字程度)を最大3つ"],'
    + '"cons":["具体的な悪い点(20字程度)を最大3つ"],'
    + '"audienceFor":["こんな人向け、を最大2つ"],'
    + '"audienceAgainst":["向いていない人、を最大2つ"],'
    + '"externalScores":[{"source":"サイト名(例: Metacritic)","score":"スコアや評価(例: 87/100)"}を最大4つ、無ければ空配列]}\n\n'
    + '分析メモ:\n' + reasoningText;
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
      var reviews = await deps.fetchOpposingReviews(found.id, 15);
      if (reviews.positive.length || reviews.negative.length) {
        failureReason = 'parse_failed';
        try {
          var reasoningPrompt = buildReasoningPrompt(found.name, reviews, gameContext);
          var reasoningText = await deps.fetchChatReply(reasoningPrompt, apiKey, { webSearch: true, model: THINKING_MODEL });
          var structuringPrompt = buildStructuringPrompt(found.name, reasoningText);
          var raw = await deps.fetchChatReply(structuringPrompt, apiKey, { webSearch: false });
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
  buildReasoningPrompt: buildReasoningPrompt,
  buildStructuringPrompt: buildStructuringPrompt,
  parseAnalysis: parseAnalysis,
  formatReviewReply: formatReviewReply,
  handleReviewCommand: handleReviewCommand
};
