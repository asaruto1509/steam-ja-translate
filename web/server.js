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
var roulette = require('./lib/roulette.js');
var backlogPool = require('./lib/backlogPool.js');
var roulettePage = require('./views/roulettePage.js');
var recommendGames = require('../scripts/recommend-games.js');
var gamePool = require('../bot/lib/gamePool.js');
var recommendPool = require('./lib/recommendPool.js');

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

app.get('/roulette/backlog', function (req, res) {
  var body = roulettePage.renderRoulettePage({
    title: '🎰 積みゲールーレット',
    spinEndpoint: '/api/roulette/backlog/spin'
  });
  res.send(layout.renderLayout(body, {}));
});

app.get('/roulette/recommend', function (req, res) {
  var body = roulettePage.renderRoulettePage({
    title: '🎰 おすすめルーレット',
    spinEndpoint: '/api/roulette/recommend/spin'
  });
  res.send(layout.renderLayout(body, {}));
});

var BACKLOG_MAX_MINUTES = 120;
var BACKLOG_MAX_CANDIDATES = 20;

app.post('/api/roulette/backlog/spin', async function (req, res) {
  try {
    var steamId64 = process.env.STEAM_ID64;
    var apiKey = process.env.STEAM_API_KEY;
    if (!steamId64 || !apiKey) {
      res.json({ error: 'not_configured' });
      return;
    }
    var owned = await backlogPool.fetchOwnedGames(steamId64, apiKey);
    var backlog = backlogPool.filterBacklog(owned, BACKLOG_MAX_MINUTES);
    if (!backlog.length) {
      res.json({ error: 'no_candidates' });
      return;
    }
    var shuffled = recommendGames.pickRandomGames(backlog, backlog.length);
    var candidates = shuffled.slice(0, BACKLOG_MAX_CANDIDATES);
    var result = roulette.pickTripleResult(candidates);
    res.json(roulette.buildSpinPayload(candidates, result));
  } catch (e) {
    console.error('/api/roulette/backlog/spin failed:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

var RECOMMEND_MAX_CANDIDATES = 16;
// 直前のスピンで表示した候補のid。次のスピンではまずここに無いものだけからプールする
// (同じ顔ぶれが連続で出て「ランダム性が低い」と感じられる問題への対策、実機確認済み)。
var recentRecommendIds = [];

// isRealGame(=Steam appdetails呼び出し)を毎スピン最大45件ずつ叩くと、連続スピン時に
// Steam側のレート制限(403)を誘発する(実機確認済み)。結果はappidごとに数十分単位で
// 変わらないため、プロセス内メモリキャッシュで再利用しSteamへのアクセス数を抑える。
var realGameCache = {};
var REAL_GAME_CACHE_TTL_MS = 30 * 60 * 1000;
async function cachedIsRealGame(appid) {
  var cached = realGameCache[appid];
  var now = Date.now();
  if (cached && (now - cached.at) < REAL_GAME_CACHE_TTL_MS) {
    return cached.value;
  }
  var value = await steamLib.isRealGame(appid);
  realGameCache[appid] = { value: value, at: now };
  return value;
}

app.post('/api/roulette/recommend/spin', async function (req, res) {
  try {
    // scripts/recommend-games.jsのfetchFeaturedPool(top_sellers+new_releasesのみ、
    // 実測30件台)はルーレットの表示件数(16件)に対してプールが小さすぎ、回すたびに
    // ほぼ同じ顔ぶれになる(実機確認済み)。specialsも合わせて取り込み拡張したプールを使う。
    var pool = await recommendPool.fetchExpandedPool();
    var usablePool = roulette.excludeRecentlyShown(pool, recentRecommendIds, RECOMMEND_MAX_CANDIDATES);
    var shuffledPool = recommendGames.pickRandomGames(usablePool, usablePool.length);
    var realGames = await gamePool.pickRealGames(shuffledPool, RECOMMEND_MAX_CANDIDATES, cachedIsRealGame, 45);
    if (!realGames.length) {
      res.json({ error: 'no_candidates' });
      return;
    }
    // レビュー有無で当選を偏らせると、新作寄りの候補プールでは常に同じ1〜2枠にしか
    // 当たらなくなる(実機確認済み)。ルーレットは「回す楽しさ」を優先し均等ランダムにする。
    // 画像はfetchExpandedPoolが既に返す実在確認済みのcapsule画像を優先する
    // (header.jpgを自前構築すると、無名の新作タイトルでは404になることが多い、実機確認済み)。
    var candidates = realGames.map(function (g) {
      return { id: g.id, name: g.name, imageUrl: g.image || steamLib.headerImageUrl(g.id) };
    });
    recentRecommendIds = candidates.map(function (c) { return c.id; });
    var result = roulette.pickTripleResult(candidates);
    res.json(roulette.buildSpinPayload(candidates, result));
  } catch (e) {
    console.error('/api/roulette/recommend/spin failed:', e);
    res.status(500).json({ error: 'internal_error' });
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
