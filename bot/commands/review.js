'use strict';

var VERDICT_EMOJI = { '今すぐ買い': '🔥', '買い': '✅', 'セール待ち': '⏳', '人を選ぶ': '🤔', '見送り': '⛔' };

function formatReviewReply(gameName, verdict) {
  if (!verdict) {
    return { content: '「' + gameName + '」のレビューが見つからなかった…' };
  }
  var emoji = VERDICT_EMOJI[verdict] || '▪';
  return {
    embeds: [{
      title: gameName,
      color: 0x66c0f4,
      description: emoji + ' **' + verdict + '**'
    }]
  };
}

async function handleReviewCommand(interaction, steamScripts) {
  var gameName = interaction.options.getString('name');
  var apiKey = process.env.ONEMIN_API_KEY;
  await interaction.deferReply();
  var found = await steamScripts.searchGame(gameName);
  var verdict = null;
  if (found && apiKey) {
    var reviews = await steamScripts.fetchReviews(found.id, 15);
    verdict = reviews.length ? await steamScripts.fetchVerdict(found.name, reviews, apiKey) : null;
  }
  await interaction.editReply(formatReviewReply(found ? found.name : gameName, verdict));
}

module.exports = { formatReviewReply: formatReviewReply, handleReviewCommand: handleReviewCommand };
