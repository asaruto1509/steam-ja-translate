'use strict';
var fetchWithTimeout = require('../../bot/lib/fetchWithTimeout.js').fetchWithTimeout;

var STEAM_SHOP_ID = 61;

function parseHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(function (e) {
      return e && e.shop && e.shop.id === STEAM_SHOP_ID && e.deal && e.deal.price && typeof e.deal.price.amount === 'number';
    })
    .map(function (e) {
      return { date: e.timestamp, price: e.deal.price.amount };
    });
}

async function lookupGameId(appid, apiKey) {
  var r = await fetchWithTimeout('https://api.isthereanydeal.com/games/lookup/v1?key=' + encodeURIComponent(apiKey) + '&appid=' + appid);
  if (!r.ok) return null;
  var d = await r.json();
  return (d && d.found && d.game && d.game.id) ? d.game.id : null;
}

async function fetchPriceHistory(appid, apiKey) {
  if (!apiKey) return [];
  var gameId = await lookupGameId(appid, apiKey);
  if (!gameId) return [];
  var r = await fetchWithTimeout('https://api.isthereanydeal.com/games/history/v2?key=' + encodeURIComponent(apiKey) + '&id=' + gameId + '&country=jp&shops=' + STEAM_SHOP_ID);
  if (!r.ok) return [];
  var entries = await r.json();
  return parseHistoryEntries(entries);
}

module.exports = {
  parseHistoryEntries: parseHistoryEntries,
  lookupGameId: lookupGameId,
  fetchPriceHistory: fetchPriceHistory
};
