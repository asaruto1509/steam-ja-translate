'use strict';

var DEFAULT_MAX_QUESTIONS = 20;

function buildIntroReply(maxQuestions) {
  return {
    content: '🕵️ AIゲーム探偵を開始した！このスレッドで「はい/いいえ」で答えられる質問をしてゲームを当てよう。'
      + '(最大' + maxQuestions + '問、ゲーム名を直接言い当てても正解になるよ)'
  };
}

async function handleDetectiveCommand(interaction, deps) {
  var apiKey = process.env.ONEMIN_API_KEY;
  var maxQuestions = deps.maxQuestions || DEFAULT_MAX_QUESTIONS;
  await interaction.deferReply();

  if (!apiKey) {
    await interaction.editReply({ content: 'AIゲーム探偵を出題できなかった…' });
    return;
  }

  var pool = await deps.fetchFeaturedPool();
  var shuffled = deps.pickRandomGames(pool, pool.length);
  var picked = (await deps.pickRealGames(shuffled, 1, deps.isRealGame, 15))[0] || null;
  if (!picked) {
    await interaction.editReply({ content: 'AIゲーム探偵を出題できなかった…' });
    return;
  }

  var gameContext = await deps.fetchGameContext(picked.id);
  await interaction.editReply(buildIntroReply(maxQuestions));

  try {
    var replyMessage = await interaction.fetchReply();
    var thread = await replyMessage.startThread({ name: '🕵️ AIゲーム探偵', autoArchiveDuration: 60 });
    deps.detectiveThreads.set(thread.id, {
      name: picked.name,
      id: picked.id,
      genres: (gameContext && gameContext.genres) || [],
      categories: (gameContext && gameContext.categories) || [],
      questionCount: 0,
      maxQuestions: maxQuestions
    });
  } catch (e) {
    console.error('スレッド作成に失敗しました: ' + e.message);
  }
}

module.exports = {
  buildIntroReply: buildIntroReply,
  handleDetectiveCommand: handleDetectiveCommand
};
