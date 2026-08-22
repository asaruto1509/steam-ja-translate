'use strict';
var express = require('express');
var authLib = require('./lib/auth.js');
var layout = require('./views/layout.js');
var analysisPage = require('./views/analysisPage.js');
var viewModel = require('./lib/viewModel.js');
var gameAnalysis = require('./lib/gameAnalysis.js');
var priceHistoryApi = require('./lib/priceHistoryApi.js');
var localHistoryApi = require('./lib/localHistoryApi.js');
var searchSuggestions = require('./lib/searchSuggestions.js');
var steamLib = require('../bot/lib/steam.js');
var chatLib = require('../bot/chat.js');
var reviewLib = require('../bot/commands/review.js');
var analysisPrompt = require('./lib/analysisPrompt.js');
var store = require('./lib/store.js');
var topPage = require('./views/topPage.js');
var chatStore = require('./lib/chatStore.js');
var chatPrompt = require('./lib/chatPrompt.js');
var chatWidget = require('./views/chatWidget.js');

var PORT = process.env.PORT || 3000;
var HOST = process.env.BIND_HOST || '127.0.0.1';

var app = express();

app.get('/healthz', function (req, res) {
  res.type('text/plain').send('ok');
});

app.get('/robots.txt', function (req, res) {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

app.use(authLib.createBasicAuthMiddleware(process.env.WEB_DASHBOARD_USER, process.env.WEB_DASHBOARD_PASS));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', function (req, res) {
  var body = topPage.renderTopPage({ history: store.getHistory(), favorites: store.getFavorites() })
    + chatWidget.renderChatWidget(null, chatStore.getConversation(null));
  res.send(layout.renderLayout(body, {}));
});

app.get('/api/search-suggestions', async function (req, res) {
  var rawQuery = req.query.q;
  var query = typeof rawQuery === 'string' ? rawQuery : '';
  try {
    var suggestions = await searchSuggestions.fetchSuggestions(query, {
      searchGameChoices: steamLib.searchGameChoices,
      searchGame: steamLib.searchGame,
      fetchChatReply: chatLib.fetchChatReply,
      apiKey: process.env.ONEMIN_API_KEY
    });
    res.json(suggestions);
  } catch (e) {
    console.error('/api/search-suggestions failed:', e);
    res.json([]);
  }
});

app.get('/analyze', async function (req, res) {
  try {
    var rawName = req.query.name;
    var name = (typeof rawName === 'string' ? rawName : '').trim();
    if (!name) {
      res.send(layout.renderLayout('<p class="error">ゲーム名を入力してください。</p>', { query: name }));
      return;
    }
    var deps = {
      searchGame: steamLib.searchGame,
      fetchPriceDetail: steamLib.fetchPriceDetail,
      fetchReviewSummary: steamLib.fetchReviewSummary,
      fetchGameContext: steamLib.fetchGameContext,
      fetchPlayerCount: steamLib.fetchPlayerCount,
      fetchAchievementStats: steamLib.fetchAchievementStats,
      fetchOpposingReviews: steamLib.fetchOpposingReviews,
      fetchChatReply: chatLib.fetchChatReply,
      fetchPriceHistory: priceHistoryApi.fetchPriceHistory,
      fetchPlayerCountHistory: localHistoryApi.fetchPlayerCountHistory,
      fetchSentimentHistory: localHistoryApi.fetchSentimentHistory,
      itadApiKey: process.env.ITAD_API_KEY,
      buildReasoningPrompt: analysisPrompt.buildReasoningPrompt,
      buildStructuringPrompt: analysisPrompt.buildStructuringPrompt,
      parseAnalysis: reviewLib.parseAnalysis,
      apiKey: process.env.ONEMIN_API_KEY
    };
    var result = await gameAnalysis.fetchGameAnalysis(name, deps);
    if (result.found) {
      store.addHistoryEntry({ appid: result.found.id, name: result.found.name, searchedAt: Date.now() });
      result.isFavorite = store.isFavorited(store.getFavorites(), result.found.id);
    }
    var vm = viewModel.buildAnalysisViewModel(result);
    var body = analysisPage.renderAnalysisPage(vm);
    if (result.found) {
      body += chatWidget.renderChatWidget(vm.appid, chatStore.getConversation(vm.appid));
    }
    res.send(layout.renderLayout(body, { query: name }));
  } catch (e) {
    console.error('/analyze failed:', e);
    res.status(500).send(layout.renderLayout('<p class="error">エラーが発生しました。</p>', { query: name }));
  }
});

async function buildChatGameContext(appid) {
  try {
    var results = await Promise.all([
      steamLib.fetchPriceDetail(appid),
      steamLib.fetchReviewSummary(appid),
      steamLib.fetchGameContext(appid)
    ]);
    var priceDetail = results[0];
    var reviewSummary = results[1];
    var context = results[2];
    if (!priceDetail) return null;
    return {
      name: priceDetail.name,
      reviewSummaryText: reviewSummary ? (reviewSummary.positivePct + '% (' + reviewSummary.totalReviews.toLocaleString() + '件)') : null,
      categories: context ? context.categories : []
    };
  } catch (e) {
    return null;
  }
}

app.post('/chat/message', async function (req, res) {
  try {
    var scope = (typeof req.body.scope === 'string' && req.body.scope) ? req.body.scope : null;
    var rawMessage = typeof req.body.message === 'string' ? req.body.message : '';
    var message = rawMessage.trim().slice(0, 2000);
    if (!message) {
      res.status(400).json({ error: 'empty message' });
      return;
    }

    var gameContext = scope ? await buildChatGameContext(scope) : null;
    var history = chatStore.getConversation(scope);
    var prompt = chatPrompt.buildChatPrompt(history, message, gameContext);

    var reply;
    try {
      reply = await chatLib.fetchChatReply(prompt, process.env.ONEMIN_API_KEY, { webSearch: true });
    } catch (e) {
      reply = '';
    }
    if (!reply) reply = 'うまく返答を生成できなかった…';

    var now = Date.now();
    chatStore.addMessage(scope, { role: 'user', text: message, at: now });
    chatStore.addMessage(scope, { role: 'assistant', text: reply, at: now });

    res.json({ reply: reply });
  } catch (e) {
    console.error('/chat/message failed:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

app.post('/chat/clear', function (req, res) {
  var scope = (typeof req.body.scope === 'string' && req.body.scope) ? req.body.scope : null;
  chatStore.clearConversation(scope);
  res.json({ ok: true });
});

app.post('/favorites/add', function (req, res) {
  var appid = typeof req.body.appid === 'string' ? req.body.appid : '';
  var name = typeof req.body.name === 'string' ? req.body.name : '';
  if (appid && name) {
    store.addFavorite({ appid: appid, name: name, addedAt: Date.now() });
    res.redirect('/analyze?name=' + encodeURIComponent(name));
    return;
  }
  res.redirect('/');
});

app.post('/favorites/remove', function (req, res) {
  var appid = typeof req.body.appid === 'string' ? req.body.appid : '';
  var name = typeof req.body.name === 'string' ? req.body.name : '';
  if (appid) {
    store.removeFavorite(appid);
  }
  res.redirect(name ? '/analyze?name=' + encodeURIComponent(name) : '/');
});

if (require.main === module) {
  app.listen(PORT, HOST, function () {
    console.log('web dashboard listening on ' + HOST + ':' + PORT);
  });
}

module.exports = { app: app };
