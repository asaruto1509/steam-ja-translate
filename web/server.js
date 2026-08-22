'use strict';
var express = require('express');
var authLib = require('./lib/auth.js');
var layout = require('./views/layout.js');
var analysisPage = require('./views/analysisPage.js');
var viewModel = require('./lib/viewModel.js');
var gameAnalysis = require('./lib/gameAnalysis.js');
var priceHistoryApi = require('./lib/priceHistoryApi.js');
var localHistoryApi = require('./lib/localHistoryApi.js');
var steamLib = require('../bot/lib/steam.js');
var chatLib = require('../bot/chat.js');
var reviewLib = require('../bot/commands/review.js');
var analysisPrompt = require('./lib/analysisPrompt.js');
var store = require('./lib/store.js');
var topPage = require('./views/topPage.js');

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

app.get('/', function (req, res) {
  var body = topPage.renderTopPage({ history: store.getHistory(), favorites: store.getFavorites() });
  res.send(layout.renderLayout(body, {}));
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
    res.send(layout.renderLayout(body, { query: name }));
  } catch (e) {
    console.error('/analyze failed:', e);
    res.status(500).send(layout.renderLayout('<p class="error">エラーが発生しました。</p>', { query: name }));
  }
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
