'use strict';
var fs = require('node:fs');
var path = require('node:path');

function readHistoryFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function pointsForGame(history, appid) {
  return (history && Array.isArray(history[appid])) ? history[appid] : [];
}

async function fetchPlayerCountHistory(appid) {
  var history = readHistoryFile(path.join(__dirname, '..', '..', 'player_count_history.json'));
  return pointsForGame(history, appid);
}

async function fetchSentimentHistory(appid) {
  var history = readHistoryFile(path.join(__dirname, '..', '..', 'sentiment_history.json'));
  return pointsForGame(history, appid);
}

module.exports = {
  pointsForGame: pointsForGame,
  fetchPlayerCountHistory: fetchPlayerCountHistory,
  fetchSentimentHistory: fetchSentimentHistory
};
