'use strict';

var { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
var checkWishlistPrices = require('../scripts/check-wishlist-prices.js');
var recommendGames = require('../scripts/recommend-games.js');
var steamLib = require('./lib/steam.js');
var chat = require('./chat.js');
var priceCommand = require('./commands/price.js');
var reviewCommand = require('./commands/review.js');
var wishlistCommand = require('./commands/wishlist.js');
var recommendCommand = require('./commands/recommend.js');
var askCommand = require('./commands/ask.js');
var statsCommand = require('./commands/stats.js');
var newsCommand = require('./commands/news.js');
var compareCommand = require('./commands/compare.js');
var salesCommand = require('./commands/sales.js');
var gachaCommand = require('./commands/gacha.js');
var upcomingCommand = require('./commands/upcoming.js');
var quizCommand = require('./commands/quiz.js');
var moodCommand = require('./commands/mood.js');
var hiddenGemCommand = require('./commands/hiddengem.js');
var challengeCommand = require('./commands/challenge.js');
var mashupCommand = require('./commands/mashup.js');
var hypeCommand = require('./commands/hype.js');
var coopCommand = require('./commands/coop.js');
var autocomplete = require('./lib/autocomplete.js');
var gamePool = require('./lib/gamePool.js');

var token = process.env.DISCORD_BOT_TOKEN;
var clientId = process.env.DISCORD_CLIENT_ID;
var chatChannelId = process.env.DISCORD_CHAT_CHANNEL_ID;
var steamId64 = process.env.STEAM_ID64;
var apiKey = process.env.ONEMIN_API_KEY;

if (!token || !clientId) {
  console.error('DISCORD_BOT_TOKEN と DISCORD_CLIENT_ID は必須です');
  process.exit(1);
}

var commands = [
  new SlashCommandBuilder().setName('price').setDescription('Steamゲームの現在価格を調べる')
    .addStringOption(function (opt) { return opt.setName('name').setDescription('ゲーム名').setRequired(true).setAutocomplete(true); }),
  new SlashCommandBuilder().setName('review').setDescription('レビューをAIが要約して買い判断を返す')
    .addStringOption(function (opt) { return opt.setName('name').setDescription('ゲーム名').setRequired(true).setAutocomplete(true); }),
  new SlashCommandBuilder().setName('wishlist').setDescription('ウィッシュリストの値下げ中タイトルを表示'),
  new SlashCommandBuilder().setName('recommend').setDescription('その場でAIおすすめゲームを紹介'),
  new SlashCommandBuilder().setName('ask').setDescription('ゲームについてAIに質問する(Web検索あり)')
    .addStringOption(function (opt) { return opt.setName('game').setDescription('ゲーム名').setRequired(true).setAutocomplete(true); })
    .addStringOption(function (opt) { return opt.setName('question').setDescription('質問内容').setRequired(true); }),
  new SlashCommandBuilder().setName('stats').setDescription('現在の同時接続数と実績統計を調べる')
    .addStringOption(function (opt) { return opt.setName('name').setDescription('ゲーム名').setRequired(true).setAutocomplete(true); }),
  new SlashCommandBuilder().setName('news').setDescription('最新アップデート情報をAIが要約')
    .addStringOption(function (opt) { return opt.setName('name').setDescription('ゲーム名').setRequired(true).setAutocomplete(true); }),
  new SlashCommandBuilder().setName('compare').setDescription('2本のゲームをAIが比較')
    .addStringOption(function (opt) { return opt.setName('game_a').setDescription('ゲーム名A').setRequired(true).setAutocomplete(true); })
    .addStringOption(function (opt) { return opt.setName('game_b').setDescription('ゲーム名B').setRequired(true).setAutocomplete(true); }),
  new SlashCommandBuilder().setName('sales').setDescription('今週のセールおすすめをAIが厳選'),
  new SlashCommandBuilder().setName('gacha').setDescription('格安タイトルをランダムに1本ガチャ'),
  new SlashCommandBuilder().setName('upcoming').setDescription('近日リリース予定のタイトルを紹介'),
  new SlashCommandBuilder().setName('quiz').setDescription('ヒントからゲームを当てるクイズを出題'),
  new SlashCommandBuilder().setName('mood').setDescription('今の気分に合うゲームをAIが探す')
    .addStringOption(function (opt) { return opt.setName('query').setDescription('気分・要望(例: まったり農業したい)').setRequired(true); }),
  new SlashCommandBuilder().setName('hiddengem').setDescription('高評価なのに過疎ってる隠れた名作を発掘'),
  new SlashCommandBuilder().setName('challenge').setDescription('レア実績を使った縛りプレイ企画をAIが提案')
    .addStringOption(function (opt) { return opt.setName('name').setDescription('ゲーム名').setRequired(true).setAutocomplete(true); }),
  new SlashCommandBuilder().setName('mashup').setDescription('2つのジャンルを掛け合わせたゲームを探す')
    .addStringOption(function (opt) { return opt.setName('genre_a').setDescription('ジャンル1').setRequired(true); })
    .addStringOption(function (opt) { return opt.setName('genre_b').setDescription('ジャンル2').setRequired(true); }),
  new SlashCommandBuilder().setName('hype').setDescription('レビューをAIが要約してキャッチコピー化')
    .addStringOption(function (opt) { return opt.setName('name').setDescription('ゲーム名').setRequired(true).setAutocomplete(true); }),
  new SlashCommandBuilder().setName('coop').setDescription('バラバラな好みのメンバー全員が遊べるマルチゲームと折衷プランをAIが提案')
    .addStringOption(function (opt) { return opt.setName('tastes').setDescription('メンバーそれぞれの好み(例: FPS好き、農業好き、ホラー好き)').setRequired(true); })
].map(function (c) { return c.toJSON(); });

var historyStore = { data: {} };
var askThreadIds = new Set();

var client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  allowedMentions: { parse: [], repliedUser: false }
});

client.once(Events.ClientReady, async function () {
  console.log('ログイン完了: ' + client.user.tag);
  try {
    var rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('スラッシュコマンド登録完了');
  } catch (e) {
    console.error('スラッシュコマンド登録に失敗しました: ' + e.message);
  }
});

client.on(Events.MessageCreate, function (message) {
  if (message.author.bot) return;
  var isChatChannel = !!chatChannelId && message.channelId === chatChannelId;
  var isAskThread = askThreadIds.has(message.channelId);
  if (!isChatChannel && !isAskThread) return;
  chat.handleChatMessage(message, historyStore, apiKey, { webSearch: isAskThread, searchGame: steamLib.searchGame, fetchPriceDetail: steamLib.fetchPriceDetail }).catch(function (e) {
    console.error('チャット処理でエラー: ' + e.message);
  });
});

client.on(Events.InteractionCreate, function (interaction) {
  if (interaction.isAutocomplete()) {
    autocomplete.handleGameNameAutocomplete(interaction, steamLib).catch(function (e) {
      console.error('オートコンプリート処理でエラー: ' + e.message);
    });
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  var handlers = {
    price: function () { return priceCommand.handlePriceCommand(interaction, steamLib); },
    review: function () {
      return reviewCommand.handleReviewCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchReviewSummary: steamLib.fetchReviewSummary,
        fetchGameContext: steamLib.fetchGameContext,
        fetchReviews: checkWishlistPrices.fetchReviews,
        fetchChatReply: chat.fetchChatReply
      });
    },
    wishlist: function () {
      return wishlistCommand.handleWishlistCommand(interaction, steamId64, checkWishlistPrices, steamLib);
    },
    recommend: function () {
      return recommendCommand.handleRecommendCommand(interaction, {
        fetchFeaturedPool: recommendGames.fetchFeaturedPool,
        pickRandomGames: recommendGames.pickRandomGames,
        pickRealGames: gamePool.pickRealGames,
        isRealGame: steamLib.isRealGame,
        fetchReviews: checkWishlistPrices.fetchReviews,
        fetchGameAnalysis: recommendGames.fetchGameAnalysis,
        buildHeaderEmbed: recommendGames.buildHeaderEmbed,
        buildRecommendEmbeds: recommendGames.buildRecommendEmbeds
      });
    },
    ask: function () {
      return askCommand.handleAskCommand(interaction, {
        fetchChatReply: chat.fetchChatReply,
        searchGame: steamLib.searchGame,
        apiKey: apiKey,
        appendHistory: chat.appendHistory,
        historyStore: historyStore,
        askThreadIds: askThreadIds
      });
    },
    stats: function () {
      return statsCommand.handleStatsCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchPlayerCount: steamLib.fetchPlayerCount,
        fetchAchievementStats: steamLib.fetchAchievementStats
      });
    },
    news: function () {
      return newsCommand.handleNewsCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchLatestNews: steamLib.fetchLatestNews,
        fetchChatReply: chat.fetchChatReply
      });
    },
    compare: function () {
      return compareCommand.handleCompareCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchPriceDetail: steamLib.fetchPriceDetail,
        fetchReviewSummary: steamLib.fetchReviewSummary,
        fetchChatReply: chat.fetchChatReply
      });
    },
    sales: function () {
      return salesCommand.handleSalesCommand(interaction, {
        fetchSpecialsPool: steamLib.fetchSpecialsPool,
        pickRealGames: gamePool.pickRealGames,
        isRealGame: steamLib.isRealGame,
        fetchChatReply: chat.fetchChatReply
      });
    },
    gacha: function () {
      return gachaCommand.handleGachaCommand(interaction, {
        fetchSpecialsPool: steamLib.fetchSpecialsPool,
        pickRandomGames: recommendGames.pickRandomGames,
        pickRealGames: gamePool.pickRealGames,
        isRealGame: steamLib.isRealGame,
        fetchReviewSummary: steamLib.fetchReviewSummary,
        fetchGameContext: steamLib.fetchGameContext,
        fetchChatReply: chat.fetchChatReply
      });
    },
    upcoming: function () {
      return upcomingCommand.handleUpcomingCommand(interaction, {
        fetchUpcomingPool: steamLib.fetchUpcomingPool,
        pickRandomGames: recommendGames.pickRandomGames,
        pickRealGames: gamePool.pickRealGames,
        isRealGame: steamLib.isRealGame,
        fetchGameContext: steamLib.fetchGameContext,
        fetchChatReply: chat.fetchChatReply
      });
    },
    quiz: function () {
      return quizCommand.handleQuizCommand(interaction, {
        fetchFeaturedPool: recommendGames.fetchFeaturedPool,
        pickRandomGames: recommendGames.pickRandomGames,
        pickRealGames: gamePool.pickRealGames,
        isRealGame: steamLib.isRealGame,
        fetchReviews: checkWishlistPrices.fetchReviews,
        fetchChatReply: chat.fetchChatReply
      });
    },
    mood: function () {
      return moodCommand.handleMoodCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchGameContext: steamLib.fetchGameContext,
        fetchChatReply: chat.fetchChatReply
      });
    },
    hiddengem: function () {
      return hiddenGemCommand.handleHiddenGemCommand(interaction, {
        fetchFeaturedPool: recommendGames.fetchFeaturedPool,
        pickRandomGames: recommendGames.pickRandomGames,
        pickRealGames: gamePool.pickRealGames,
        isRealGame: steamLib.isRealGame,
        fetchReviewSummary: steamLib.fetchReviewSummary,
        fetchPlayerCount: steamLib.fetchPlayerCount,
        fetchGameContext: steamLib.fetchGameContext,
        fetchChatReply: chat.fetchChatReply
      });
    },
    challenge: function () {
      return challengeCommand.handleChallengeCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchRareAchievements: steamLib.fetchRareAchievements,
        fetchGameContext: steamLib.fetchGameContext,
        fetchChatReply: chat.fetchChatReply
      });
    },
    mashup: function () {
      return mashupCommand.handleMashupCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchGameContext: steamLib.fetchGameContext,
        fetchChatReply: chat.fetchChatReply
      });
    },
    hype: function () {
      return hypeCommand.handleHypeCommand(interaction, {
        searchGame: steamLib.searchGame,
        fetchReviews: checkWishlistPrices.fetchReviews,
        fetchChatReply: chat.fetchChatReply
      });
    },
    coop: function () {
      return coopCommand.handleCoopCommand(interaction, {
        fetchChatReply: chat.fetchChatReply,
        searchGame: steamLib.searchGame,
        fetchGameContext: steamLib.fetchGameContext,
        fetchPriceDetail: steamLib.fetchPriceDetail
      });
    }
  };
  var handler = handlers[interaction.commandName];
  if (!handler) return;
  handler().catch(function (e) {
    console.error('コマンド処理でエラー(' + interaction.commandName + '): ' + e.message);
    var reply = { content: 'エラーが発生しました…' };
    if (interaction.deferred || interaction.replied) {
      interaction.editReply(reply).catch(function () {});
    } else {
      interaction.reply(reply).catch(function () {});
    }
  });
});

client.on(Events.Error, function (e) {
  console.error('discord.jsクライアントエラー: ' + e.message);
});

client.login(token);
