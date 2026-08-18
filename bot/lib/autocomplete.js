'use strict';

function formatGameChoices(items) {
  return (items || []).slice(0, 25).map(function (it) {
    var name = it.name.slice(0, 100);
    return { name: name, value: name };
  });
}

async function handleGameNameAutocomplete(interaction, steamLib) {
  var focused = interaction.options.getFocused();
  if (!focused || focused.length < 2) {
    await interaction.respond([]);
    return;
  }
  try {
    var items = await steamLib.searchGameChoices(focused);
    await interaction.respond(formatGameChoices(items));
  } catch (e) {
    await interaction.respond([]).catch(function () {});
  }
}

module.exports = {
  formatGameChoices: formatGameChoices,
  handleGameNameAutocomplete: handleGameNameAutocomplete
};
