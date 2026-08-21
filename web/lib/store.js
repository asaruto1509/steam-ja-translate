'use strict';
var fs = require('fs');
var path = require('path');

var DATA_DIR = path.join(__dirname, '..', 'data');
var DATA_FILE = path.join(DATA_DIR, 'dashboard-data.json');
var HISTORY_MAX_SIZE = 30;

function applyHistoryEntry(history, entry, maxSize) {
  var filtered = history.filter(function (h) { return h.appid !== entry.appid; });
  filtered.unshift(entry);
  return filtered.slice(0, maxSize);
}

function applyFavoriteAdd(favorites, entry) {
  var exists = favorites.some(function (f) { return f.appid === entry.appid; });
  return exists ? favorites : favorites.concat([entry]);
}

function applyFavoriteRemove(favorites, appid) {
  return favorites.filter(function (f) { return f.appid !== appid; });
}

function isFavorited(favorites, appid) {
  return favorites.some(function (f) { return f.appid === appid; });
}

function loadData() {
  try {
    var raw = fs.readFileSync(DATA_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    return {
      history: Array.isArray(parsed.history) ? parsed.history : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : []
    };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('web dashboard store: failed to load data:', e);
    }
    return { history: [], favorites: [] };
  }
}

function saveData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

function addHistoryEntry(entry) {
  try {
    var data = loadData();
    saveData({ history: applyHistoryEntry(data.history, entry, HISTORY_MAX_SIZE), favorites: data.favorites });
  } catch (e) {
    console.error('web dashboard store: failed to save history entry:', e);
  }
}

function addFavorite(entry) {
  try {
    var data = loadData();
    saveData({ history: data.history, favorites: applyFavoriteAdd(data.favorites, entry) });
  } catch (e) {
    console.error('web dashboard store: failed to add favorite:', e);
  }
}

function removeFavorite(appid) {
  try {
    var data = loadData();
    saveData({ history: data.history, favorites: applyFavoriteRemove(data.favorites, appid) });
  } catch (e) {
    console.error('web dashboard store: failed to remove favorite:', e);
  }
}

function getHistory() {
  return loadData().history;
}

function getFavorites() {
  return loadData().favorites;
}

module.exports = {
  applyHistoryEntry: applyHistoryEntry,
  applyFavoriteAdd: applyFavoriteAdd,
  applyFavoriteRemove: applyFavoriteRemove,
  isFavorited: isFavorited,
  addHistoryEntry: addHistoryEntry,
  addFavorite: addFavorite,
  removeFavorite: removeFavorite,
  getHistory: getHistory,
  getFavorites: getFavorites
};
