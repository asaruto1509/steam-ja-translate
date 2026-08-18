'use strict';
var steamLib = require('../lib/steam.js');

function formatStatsReply(gameName, appid, playerCount, achievementStats) {
  if (!appid || playerCount === null || playerCount === undefined) {
    return { content: '「' + gameName + '」の統計情報が見つからなかった…' };
  }
  var fields = [
    { name: '🔥 プレイヤー数(同時接続)', value: playerCount.toLocaleString() + '人', inline: true }
  ];
  if (achievementStats) {
    fields.push({
      name: '🏆 実績',
      value: achievementStats.count + '個 / 平均達成率 ' + achievementStats.avgUnlockPct.toFixed(1) + '%'
        + (achievementStats.rarest ? '\n最レア: `' + achievementStats.rarest.name + '` (達成率 ' + achievementStats.rarest.percent.toFixed(1) + '%)' : ''),
      inline: true
    });
  }
  return {
    embeds: [{
      title: gameName,
      url: steamLib.storeUrl(appid),
      color: 0x66c0f4,
      image: { url: steamLib.headerImageUrl(appid) },
      fields: fields
    }]
  };
}

async function handleStatsCommand(interaction, deps) {
  var gameName = interaction.options.getString('name');
  await interaction.deferReply();
  var found = await deps.searchGame(gameName);
  var playerCount = found ? await deps.fetchPlayerCount(found.id) : null;
  var achievementStats = found ? await deps.fetchAchievementStats(found.id) : null;
  await interaction.editReply(formatStatsReply(found ? found.name : gameName, found ? found.id : null, playerCount, achievementStats));
}

module.exports = { formatStatsReply: formatStatsReply, handleStatsCommand: handleStatsCommand };
