'use strict';

var fs = require('node:fs');
var path = require('node:path');
var wishlistLib = require('./check-wishlist-prices.js');
var steamLib = require('../bot/lib/steam.js');

// ダッシュボードの推移グラフ用に、ゲームごとの直近サンプルだけ保持する(無期限に増え続けないように)。
var MAX_SAMPLES_PER_GAME = 60;

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function appendSample(history, appid, sample, maxSamples) {
  var next = Object.assign({}, history);
  next[appid] = (next[appid] || []).concat([sample]).slice(-maxSamples);
  return next;
}

async function collectSnapshot(wishlist) {
  var playerCounts = {};
  var sentiments = {};
  var CHUNK = 4;
  for (var i = 0; i < wishlist.length; i += CHUNK) {
    var chunk = wishlist.slice(i, i + CHUNK);
    await Promise.all(chunk.map(async function (w) {
      var count = await steamLib.fetchPlayerCount(w.appid).catch(function () { return null; });
      if (typeof count === 'number') playerCounts[w.appid] = count;
      var summary = await steamLib.fetchReviewSummary(w.appid).catch(function () { return null; });
      if (summary) sentiments[w.appid] = summary.positivePct;
    }));
    if (i + CHUNK < wishlist.length) {
      await new Promise(function (res) { setTimeout(res, 800); });
    }
  }
  return { playerCounts: playerCounts, sentiments: sentiments };
}

async function main() {
  var steamId = process.env.STEAM_ID64;
  if (!steamId) {
    console.error('STEAM_ID64 は必須です');
    process.exit(1);
  }

  var wishlist = await wishlistLib.fetchWishlist(steamId);
  console.log('ウィッシュリスト件数: ' + wishlist.length);
  if (!wishlist.length) {
    console.error('ウィッシュリストが0件でした。SteamプロフィールとウィッシュリストがPublic設定になっているか確認してください。');
    process.exit(1);
  }

  var snapshot = await collectSnapshot(wishlist);
  var now = new Date().toISOString();

  var playerCountPath = path.join(__dirname, '..', 'player_count_history.json');
  var sentimentPath = path.join(__dirname, '..', 'sentiment_history.json');
  var playerCountHistory = loadJson(playerCountPath);
  var sentimentHistory = loadJson(sentimentPath);

  Object.keys(snapshot.playerCounts).forEach(function (appid) {
    playerCountHistory = appendSample(playerCountHistory, appid, { date: now, count: snapshot.playerCounts[appid] }, MAX_SAMPLES_PER_GAME);
  });
  Object.keys(snapshot.sentiments).forEach(function (appid) {
    sentimentHistory = appendSample(sentimentHistory, appid, { date: now, positivePct: snapshot.sentiments[appid] }, MAX_SAMPLES_PER_GAME);
  });

  saveJson(playerCountPath, playerCountHistory);
  saveJson(sentimentPath, sentimentHistory);
  console.log('記録件数: プレイヤー数=' + Object.keys(snapshot.playerCounts).length + ' / 感情スコア=' + Object.keys(snapshot.sentiments).length);
}

if (require.main === module) {
  main().catch(function (e) {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  appendSample: appendSample,
  collectSnapshot: collectSnapshot,
  loadJson: loadJson,
  saveJson: saveJson,
  main: main
};
