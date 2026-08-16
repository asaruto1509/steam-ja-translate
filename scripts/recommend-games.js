'use strict';

// top_sellersとnew_releasesの両方に同じゲームが載っているケースがあるため、
// 選出前にid重複を除去する(同じゲームが1日の投稿内で2回出るのを防ぐ)。
function _dedupeById(pool) {
  var seen = {};
  return pool.filter(function (item) {
    if (seen[item.id]) return false;
    seen[item.id] = true;
    return true;
  });
}

// Fisher-Yatesシャッフルで先頭n件を返す。rngを注入可能にすることで
// テストから決定的な乱数列を渡せるようにしている。
function pickRandomGames(pool, n, rng) {
  rng = rng || Math.random;
  var arr = _dedupeById(pool).slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, n);
}

// 本日発生した「複雑なJSONスキーマだとAIが指示文の書き写しをそのまま返す」不具合と同じ検知パターン。
// main.jsの_isLeakedStringと同じ正規表現(数値+「字以内/以上/程度」)を流用し、
// プロンプト内の文字数指示がそのまま値として書き写された場合にその項目だけを無効化する。
var LEAK_PATTERN = /\d+字(以内|以上|程度)?/;
function _isLeaked(s) {
  return typeof s === 'string' && LEAK_PATTERN.test(s);
}

function _extractJsonObject(text) {
  var match = String(text || '').match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function parseGameAnalysis(text) {
  var jsonStr = _extractJsonObject(text);
  if (!jsonStr) return null;
  var obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  var verdict = (typeof obj.verdict === 'string' && !_isLeaked(obj.verdict)) ? obj.verdict : null;
  var reason = (typeof obj.reason === 'string' && !_isLeaked(obj.reason)) ? obj.reason : '';
  var good = Array.isArray(obj.good)
    ? obj.good.filter(function (g) { return typeof g === 'string' && !_isLeaked(g); }).slice(0, 3)
    : [];
  var concern = (typeof obj.concern === 'string' && !_isLeaked(obj.concern)) ? obj.concern : '';

  return { verdict: verdict, reason: reason, good: good, concern: concern };
}

// AI分析が失敗した場合(analysisがnull)でも、価格情報だけの簡易embedとして必ず1件は出す
// (5本中1本もAI分析が成功しなかった場合でも「紹介自体はする」という設計方針)。
function buildRecommendEmbeds(games) {
  return games.map(function (g) {
    var priceLine = g.discountPercent > 0
      ? '~~¥' + g.originalPrice.toLocaleString() + '~~ → **¥' + g.finalPrice.toLocaleString() + '** (-' + g.discountPercent + '%)'
      : '¥' + g.finalPrice.toLocaleString();
    var fields = [{ name: '価格', value: priceLine, inline: true }];

    var a = g.analysis;
    if (a && a.verdict) fields.push({ name: 'AI判定', value: a.verdict, inline: true });
    if (a && a.reason) fields.push({ name: '理由', value: a.reason, inline: false });
    if (a && a.good && a.good.length) {
      fields.push({ name: '👍 良い点', value: a.good.map(function (x) { return '・' + x; }).join('\n'), inline: true });
    }
    if (a && a.concern) fields.push({ name: '⚠ 懸念', value: a.concern, inline: true });

    return {
      title: g.name,
      url: 'https://store.steampowered.com/app/' + g.id + '/',
      color: 0x66c0f4,
      thumbnail: { url: g.image },
      fields: fields
    };
  });
}

module.exports = {
  pickRandomGames: pickRandomGames,
  parseGameAnalysis: parseGameAnalysis,
  buildRecommendEmbeds: buildRecommendEmbeds
};
