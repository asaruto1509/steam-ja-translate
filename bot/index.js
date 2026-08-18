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
var autocomplete = require('./lib/autocomplete.js');

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
    .addStringOption(function (opt) { return opt.setName('question').setDescription('質問内容').setRequired(true); })
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
  chat.handleChatMessage(message, historyStore, apiKey, { webSearch: isAskThread }).catch(function (e) {
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
