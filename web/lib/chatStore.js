'use strict';
var fs = require('fs');
var path = require('path');

var DATA_DIR = path.join(__dirname, '..', 'data');
var DATA_FILE = path.join(DATA_DIR, 'chat-data.json');
var HISTORY_MAX_SIZE = 30;

function applyMessage(messages, entry, maxSize) {
  return messages.concat([entry]).slice(-maxSize);
}

function resolveKey(scope) {
  return (scope == null || scope === 'standalone') ? 'standalone' : String(scope);
}

// Object.prototype.hasOwnProperty guard: a scope value like "constructor" or
// "toString" would otherwise resolve byGame[key] to an inherited function via
// prototype-chain lookup instead of a stored conversation array.
function readGame(byGame, key) {
  var v = Object.prototype.hasOwnProperty.call(byGame, key) ? byGame[key] : null;
  return Array.isArray(v) ? v : [];
}

function loadData() {
  try {
    var raw = fs.readFileSync(DATA_FILE, 'utf8');
    var parsed = JSON.parse(raw);
    return {
      standalone: Array.isArray(parsed.standalone) ? parsed.standalone : [],
      byGame: (parsed.byGame && typeof parsed.byGame === 'object') ? parsed.byGame : {}
    };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('web dashboard chatStore: failed to load data:', e);
    }
    return { standalone: [], byGame: {} };
  }
}

function saveData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

function getConversation(scope) {
  var data = loadData();
  var key = resolveKey(scope);
  return key === 'standalone' ? data.standalone : readGame(data.byGame, key);
}

function addMessage(scope, entry) {
  try {
    var data = loadData();
    var key = resolveKey(scope);
    if (key === 'standalone') {
      data.standalone = applyMessage(data.standalone, entry, HISTORY_MAX_SIZE);
    } else {
      data.byGame[key] = applyMessage(readGame(data.byGame, key), entry, HISTORY_MAX_SIZE);
    }
    saveData(data);
  } catch (e) {
    console.error('web dashboard chatStore: failed to add message:', e);
  }
}

function clearConversation(scope) {
  try {
    var data = loadData();
    var key = resolveKey(scope);
    if (key === 'standalone') {
      data.standalone = [];
    } else {
      delete data.byGame[key];
    }
    saveData(data);
  } catch (e) {
    console.error('web dashboard chatStore: failed to clear conversation:', e);
  }
}

module.exports = {
  applyMessage: applyMessage,
  readGame: readGame,
  getConversation: getConversation,
  addMessage: addMessage,
  clearConversation: clearConversation
};
