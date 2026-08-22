'use strict';

// うろ覚えの説明文でもヒットさせたいので、Steamの直接検索が0件の時だけAIに頼る
// (毎回AI呼び出しすると入力の度に数秒〜十数秒待たされ、オートコンプリートとして使い物にならないため)。
var AI_FALLBACK_MODEL = 'qwen3-8b';
var MAX_SUGGESTIONS = 6;

function buildAiFallbackPrompt(query) {
  return 'Steamストアで「' + query + '」に一致するゲームが見つかりませんでした。'
    + 'これはSteamで配信されている実在のゲームの、うろ覚えのタイトルや内容の説明かもしれません。'
    + '該当しそうな実在のSteam配信ゲームのタイトルを最大5つ、JSON配列のみで答えてください。説明文やコードブロックは不要です。存在するタイトルにのみ絞ってください。\n'
    + '例: ["Hollow Knight","Celeste"]\n\n'
    + 'ユーザー入力: ' + query;
}

function parseTitleList(text) {
  var match = (text || '').match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    var arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.filter(function (t) { return typeof t === 'string' && t.trim(); }) : [];
  } catch (e) {
    return [];
  }
}

async function fetchSuggestions(query, deps) {
  var trimmed = (query || '').trim();
  if (trimmed.length < 2) return [];

  var direct = await deps.searchGameChoices(trimmed);
  if (direct.length) return direct.slice(0, MAX_SUGGESTIONS);

  if (!deps.apiKey) return [];
  var raw;
  try {
    raw = await deps.fetchChatReply(buildAiFallbackPrompt(trimmed), deps.apiKey, { webSearch: true, model: AI_FALLBACK_MODEL });
  } catch (e) {
    return [];
  }
  var titles = parseTitleList(raw).slice(0, MAX_SUGGESTIONS);
  var resolved = await Promise.all(titles.map(function (t) {
    return deps.searchGame(t).catch(function () { return null; });
  }));
  var seen = {};
  var results = [];
  resolved.forEach(function (g) {
    if (g && !seen[g.id]) {
      seen[g.id] = true;
      results.push(g);
    }
  });
  return results;
}

module.exports = {
  buildAiFallbackPrompt: buildAiFallbackPrompt,
  parseTitleList: parseTitleList,
  fetchSuggestions: fetchSuggestions
};
