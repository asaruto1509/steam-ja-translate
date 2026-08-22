'use strict';
var fetchWithTimeout = require('../../bot/lib/fetchWithTimeout.js').fetchWithTimeout;

function headerImageUrl(appid) {
  return 'https://cdn.akamai.steamstatic.com/steam/apps/' + appid + '/header.jpg';
}

async function fetchOwnedGames(steamId64, apiKey) {
  if (!apiKey) return [];
  var url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=' + encodeURIComponent(apiKey)
    + '&steamid=' + encodeURIComponent(steamId64) + '&include_appinfo=1&include_played_free_games=1';
  var r = await fetchWithTimeout(url);
  if (!r.ok) return [];
  var d = await r.json();
  var games = (d.response && d.response.games) || [];
  return games.map(function (g) {
    return {
      id: String(g.appid),
      name: g.name,
      imageUrl: headerImageUrl(g.appid),
      playtimeMinutes: g.playtime_forever || 0
    };
  });
}

function filterBacklog(games, maxMinutes) {
  return games.filter(function (g) { return g.playtimeMinutes < maxMinutes; });
}

module.exports = {
  fetchOwnedGames: fetchOwnedGames,
  filterBacklog: filterBacklog
};
