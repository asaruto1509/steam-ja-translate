(function () {
  var BTN_CLASS       = 'ja-trans-btn';
  var BULK_CLASS      = 'ja-bulk-btn';
  var RESULT_CLASS    = 'ja-trans-result';
  var AI_RESULT_CLASS = 'ja-ai-result';
  var GEMINI_KEY_STORAGE = 'ja_trans_gemini_key';
  var ONE_MIN_KEY_STORAGE = 'ja_trans_1min_key';
  var SETTINGS_KEY    = 'ja_trans_settings';
  var CACHE_KEY       = 'ja_trans_cache_v1';
  var REVIEW_BM_KEY   = 'ja_trans_review_bookmarks_v1';
  var NL_MARK         = '⧗⧗';

  var _opts = {
    langBadge: true, highlight: true, toast: true,
    bulkDelay: 1000, model: 'gemini-3.6-flash',
    autoTranslate: false, transEngine: '1min',
    geminiTranslate: false, accordionLines: 6,
    minReviewLength: 0, aiProvider: '1min', oneMinModel: 'qwen3-8b',
    aiAutoEnrich: false
  };
  chrome.storage.local.get([SETTINGS_KEY], function (r) {
    if (r[SETTINGS_KEY]) Object.assign(_opts, r[SETTINGS_KEY]);
  });

  // ── 永続キャッシュ ──
  var _cache = {};
  var CACHE_MAX = 20000;
  chrome.storage.local.get([CACHE_KEY], function (r) {
    if (r[CACHE_KEY]) _cache = r[CACHE_KEY];
  });
  function cacheGet(text) { return _cache[text.slice(0, 120)] || null; }
  function cacheSet(text, result) {
    var k = text.slice(0, 120);
    _cache[k] = result;
    clearTimeout(window._jaCacheSave);
    window._jaCacheSave = setTimeout(function () {
      var keys = Object.keys(_cache);
      if (keys.length > CACHE_MAX) {
        keys.slice(0, keys.length - CACHE_MAX).forEach(function (k2) { delete _cache[k2]; });
      }
      var obj = {}; obj[CACHE_KEY] = _cache;
      chrome.storage.local.set(obj);
    }, 2000);
  }

  // ── レビュー自動AI強化キャッシュ（要約・感情・有用性） ──
  var ENRICH_CACHE_KEY = 'ja_trans_ai_enrich_v1';
  var _enrichCache = {};
  var ENRICH_CACHE_MAX = 20000;
  chrome.storage.local.get([ENRICH_CACHE_KEY], function (r) {
    if (r[ENRICH_CACHE_KEY]) _enrichCache = r[ENRICH_CACHE_KEY];
  });
  function enrichCacheGet(text) { return _enrichCache[text.slice(0, 120)] || null; }
  function enrichCacheSet(text, data) {
    var k = text.slice(0, 120);
    _enrichCache[k] = data;
    clearTimeout(window._jaEnrichCacheSave);
    window._jaEnrichCacheSave = setTimeout(function () {
      var keys = Object.keys(_enrichCache);
      if (keys.length > ENRICH_CACHE_MAX) {
        keys.slice(0, keys.length - ENRICH_CACHE_MAX).forEach(function (k2) { delete _enrichCache[k2]; });
      }
      var obj = {}; obj[ENRICH_CACHE_KEY] = _enrichCache;
      chrome.storage.local.set(obj);
    }, 2000);
  }

  // ── 気になるリスト（ブックマーク）──
  var BOOKMARK_KEY = 'ja_trans_bookmarks_v1';
  var _bookmarks = {};
  chrome.storage.local.get([BOOKMARK_KEY], function(r) { if (r[BOOKMARK_KEY]) _bookmarks = r[BOOKMARK_KEY]; });
  function isBookmarked(appId) { return !!_bookmarks[appId]; }
  function toggleBookmark(appId, name, verdict, priceInfo) {
    if (_bookmarks[appId]) { delete _bookmarks[appId]; }
    else {
      _bookmarks[appId] = { name: name || appId, verdict: verdict || '', priceInfo: priceInfo || null, date: Date.now() };
      var keys = Object.keys(_bookmarks);
      if (keys.length > 2000) {
        // appidは数値文字列のためObject.keys()は挿入順ではなく昇順に並ぶ。dateで最古を明示的に探す。
        var oldestBmKey = null, oldestBmDate = Infinity;
        keys.forEach(function (k) {
          var d = _bookmarks[k] && _bookmarks[k].date || 0;
          if (d < oldestBmDate) { oldestBmDate = d; oldestBmKey = k; }
        });
        if (oldestBmKey) delete _bookmarks[oldestBmKey];
      }
    }
    var obj = {}; obj[BOOKMARK_KEY] = _bookmarks;
    chrome.storage.local.set(obj);
  }

  // ── AI分析キャッシュ ──
  var AI_ANALYSIS_CACHE_KEY = 'ja_trans_ai_cache_v1';
  var _aiCache = {};
  // 判定結果だけを持つ軽量マップ。_aiCache本体はunlimitedStorageで数MB規模になり得るため、
  // バックグラウンド(service worker)側がセール通知時に毎回全体を読み込まずに済むよう分離しておく。
  var AI_VERDICT_MAP_KEY = 'ja_trans_ai_verdict_map_v1';
  var _verdictMap = {};
  // 未発売ゲーム(レビューが1件も存在しない)のappid集合。レビューが無い限り分析は原理的に
  // 成功しようがなく、「未分析ゲームを全て分析」を何度実行しても同じappidが失敗し続けて
  // 未分析件数から減らないという紛らわしい挙動になるため、既知のappidは以降スキップする。
  var UNRELEASED_KEY = 'ja_trans_unreleased_appids_v1';
  var UNRELEASED_TTL = 7 * 86400000; // 発売済みになったゲームをいつまでも除外し続けないよう7日で失効させる
  var _unreleasedSet = {};
  chrome.storage.local.get([UNRELEASED_KEY], function (r) { if (r[UNRELEASED_KEY]) _unreleasedSet = r[UNRELEASED_KEY]; });
  function _isKnownUnreleased(appid) {
    var ts = _unreleasedSet[appid];
    return !!ts && (Date.now() - ts < UNRELEASED_TTL);
  }
  function _saveUnreleasedSet() {
    try { var o = {}; o[UNRELEASED_KEY] = _unreleasedSet; chrome.storage.local.set(o); }
    catch (e) { console.warn('[SteamJaTrans] 未発売リストの保存に失敗:', e && e.message); }
  }
  chrome.storage.local.get([AI_ANALYSIS_CACHE_KEY], function (r) {
    if (r[AI_ANALYSIS_CACHE_KEY]) _aiCache = r[AI_ANALYSIS_CACHE_KEY];
    // 既存キャッシュの一度きりの洗い直し: 過去に保存された分析結果の中に、実際はDLCが
    // 存在しないのに「DLC商法懸念」等が紛れ込んでいるものがあれば取り除く。
    var _dlcSweepChanged = false;
    Object.keys(_aiCache).forEach(function (gid) {
      var entry = _aiCache[gid];
      if (!entry || !entry.analysis) return;
      var before = JSON.stringify(entry.analysis.risk_flags || []) + JSON.stringify(entry.analysis.dlc_dependency || null);
      entry.analysis = _sanitizeDlcRiskFlags(entry.analysis, { basicData: entry.basicData || null });
      var after = JSON.stringify(entry.analysis.risk_flags || []) + JSON.stringify(entry.analysis.dlc_dependency || null);
      if (before !== after) _dlcSweepChanged = true;
    });
    if (_dlcSweepChanged) {
      try {
        var sweepObj = {}; sweepObj[AI_ANALYSIS_CACHE_KEY] = _aiCache;
        chrome.storage.local.set(sweepObj);
      } catch (e) { console.warn('[SteamJaTrans] 起動時サニタイズの保存に失敗:', e && e.message); }
    }
    chrome.storage.local.get([AI_VERDICT_MAP_KEY], function (r2) {
      if (r2[AI_VERDICT_MAP_KEY]) {
        _verdictMap = r2[AI_VERDICT_MAP_KEY];
        return;
      }
      // 初回のみ: 既存の_aiCacheから判定を抽出して軽量マップを作る（過去に分析済みのゲームを取りこぼさないため）
      var built = {};
      Object.keys(_aiCache).forEach(function (gid) {
        var v = _aiCache[gid] && _aiCache[gid].analysis && _aiCache[gid].analysis.recommendation && _aiCache[gid].analysis.recommendation.verdict;
        if (v) built[gid] = v;
      });
      _verdictMap = built;
      var vObj = {}; vObj[AI_VERDICT_MAP_KEY] = _verdictMap;
      chrome.storage.local.set(vObj);
    });
  });
  function getGameId() {
    var m = location.pathname.match(/\/app\/(\d+)/);
    return m ? m[1] : null;
  }
  // ── ゲーム別メモ ──
  var GAME_NOTES_KEY = 'ja_trans_game_notes_v1';
  var _gameNotes = {};
  chrome.storage.local.get([GAME_NOTES_KEY], function (r) {
    if (r[GAME_NOTES_KEY]) _gameNotes = r[GAME_NOTES_KEY];
  });
  function _saveGameNote(appid, text) {
    text = (text || '').trim();
    if (text) _gameNotes[appid] = { text: text, ts: Date.now() };
    else delete _gameNotes[appid];
    var obj = {}; obj[GAME_NOTES_KEY] = _gameNotes;
    chrome.storage.local.set(obj);
  }
  function _openNoteEditor(appid, gameName, anchorEl, onSave) {
    var existing = document.getElementById('ja-note-editor');
    if (existing) existing.remove();
    var rect = anchorEl.getBoundingClientRect();
    var pop = document.createElement('div');
    pop.id = 'ja-note-editor';
    pop.style.cssText = 'position:fixed;top:' + (rect.bottom + 6) + 'px;left:' + Math.max(8, rect.right - 260) + 'px;'
      + 'width:260px;background:#0f1923;border:1px solid #4caf50;border-radius:6px;padding:10px;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,0.6);z-index:2147483647;font-family:sans-serif;';
    var title = document.createElement('div');
    title.style.cssText = 'color:#4caf50;font-size:11px;font-weight:bold;margin-bottom:6px;';
    title.textContent = '📝 ' + (gameName || 'このゲーム') + ' のメモ';
    var ta = document.createElement('textarea');
    ta.value = (_gameNotes[appid] && _gameNotes[appid].text) || '';
    ta.placeholder = '例: セールで買う、友達と一緒にやる予定、続編待ち…';
    ta.style.cssText = 'width:100%;min-height:70px;background:#162520;color:#c6d4df;border:1px solid #2d5a3d;'
      + 'border-radius:3px;padding:6px;font-size:12px;font-family:sans-serif;resize:vertical;box-sizing:border-box;';
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-top:8px;';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '閉じる';
    closeBtn.style.cssText = 'padding:3px 10px;background:transparent;color:#8f98a0;border:1px solid #4a5a6a;border-radius:3px;cursor:pointer;font-size:11px;';
    closeBtn.addEventListener('click', function () { pop.remove(); });
    var saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.style.cssText = 'padding:3px 10px;background:#0d1a10;color:#4caf50;border:1px solid #4caf50;border-radius:3px;cursor:pointer;font-size:11px;';
    saveBtn.addEventListener('click', function () {
      _saveGameNote(appid, ta.value);
      pop.remove();
      toast(ta.value.trim() ? 'メモを保存しました' : 'メモを削除しました', '#4caf50');
      if (onSave) onSave(ta.value.trim());
    });
    btnRow.appendChild(closeBtn); btnRow.appendChild(saveBtn);
    pop.appendChild(title); pop.appendChild(ta); pop.appendChild(btnRow);
    document.body.appendChild(pop);
    ta.focus();
    setTimeout(function () {
      document.addEventListener('click', function outsideClick(e) {
        if (!pop.contains(e.target) && e.target !== anchorEl) {
          pop.remove();
          document.removeEventListener('click', outsideClick);
        }
      });
    }, 0);
  }
  function getAnalysisCache(gameId, reviewCount) {
    var entry = _aiCache[gameId];
    if (!entry) return null;
    if (Math.abs(entry.reviewCount - reviewCount) > 5) return null;
    if (Date.now() - entry.timestamp > 86400000) return null; // 1日（ゲームは頻繁にアップデートされるため）
    return entry;
  }
  function getCacheAgeText(timestamp) {
    var mins = Math.floor((Date.now() - timestamp) / 60000);
    if (mins < 60) return mins + '分前';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + '時間前';
    return Math.floor(hrs / 24) + '日前';
  }

  // ── 日次使用回数カウント ──
  var DAILY_COUNT_KEY = 'ja_trans_daily_count_v1';
  var _dailyCount = { date: '', count: 0 };
  chrome.storage.local.get([DAILY_COUNT_KEY], function (r) {
    if (r[DAILY_COUNT_KEY]) _dailyCount = r[DAILY_COUNT_KEY];
    var today = new Date().toISOString().slice(0, 10);
    if (_dailyCount.date !== today) _dailyCount = { date: today, count: 0 };
    _updateAiBtn();
  });
  function _incrementDailyCount() {
    var today = new Date().toISOString().slice(0, 10);
    if (_dailyCount.date !== today) _dailyCount = { date: today, count: 0 };
    _dailyCount.count++;
    var obj = {}; obj[DAILY_COUNT_KEY] = _dailyCount;
    chrome.storage.local.set(obj);
    _updateAiBtn();
  }
  // ── ウィッシュリスト価格履歴（前回訪問時との比較用） ──
  var WISH_PRICE_KEY = 'ja_trans_wish_price_history_v1';
  var _wishPriceHistory = {};
  var _wishPriceHistoryLoaded = false;
  var _wishPriceHistoryDirty = false;
  chrome.storage.local.get([WISH_PRICE_KEY], function (r) {
    _wishPriceHistory = r[WISH_PRICE_KEY] || {};
    _wishPriceHistoryLoaded = true;
  });
  function _saveWishPriceHistory() {
    if (!_wishPriceHistoryDirty) return;
    _wishPriceHistoryDirty = false;
    var obj = {}; obj[WISH_PRICE_KEY] = _wishPriceHistory;
    chrome.storage.local.set(obj);
  }
  function _extractWishRowPrice(row) {
    var leaves = row.querySelectorAll('*');
    for (var i = 0; i < leaves.length; i++) {
      if (leaves[i].children.length > 0) continue;
      var m = leaves[i].textContent.trim().match(/^¥([\d,]+)$/);
      if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    }
    return null;
  }

  function _getModelRpd() {
    var m = _getActiveModel();
    if (/lite/i.test(m)) return 500;
    if (/3\.6|3\.5|2\.5|3\.1(?!.*lite)/i.test(m)) return 20;
    return 20;
  }
  function _updateAiBtn() {
    var btn = document.getElementById('ja-ai-header-btn');
    if (!btn || btn.textContent.indexOf('閉じる') >= 0 || btn.textContent.indexOf('分析中') >= 0) return;
    if (_1minKeyCache) {
      // 1min.ai(Qwen3-8B)は無料無制限なので、キーが設定されていれば回数上限表示は不要
      btn.textContent = '🤖 AI分析';
      return;
    }
    var rpd = _getModelRpd();
    var used = _dailyCount.count;
    var remaining = Math.max(0, rpd - used);
    btn.textContent = '🤖 AI分析 (' + remaining + '/' + rpd + ')';
  }
  var AI_CACHE_MAX = 20000; // unlimitedStorage権限があるので実質上限なし（極端な暴走時のみの安全弁）
  function setAnalysisCache(gameId, analysis, reviewCount, langDist, steamScore, priceInfo, gameTags, basicDataOverride) {
    var prevEntry = _aiCache[gameId];
    var prevVerdict = prevEntry && prevEntry.analysis && prevEntry.analysis.recommendation && prevEntry.analysis.recommendation.verdict;
    var newVerdict = analysis && analysis.recommendation && analysis.recommendation.verdict;
    if (prevVerdict && newVerdict && prevVerdict !== newVerdict) {
      toast('🔄 判定が変わりました: ' + prevVerdict + ' → ' + newVerdict, '#66c0f4');
    }
    // basicDataOverrideが指定された場合はそれを優先する。_extraMetaはページ単体分析用の
    // 使い回しグローバルなので、ウィッシュリスト一括分析など複数ゲームを続けて処理する経路で
    // そのまま使うと直前に分析した別ゲームのDLC情報等が誤って紐付いてしまうため。
    // basicDataOverrideが渡された(undefinedでない)場合、呼び出し元はウィッシュリスト一括分析など
    // 「このゲーム専用に取得したデータ」を明示的に持つ経路なので、使い回しグローバルの_extraMeta
    // (直前に分析した別ゲームのデータが残っている可能性がある)は一切参照しない。
    var isolatedContext = basicDataOverride !== undefined;
    var effectiveBasicData = isolatedContext ? basicDataOverride : ((_extraMeta && _extraMeta.basicData) || null);
    var effectivePlaytimeCorr = isolatedContext ? null : ((_extraMeta && _extraMeta.playtimeCorr) || null);
    // 保存前にサニタイズしておくことで、ウィッシュリスト行・ホバープレビュー・おすすめパネル等
    // _aiCacheを直接参照する全ての箇所で個別にサニタイズし直す必要がなくなる。
    analysis = _sanitizeDlcRiskFlags(analysis, { basicData: effectiveBasicData });
    _aiCache[gameId] = { analysis: analysis, reviewCount: reviewCount, langDist: langDist, steamScore: steamScore, priceInfo: priceInfo, gameTags: gameTags, timestamp: Date.now(), basicData: effectiveBasicData, playtimeCorr: effectivePlaytimeCorr, previousVerdict: prevVerdict || null };
    var keys = Object.keys(_aiCache);
    if (keys.length > AI_CACHE_MAX) {
      // appidは数値文字列のためObject.keys()は挿入順ではなく昇順に並ぶ。
      // 挿入順を保証するにはtimestampで最古のものを明示的に探して削除する。
      var oldestKey = null, oldestTs = Infinity;
      keys.forEach(function (k) {
        var ts = _aiCache[k] && _aiCache[k].timestamp || 0;
        if (ts < oldestTs) { oldestTs = ts; oldestKey = k; }
      });
      if (oldestKey) delete _aiCache[oldestKey];
    }
    // chrome.storage.local.set()は「Extension context invalidated」等で同期的にthrowすることがあり、
    // それを無防備に投げると呼び出し元(_fetchAndAnalyzeGameById等)のcatchに拾われて「分析失敗」扱いになる。
    // _aiCache自体はメモリ上更新済みなのに保存だけ失敗し、次回訪問時(ストレージから再読込)には
    // 未分析扱いに逆戻りしてしまうため、他の保存系関数と同じくtry/catchで隔離する。
    try {
      var obj = {}; obj[AI_ANALYSIS_CACHE_KEY] = _aiCache;
      chrome.storage.local.set(obj);
    } catch (e) { console.warn('[SteamJaTrans] AI分析キャッシュの保存に失敗:', e && e.message); }

    if (newVerdict) _verdictMap[gameId] = newVerdict; else delete _verdictMap[gameId];
    try {
      var vObj = {}; vObj[AI_VERDICT_MAP_KEY] = _verdictMap;
      chrome.storage.local.set(vObj);
    } catch (e) { console.warn('[SteamJaTrans] 判定マップの保存に失敗:', e && e.message); }
  }

  // ── レビュー言語分布を計算 ──
  function computeLangDist(texts) {
    var counts = {};
    texts.forEach(function (t) {
      var lang = detectLang(t);
      counts[lang] = (counts[lang] || 0) + 1;
    });
    return counts;
  }

  // ── Steamの公式スコアをページから取得 ──
  var STEAM_SCORE_MAP_KEYS = ['Overwhelmingly Positive','Very Positive','Positive','Mostly Positive','Mixed','Mostly Negative','Negative','Very Negative','Overwhelmingly Negative'];
  function getSteamScore() {
    var found = null;
    document.querySelectorAll('[class*="review_summary"],[class*="game_review_summary"]').forEach(function (el) {
      if (found) return;
      var text = el.textContent.trim();
      if (STEAM_SCORE_MAP_KEYS.indexOf(text) >= 0 && STEAM_SCORE_MAP[text]) {
        found = { en: text, ja: STEAM_SCORE_MAP[text].ja, color: STEAM_SCORE_MAP[text].color };
      }
    });
    return found;
  }

  // ── SteamタグをページのDOMから取得 ──
  function getGameTags() {
    var tags = [];
    document.querySelectorAll('.app_tag,.glance_tag,[class*="AppTag"],[data-tagid]').forEach(function (el) {
      var t = el.textContent.trim().replace(/\+$/, '').trim();
      if (t && t.length > 1 && tags.indexOf(t) < 0) tags.push(t);
    });
    return tags.slice(0, 20);
  }

  // ── 現在価格をページから取得 ──
  function getGamePrice() {
    var priceEl = document.querySelector('.game_purchase_price,.discount_final_price,[class*="finalPrice"],[class*="salePrice"]');
    if (!priceEl) return null;
    var text = priceEl.textContent.trim();
    var m = text.match(/[\d,]+/);
    if (!m) return null;
    var num = parseInt(m[0].replace(/,/g, ''), 10);
    if (!num || num > 100000) return null;

    var origEl = document.querySelector('.discount_original_price,[class*="originalPrice"]');
    var origNum = null;
    if (origEl) {
      var om = origEl.textContent.match(/[\d,]+/);
      if (om) origNum = parseInt(om[0].replace(/,/g, ''), 10);
    }
    var discountEl = document.querySelector('.discount_pct,[class*="discountPct"]');
    var pct = null;
    if (discountEl) {
      var pm = discountEl.textContent.match(/\d+/);
      if (pm) pct = parseInt(pm[0], 10);
    }
    return { current: num, original: origNum, discountPct: pct };
  }

  // ── カテゴリ別キーワードマップ ──
  var CAT_KEYWORDS = {
    'ゲームプレイ': ['gameplay','combat','mechanic','操作','ゲームプレイ','戦闘','システム','ゲームループ'],
    'ストーリー':   ['story','narrative','plot','ストーリー','物語','シナリオ','キャラ'],
    'グラフィック': ['graphic','visual','art','beautiful','グラフィック','映像','ビジュアル','画質','綺麗'],
    'サウンド':     ['music','sound','bgm','ost','サウンド','音楽','効果音','BGM','サントラ'],
    'コスパ':       ['price','worth','value','expensive','cheap','コスパ','価格','値段','高い','安い','割高'],
    '安定性':       ['bug','crash','stable','freeze','performance','バグ','クラッシュ','安定','フリーズ','エラー'],
  };

  // ── 翻訳精度フィードバック ──
  var _transFeedback = {};

  // ── セール予測用コンテキスト（analyzeWithGeminiに渡す） ──
  var _saleContextForAnalysis = '';

  // ── 機能10: 返金率推定 ──
  function calcRefundRisk(cards) {
    var total = 0, refundable = 0;
    cards.forEach(function(card) {
      var textEl = card.querySelector('[data-ja-trans]');
      if (!textEl) return;
      // playtime_at_review は DOM から取得困難なので hrs バッジで代替
      var hrsBadge = card.querySelector('.ja-hours-badge');
      var hrs = null;
      if (hrsBadge) {
        var hm = hrsBadge.textContent.match(/([\d.]+)(k?)h/);
        if (hm) hrs = parseFloat(hm[1]) * (hm[2] ? 1000 : 1);
      }
      if (hrs === null) hrs = parsePlaytime(card) || null;
      var isNeg = !!(card.querySelector('.thumbsDownIcon,.thumbsdown,[class*="thumbsDown"],[class*="ThumbsDown"]'));
      var recBadge = card.querySelector('.ja-rec-badge');
      if (!isNeg && recBadge && recBadge.textContent.indexOf('非推薦') >= 0) isNeg = true;
      total++;
      if (hrs !== null && hrs < 2 && isNeg) refundable++;
    });
    if (total === 0) return null;
    var pct = Math.round(refundable / total * 100);
    var label = pct >= 15 ? '高' : pct >= 7 ? '中' : '低';
    return { pct: pct, label: label, count: refundable, total: total };
  }

  // ── 機能11: バグ/クラッシュ頻度スコア ──
  var BUG_KW_EN = ['bug','crash','freeze','broken','unplayable','error'];
  var BUG_KW_JA = ['バグ','クラッシュ','落ちる','フリーズ','不具合','エラー'];
  function calcBugScore(texts) {
    if (!texts.length) return null;
    var allKw = BUG_KW_EN.concat(BUG_KW_JA);
    var count = texts.filter(function(t) {
      var low = t.toLowerCase();
      return allKw.some(function(k) { return low.indexOf(k) >= 0; });
    }).length;
    var pct = Math.round(count / texts.length * 100);
    var severity = pct >= 30 ? 'critical' : pct >= 15 ? 'moderate' : pct >= 5 ? 'minor' : 'clean';
    return { pct: pct, count: count, severity: severity };
  }

  // ── 機能12: マルチプレイ過疎化検知 ──
  var DEAD_KW_EN = ['dead game','no players','empty','nobody plays','ghost town'];
  var DEAD_KW_JA = ['過疎','人がいない','過疎化','マッチしない','野良がいない'];
  function calcPopulationHealth(reviewCards) {
    var allTexts = [], recentTexts = [];
    var now = Date.now();
    var threeMonthsAgo = now - 90 * 24 * 3600 * 1000;
    var allKw = DEAD_KW_EN.concat(DEAD_KW_JA);

    reviewCards.forEach(function(card) {
      var textEl = card.querySelector('[data-ja-trans]');
      if (!textEl) return;
      var clone = textEl.cloneNode(true);
      clone.querySelectorAll('button,span[class]').forEach(function(x){ x.remove(); });
      var t = clone.innerText.trim();
      if (!t) return;
      allTexts.push(t);
      var tsEl = card.querySelector('.date_posted,[class*="date_posted"]');
      if (tsEl) {
        var d = new Date(tsEl.textContent.trim());
        if (!isNaN(d.getTime()) && d.getTime() >= threeMonthsAgo) recentTexts.push(t);
      }
    });

    var total = allTexts.length;
    if (total === 0) return null;
    var matches = function(texts) {
      return texts.filter(function(t) {
        var low = t.toLowerCase();
        return allKw.some(function(k) { return low.indexOf(k) >= 0; });
      }).length;
    };
    var allPct = total > 0 ? Math.round(matches(allTexts) / total * 100) : 0;
    var recentPct = recentTexts.length > 0 ? Math.round(matches(recentTexts) / recentTexts.length * 100) : allPct;
    var status = allPct >= 20 ? 'dead' : allPct >= 10 ? 'declining' : allPct >= 3 ? 'active' : 'thriving';
    if (recentPct > allPct + 10) status = status === 'thriving' ? 'active' : status === 'active' ? 'declining' : 'dead';
    return { status: status, evidence_pct: allPct, recent_pct: recentPct };
  }

  // ── 機能13: レビュー爆撃検知 ──
  function detectReviewBomb(reviewCards) {
    var timestamps = [];
    var neg30 = 0, neg_before = 0, count30 = 0, count_before = 0;
    var now = Date.now();
    var thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;

    reviewCards.forEach(function(card) {
      var tsEl = card.querySelector('.date_posted,[class*="date_posted"]');
      if (!tsEl) return;
      var d = new Date(tsEl.textContent.trim());
      if (isNaN(d.getTime())) return;
      var isNeg = !!(card.querySelector('.thumbsDownIcon,.thumbsdown,[class*="thumbsDown"],[class*="ThumbsDown"]'));
      var recBadge = card.querySelector('.ja-rec-badge');
      if (!isNeg && recBadge && recBadge.textContent.indexOf('非推薦') >= 0) isNeg = true;
      timestamps.push(d.getTime());
      if (d.getTime() >= thirtyDaysAgo) { count30++; if (isNeg) neg30++; }
      else { count_before++; if (isNeg) neg_before++; }
    });

    if (timestamps.length < 10 || count30 < 3) return null;
    var avgPerPeriod = count_before / Math.max(1, (timestamps.length - count30));
    var negRateBefore = count_before > 0 ? neg_before / count_before : 0;
    var negRate30 = count30 > 0 ? neg30 / count30 : 0;
    var isBomb = count30 >= avgPerPeriod * 3 && (negRate30 - negRateBefore) >= 0.2;
    if (!isBomb) return null;
    return {
      detected: true,
      period: '直近30日',
      count30: count30,
      neg_pct: Math.round(negRate30 * 100)
    };
  }

  // ── 機能14: DLC依存度スコア ──
  var DLC_KW_EN = ['dlc','season pass','paywall','pay to win','microtransaction','additional content'];
  var DLC_KW_JA = ['dlc','課金','追加コンテンツ','シーズンパス','有料','買い切り'];
  function calcDlcDependency(texts) {
    if (!texts.length) return null;
    var allKw = DLC_KW_EN.concat(DLC_KW_JA);
    var count = texts.filter(function(t) {
      var low = t.toLowerCase();
      return allKw.some(function(k) { return low.indexOf(k) >= 0; });
    }).length;
    var score = Math.round(count / texts.length * 100);
    var label = score >= 30 ? '必須' : score >= 15 ? '推奨' : score >= 5 ? '任意' : 'なし';
    return { score: score, label: label, count: count };
  }

  // ── 機能17: 翻訳信頼度スコア計算 ──
  var SLANG_KW = ['lol','wtf','imo','tbh',' af ','ngl','rn '];
  function calcTranslationConfidence(originalText, translatedText) {
    var score = 100;
    // 短文
    if (originalText.length < 50) score -= 20;
    // 固有名詞（大文字始まり2語以上）
    var propNounMatches = (translatedText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || []);
    if (propNounMatches.length >= 3) score -= 15;
    // スラング
    var low = originalText.toLowerCase();
    var slangCount = SLANG_KW.filter(function(k) { return low.indexOf(k) >= 0; }).length;
    if (slangCount >= 2) score -= 20;
    else if (slangCount === 1) score -= 10;
    // 記号・絵文字の割合
    var specialChars = (originalText.match(/[^\w\s　-鿿]/g) || []).length;
    if (originalText.length > 0 && specialChars / originalText.length > 0.2) score -= 15;
    return Math.max(0, Math.min(100, score));
  }

  // ── 機能28: プレイスタイル設定 ──
  var PLAYSTYLE_KEY = 'ja_trans_playstyle_v1';
  var _playstyleCache = null;
  function getPlaystyle(cb) {
    if (_playstyleCache !== null) { cb(_playstyleCache); return; }
    chrome.storage.local.get([PLAYSTYLE_KEY], function(r) {
      _playstyleCache = r[PLAYSTYLE_KEY] || null;
      cb(_playstyleCache);
    });
  }

  // ── AI動的キーワード学習 ──
  var DYN_KW_KEY = 'ja_trans_kw_cache_v1';
  var _dynKw = {}; // { "単語": "bad"|"good"|"warn"|"note" }
  var _pendingKw = new Set();
  chrome.storage.local.get([DYN_KW_KEY], function (r) { if (r[DYN_KW_KEY]) _dynKw = r[DYN_KW_KEY]; });
  function saveDynKw() { var o = {}; o[DYN_KW_KEY] = _dynKw; chrome.storage.local.set(o); }

  // 翻訳済みテキストから未知の候補単語を抽出
  var _stopWords = new Set([
    'する','した','して','される','ある','あった','いる','いた','ない','なる','なった',
    'できる','できた','思う','思った','言う','言った','見る','見た','いく','くる',
    'それ','これ','あれ','もの','こと','ため','とき','ところ','ほう','よう','ため',
    'ゲーム','プレイ','レビュー','ユーザー','プレイヤー','コンテンツ','バージョン',
    'という','として','ている','てある','てくる','ていく','について','において',
    'とても','すごく','かなり','少し','ちょっと','とか','など','けど','から','まで',
  ]);

  function extractCandidates(text) {
    var kata  = text.match(/[ァ-ヶー]{3,}/g) || [];          // カタカナ語3文字以上
    var kanji = text.match(/[一-龠々〆〤]{2,}/g) || [];       // 漢字2文字以上
    var mixed = text.match(/[一-龠々〆〤]+[ぁ-ん]{1,3}/g) || []; // 漢字+ひらがな（面白い等）
    var set = _getKwSet();
    var known = Object.assign({}, set.bad, set.good, set.warn, set.note);
    return [...new Set([...kata, ...kanji, ...mixed])].filter(function (w) {
      return w.length >= 2 && !_stopWords.has(w) && !known[w] && !/^\d/.test(w);
    });
  }

  // ── 感情スコア計算（機能27） ──
  function calcSentimentScore(text) {
    var set = _getKwSet();
    var pos = 0, neg = 0;
    Object.keys(set.good).forEach(function(k){ if(text.indexOf(k)>=0) pos++; });
    Object.keys(set.bad).forEach(function(k){ if(text.indexOf(k)>=0) neg++; });
    if(!pos && !neg) return null;
    return Math.round((pos - neg) / (pos + neg) * 100);
  }

  var _classifyTimer = null;
  function scheduleClassify() {
    if (!_geminiKeyCache || _pendingKw.size < 15) return;
    clearTimeout(_classifyTimer);
    _classifyTimer = setTimeout(function () {
      var words = Array.from(_pendingKw).slice(0, 60);
      _pendingKw.clear();
      classifyUnknownWords(words);
    }, 4000);
  }

  async function classifyUnknownWords(words) {
    if (!words.length || !_geminiKeyCache) return;
    var prompt = 'ゲームレビューに登場した以下の単語を、ゲームの評価文脈で分類してください。\n'
      + 'bad=ネガティブ評価語 / good=ポジティブ評価語 / warn=注意・両面的語 / note=ゲーム要素・中立語 / skip=分類不要な一般語\n'
      + 'JSONのみ返答（説明不要）: {"単語": "分類", ...}\n\n'
      + '単語リスト: ' + words.join('、');
    var body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 1024 } };
    try {
      var r = await _bgFetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + _getActiveModel() + ':generateContent?key=' + _geminiKeyCache,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (!r.ok) return;
      var data = await r.json();
      var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      if (!parts) return;
      for (var i = parts.length - 1; i >= 0; i--) {
        if (!parts[i].text) continue;
        var cleaned = parts[i].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        var json = cleaned.match(/\{[\s\S]*\}/);
        if (!json) continue;
        try {
          var res = JSON.parse(json[0]);
          var added = 0;
          Object.keys(res).forEach(function (w) {
            var cat = res[w];
            if (['bad','good','warn','note'].indexOf(cat) >= 0) { _dynKw[w] = cat; added++; }
          });
          if (added > 0) {
            var overflow = Object.keys(_dynKw).length - 20000;
            if (overflow > 0) {
              var oldKeys = Object.keys(_dynKw).slice(0, overflow);
              oldKeys.forEach(function (k) { delete _dynKw[k]; });
            }
            saveDynKw();
            _kwSet = null; _kwPattern = null; // 再構築トリガー
            toast('🧠 ' + added + '語を学習しました', '#8fcfa0');
          }
          break;
        } catch (e) { continue; }
      }
    } catch (e) {}
  }

  // ── 翻訳履歴 ──
  var _history = [];
  var HISTORY_MAX = 60;
  function addToHistory(origText, result, lang) {
    _history.unshift({ text: origText.slice(0, 120), result: result.slice(0, 240), lang: lang, time: Date.now() });
    if (_history.length > HISTORY_MAX) _history.pop();
  }

  // ── 言語検出 ──
  var LANG_INFO = {
    RU: { flag: '🇷🇺', color: '#e8734a' },
    ZH: { flag: '🇨🇳', color: '#e74c3c' },
    KO: { flag: '🇰🇷', color: '#3498db' },
    JA: { flag: '🇯🇵', color: '#e74c3c' },
    AR: { flag: '🇸🇦', color: '#27ae60' },
    TH: { flag: '🇹🇭', color: '#2980b9' },
    DE: { flag: '🇩🇪', color: '#f39c12' },
    FR: { flag: '🇫🇷', color: '#2980b9' },
    EN: { flag: '🇺🇸', color: '#5dade2' },
  };

  function detectLang(text) {
    var s = text.slice(0, 300);
    var counts = {
      RU: (s.match(/[Ѐ-ӿ]/g) || []).length,
      ZH: (s.match(/[一-鿿㐀-䶿]/g) || []).length,
      KO: (s.match(/[가-힯]/g) || []).length,
      JA: (s.match(/[぀-ヿ]/g) || []).length,
      AR: (s.match(/[؀-ۿ]/g) || []).length,
      TH: (s.match(/[฀-๿]/g) || []).length,
    };
    var max = 5, lang = 'EN';
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > max) { max = counts[k]; lang = k; }
    });
    if (lang === 'EN') {
      var lower = s.toLowerCase();
      if (/\b(der|die|das|und|ist|nicht)\b/.test(lower)) lang = 'DE';
      else if (/\b(le|la|les|est|une|des)\b/.test(lower)) lang = 'FR';
    }
    return lang;
  }

  // ── キーワードハイライト ──
  var KW_BAD  = [
    'バグ','クラッシュ','重い','最悪','詐欺','ひどい','落ちる','不具合','エラー','ラグ',
    '未完成','粗雑','ゴミ','最低','つまらない','フリーズ','過剰課金','搾取','地雷','駄作',
    'クソゲー','お粗末','廃課金','ペイウォール','チート横行','VAC','BAN','返金','壊れてる',
    '過大評価','時間の無駄','金の無駄','買わないほうがいい','劣化','ハッカー','チーター',
    '過疎','過疎化','サポート最悪','アンインストール','飽きる','単調','底が浅い','詐欺商法',
    '起動しない','動かない','遊べない','ひたすら重い','カクカク','ポテンシャルの無駄',
    '放置ゲー','オワコン','過疎サーバー','マッチングしない','垢BAN','強制終了',
  ];
  var KW_GOOD = [
    '神ゲー','最高','おすすめ','面白い','神','傑作','良い','素晴らしい','楽しい','完璧',
    '買い','神作','天才','最強','中毒性','大作','名作','買って良かった','コスパ最高',
    '無限に遊べる','没入感','やめられない','リプレイ性','正統派','王道','感動','泣ける',
    'ドキドキ','ワクワク','熱い','秀作','良作','満足','大満足','神曲','強くおすすめ',
    '快適','ストレスフリー','作り込み','オリジナリティ','個性的','独特','唯一無二','革新的',
    '丁寧','練られた','ハマる','ハマった','癒やし','爽快','テンポが良い','神バランス',
    'ボリューム満点','サポートが神','神アプデ','改善が速い','神対応','すぐ直る',
  ];
  var KW_NOTE = [
    'ストーリー','グラフィック','音楽','操作','マルチ','バランス','アップデート','DLC',
    '課金','難易度','ボリューム','グラ','FPS','ローグライク','ローグライト','ソウルライク',
    'オープンワールド','サンドボックス','RPG','アクション','シューター','シミュレーション',
    'ストラテジー','ターン制','リアルタイム','MMORPG','Co-op','PvP','PvE','シングル',
    'プレイ時間','エンディング','ボス','レベル','スキル','ビルド','キャラクター','BGM',
    'SE','フレームレート','最適化','実績','アチーブメント','MOD','日本語対応','日本語字幕',
    '早期アクセス','Steam Deck','クリア','トロコン','周回','セーブ','クラフト','拠点',
    'ソロ','協力','対戦','オフライン','オンライン専用','クロスプレイ','クロスセーブ',
    'コントローラー対応','キーボード','マウス','60fps','120fps','4K','HDR',
  ];
  var KW_WARN = [
    '注意','要注意','ただし','しかし','でも','けど','問題','残念','惜しい','微妙',
    '賛否','人を選ぶ','慣れが必要','上級者向け','クセが強い','好みが分かれる',
    'ハードル高い','中毒注意','時間泥棒','廃人注意','沼','沼ゲー',
    '課金圧力','Pay-to-win','ガチャ','ランダム','未翻訳','機械翻訳','翻訳がひどい',
    '一本道','自由度低い','English Only','ただ一点','要素が薄い','作業感',
    '最初はとっつきにくい','序盤がきつい','万人向けではない','ニッチ','玄人向け',
  ];

  // 否定表現パターン（キーワードの直後に続くと無効化）
  var NEG_AFTER  = /^(じゃない|ではない|でもない|じゃなく|ではなく|できない|しない|とは言えない|わけではない|ほどではない|なくなった|なくなって)/;
  // キーワードの直前にあると無効化（英語用）
  var NEG_BEFORE = /(not |no |never |don'?t |doesn'?t |isn'?t |wasn'?t |without )$/i;

  // カテゴリ判定（動的学習キーワードを統合）
  var _kwSet = null;
  function _getKwSet() {
    if (_kwSet) return _kwSet;
    var bad = {}, good = {}, warn = {}, note = {};
    KW_BAD.forEach(function (k) { bad[k] = true; });
    KW_GOOD.forEach(function (k) { good[k] = true; });
    KW_WARN.forEach(function (k) { warn[k] = true; });
    KW_NOTE.forEach(function (k) { note[k] = true; });
    Object.keys(_dynKw).forEach(function (k) {
      var c = _dynKw[k];
      if (c === 'bad') bad[k] = true;
      else if (c === 'good') good[k] = true;
      else if (c === 'warn') warn[k] = true;
      else if (c === 'note') note[k] = true;
    });
    _kwSet = { bad: bad, good: good, warn: warn, note: note };
    return _kwSet;
  }

  // カテゴリ別スタイル定義
  var KW_STYLES = {
    bad:  { css: 'background:rgba(231,76,60,0.20);color:#ff6b6b;border-radius:3px;padding:1px 4px;font-weight:bold;border-bottom:2px solid rgba(231,76,60,0.6);', title: '⚠ ネガティブ要素', prefix: '' },
    good: { css: 'background:rgba(76,175,80,0.18);color:#69db7c;border-radius:3px;padding:1px 4px;font-weight:bold;border-bottom:2px solid rgba(76,175,80,0.6);', title: '✓ ポジティブ要素', prefix: '' },
    warn: { css: 'color:#ffa94d;border-bottom:2px dotted rgba(255,152,0,0.7);padding:0 1px;font-style:italic;', title: '注意事項', prefix: '' },
    note: { css: 'color:#74c0fc;border-bottom:1px dotted rgba(100,181,246,0.5);padding:0 1px;', title: 'ゲーム要素', prefix: '' },
  };

  // キーワードハイライト済みフラグメントを生成（否定検出付き）
  var _kwPattern = null;
  function _getKwPattern() {
    if (_kwPattern) return _kwPattern;
    var allKw = KW_BAD.concat(KW_GOOD, KW_NOTE, KW_WARN, Object.keys(_dynKw));
    // 長いキーワードを先にマッチさせるため降順ソート
    allKw.sort(function (a, b) { return b.length - a.length; });
    var escaped = allKw.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    _kwPattern = new RegExp(escaped.join('|'), 'g');
    return _kwPattern;
  }

  function buildHighlightFrag(text) {
    var frag = document.createDocumentFragment();
    var set = _getKwSet();
    var pattern = _getKwPattern();

    text.split('\n').forEach(function (line, li) {
      if (li > 0) frag.appendChild(document.createElement('br'));

      var lastIdx = 0;
      pattern.lastIndex = 0;
      var m;
      while ((m = pattern.exec(line)) !== null) {
        var kw = m[0];
        var start = m.index;
        var end = start + kw.length;

        // 前後の文脈で否定判定
        var after  = line.slice(end, end + 10);
        var before = line.slice(Math.max(0, start - 8), start);
        var negated = NEG_AFTER.test(after) || NEG_BEFORE.test(before);

        // マッチ前のプレーンテキスト
        if (start > lastIdx) {
          frag.appendChild(document.createTextNode(line.slice(lastIdx, start)));
        }

        if (!negated) {
          var cat = set.bad[kw] ? 'bad' : set.good[kw] ? 'good' : set.warn[kw] ? 'warn' : 'note';
          var style = KW_STYLES[cat];
          var span = document.createElement('span');
          span.style.cssText = style.css;
          span.title = style.title;
          span.textContent = kw;
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(kw));
        }
        lastIdx = end;
      }
      // 残りのテキスト
      if (lastIdx < line.length) {
        frag.appendChild(document.createTextNode(line.slice(lastIdx)));
      }
    });
    return frag;
  }

  function renderWithHighlight(container, text) {
    container.appendChild(buildHighlightFrag(text));
  }

  function renderPlain(container, text) {
    text.split('\n').forEach(function (line, i) {
      if (i > 0) container.appendChild(document.createElement('br'));
      container.appendChild(document.createTextNode(line));
    });
  }

  // テキストノードをハイライト済みフラグメントで置き換え
  function setNodeText(node, text) {
    if (!text) { node.textContent = ''; return; }
    var parent = node.parentNode;
    if (!parent) { node.textContent = text; return; }
    parent.replaceChild(buildHighlightFrag(text), node);
  }

  // ── トースト ──
  function toast(msg, color) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:16px;right:16px;'
      + 'background:#1b2838;color:' + (color || '#66c0f4') + ';'
      + 'padding:8px 14px;border:1px solid ' + (color || '#66c0f4') + ';'
      + 'border-radius:4px;font-size:13px;z-index:2147483647;'
      + 'font-family:sans-serif;pointer-events:none;';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3500);
  }

  // ── Markdown軽量レンダラー（太字・見出し・箇条書き・コードフェンス対応） ──
  function renderLiteMarkdown(el, text) {
    el.textContent = '';
    var lines = String(text || '').split('\n').filter(function (l) { return !/^\s*```/.test(l); });
    lines.forEach(function (rawLine, i) {
      if (i > 0) el.appendChild(document.createElement('br'));
      var line = rawLine;
      var isHeading = /^\s{0,3}#{1,6}\s+/.test(line);
      if (isHeading) line = line.replace(/^\s{0,3}#{1,6}\s+/, '');
      var isBullet = /^\s*[-*]\s+/.test(line);
      if (isBullet) line = '・' + line.replace(/^\s*[-*]\s+/, '');

      var target = el;
      if (isHeading) {
        var headWrap = document.createElement('strong');
        el.appendChild(headWrap);
        target = headWrap;
      }
      line.split(/(\*\*[^*]+\*\*)/g).forEach(function (part) {
        if (!part) return;
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          var strong = document.createElement('strong');
          strong.textContent = part.slice(2, -2);
          target.appendChild(strong);
        } else {
          target.appendChild(document.createTextNode(part));
        }
      });
    });
  }

  // ── クリップボードコピー ──
  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text).then(function () { toast('コピーしました ✓', '#4caf50'); });
    } catch (e) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('コピーしました ✓', '#4caf50'); } catch (e2) {}
      ta.remove();
    }
  }

  // ── 読み上げ(TTS) ──
  // SteamアプリのCEF内蔵ブラウザではspeechSynthesisや日本語音声が無い場合があるため、
  // ボタンを出す前に利用可否を確認する（無いのに出すと押しても無反応になる）。
  var _ttsVoicesReady = false;
  var _ttsHasJaVoice = null;
  function _ttsAvailable() {
    if (typeof window.speechSynthesis === 'undefined') return false;
    if (_ttsHasJaVoice !== null) return _ttsHasJaVoice;
    var voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) {
      _ttsHasJaVoice = voices.some(function (v) { return /^ja/i.test(v.lang); });
      return _ttsHasJaVoice;
    }
    // 音声リストの非同期ロード待ち（初回は空配列のことが多い）
    if (!_ttsVoicesReady) {
      _ttsVoicesReady = true;
      window.speechSynthesis.addEventListener('voiceschanged', function () {
        var vs = window.speechSynthesis.getVoices();
        _ttsHasJaVoice = vs.some(function (v) { return /^ja/i.test(v.lang); });
      });
    }
    return true; // 判定確定までは一旦表示（次回以降は正しく判定される）
  }
  function _speak(text) {
    if (typeof window.speechSynthesis === 'undefined') { toast('この環境は読み上げに対応していません', '#e74c3c'); return; }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    window.speechSynthesis.speak(u);
  }

  // ── _timeoutSignal()の互換ラッパー ──
  // Steamアプリ内蔵ブラウザ(CEF)は古いChromiumベースの場合があり、
  // AbortSignal.timeout（比較的新しいAPI）が存在しない可能性があるため手動実装にフォールバックする。
  function _timeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      try { return AbortSignal.timeout(ms); } catch (e) {}
    }
    var controller = new AbortController();
    setTimeout(function () { controller.abort(); }, ms);
    return controller.signal;
  }

  // ── 外部ドメイン(Steam以外)向けfetchをバックグラウンド経由で代行 ──
  // Steamアプリ内蔵ブラウザ(CEF/Extendium)ではcontent scriptからの外部ドメイン通信が
  // ブロックされる場合がある。バックグラウンドはページのCSP制約を受けないため、
  // 翻訳・AI分析など非Steamドメインの通信はすべてこれを経由させる。
  function _bgFetch(url, options) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ type: 'proxyFetch', url: url, options: options || {} }, function (resp) {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!resp) { reject(new Error('バックグラウンドから応答がありません')); return; }
        if (resp.status === 0 && resp.error) { reject(new Error(resp.error)); return; }
        resolve({
          ok: resp.ok,
          status: resp.status,
          json: function () { return Promise.resolve(JSON.parse(resp.bodyText)); },
          text: function () { return Promise.resolve(resp.bodyText); }
        });
      });
    });
  }

  // ── 翻訳（Google GTX / MyMemory / Gemini切り替え対応）──
  var _geminiKeyCache = null;
  var _1minKeyCache = null;
  chrome.storage.local.get([GEMINI_KEY_STORAGE, ONE_MIN_KEY_STORAGE], function (r) {
    _geminiKeyCache = r[GEMINI_KEY_STORAGE] || null;
    _1minKeyCache = r[ONE_MIN_KEY_STORAGE] || null;
    _updateAiBtn();
  });

  // クォータ超過時のフォールバックモデル（500 RPD）
  var QUOTA_FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
  var _quotaFallbackIdx = -1; // -1=フォールバックなし、0以上=QUOTA_FALLBACK_MODELS[idx]を使用中
  var _lastAnalysisModel = null; // AI総合分析で実際に使われたモデル名（フォールバック込みで正確に追跡）
  var _lastSearchSources = null; // 直近のAI呼び出しでWeb検索が実行された場合の参照URL一覧

  function _getActiveModel() {
    return _quotaFallbackIdx >= 0
      ? QUOTA_FALLBACK_MODELS[_quotaFallbackIdx]
      : (_opts.model || 'gemini-3.6-flash');
  }

  function _handleQuotaError(errMsg) {
    if (!/quota|429|limit/i.test(errMsg)) return false;
    var next = _quotaFallbackIdx + 1;
    if (next < QUOTA_FALLBACK_MODELS.length) {
      _quotaFallbackIdx = next;
      toast('⚠ クォータ超過 → ' + QUOTA_FALLBACK_MODELS[next] + ' に切り替え', '#f6c744');
      return true;
    }
    return false;
  }

  // 機能9: 文脈翻訳（ゲームタイトル・タグを考慮）
  async function translateWithGeminiContext(text, gameTitle, gameTags, apiKey) {
    var prompt = 'ゲーム「' + (gameTitle || '不明') + '」(タグ: ' + (gameTags || []).join(', ') + ') のレビューを自然な日本語に翻訳してください。\n'
      + 'ゲーム用語・固有名詞は適切に扱い、翻訳文のみを出力してください（説明不要）。\n\n'
      + '原文:\n' + text;
    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
    };
    var r = await _bgFetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + _getActiveModel() + ':generateContent?key=' + apiKey,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!r.ok) {
      var eb = await r.json().catch(function () { return {}; });
      var em = (eb.error && eb.error.message) ? eb.error.message : String(r.status);
      if (_handleQuotaError(em)) return translateWithGeminiContext(text, gameTitle, gameTags, apiKey);
      throw new Error(em);
    }
    var data = await r.json();
    var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    if (!parts) throw new Error('no parts');
    for (var i = parts.length - 1; i >= 0; i--) {
      if (parts[i].text) return parts[i].text.trim();
    }
    throw new Error('no text');
  }

  async function translateWithGemini(text, apiKey) {
    var prompt = 'ゲームレビューの以下のテキストを自然な日本語に翻訳してください。翻訳のみ出力してください。\n\n' + text;
    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
    };
    var r = await _bgFetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + _getActiveModel() + ':generateContent?key=' + apiKey,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!r.ok) {
      var errBody2 = await r.json().catch(function () { return {}; });
      var errMsg2 = (errBody2.error && errBody2.error.message) ? errBody2.error.message : String(r.status);
      if (_handleQuotaError(errMsg2)) return translateWithGemini(text, apiKey);
      throw new Error(errMsg2);
    }
    var data = await r.json();
    var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    if (!parts) throw new Error('no parts');
    for (var i = parts.length - 1; i >= 0; i--) {
      if (parts[i].text) return parts[i].text.trim();
    }
    throw new Error('no text');
  }

  async function translate(text) {
    var cached = cacheGet(text);
    if (cached) return cached;

    // 機能9: Geminiエンジン選択時（文脈翻訳）
    // 1min.ai翻訳モード
    if (_opts.transEngine === '1min' && _1minKeyCache) {
      try {
        var oneMinPrompt = 'ゲームレビューを自然な日本語に翻訳してください。翻訳のみ出力してください。\n\n' + text;
        var translated = await _callAiForText(oneMinPrompt, '1min', _1minKeyCache);
        if (translated) { cacheSet(text, translated); return translated; }
      } catch (e) { /* フォールバック: Google Translate */ }
    }

    if (_opts.transEngine === 'gemini' && _geminiKeyCache) {
      try {
        var titleElTr = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
        var gameTitleTr = titleElTr ? titleElTr.textContent.trim() : '';
        var gameTagsTr = getGameTags();
        var gCtxResult = await translateWithGeminiContext(text, gameTitleTr, gameTagsTr, _geminiKeyCache);
        if (gCtxResult) { cacheSet(text, gCtxResult); return gCtxResult; }
      } catch (e) { /* フォールバック: Google Translate */ }
    }

    // Gemini翻訳モード（旧オプション互換）
    if (_opts.geminiTranslate && _geminiKeyCache) {
      try {
        var gResult = await translateWithGemini(text, _geminiKeyCache);
        if (gResult) { cacheSet(text, gResult); return gResult; }
      } catch (e) { /* フォールバック */ }
    }

    var q = text.replace(/\n/g, ' ' + NL_MARK + ' ').slice(0, 2000);

    // Google Translate
    if (_opts.transEngine !== 'mymemory') {
      try {
        var r = await _bgFetch(
          'https://translate.googleapis.com/translate_a/single'
          + '?client=gtx&sl=auto&tl=ja&dt=t&q=' + encodeURIComponent(q)
        );
        if (r.ok) {
          var d = await r.json();
          var raw = d[0].map(function (s) { return s[0]; }).join('');
          var result = raw.replace(new RegExp('\\s*' + NL_MARK + '\\s*', 'g'), '\n');
          cacheSet(text, result);
          return result;
        }
      } catch (e) { console.warn('translate (gtx):', e); }
    }

    // MyMemory
    try {
      var r2 = await _bgFetch(
        'https://api.mymemory.translated.net/get'
        + '?q=' + encodeURIComponent(text.slice(0, 500)) + '&langpair=auto|ja'
      );
      if (r2.ok) {
        var d2 = await r2.json();
        if (d2.responseData && d2.responseData.translatedText) {
          var res2 = d2.responseData.translatedText;
          cacheSet(text, res2);
          return res2;
        }
      }
    } catch (e2) { console.warn('translate (mymemory):', e2); }

    // Google fallback when MyMemory was primary
    if (_opts.transEngine === 'mymemory') {
      try {
        var r3 = await _bgFetch(
          'https://translate.googleapis.com/translate_a/single'
          + '?client=gtx&sl=auto&tl=ja&dt=t&q=' + encodeURIComponent(q)
        );
        if (r3.ok) {
          var d3 = await r3.json();
          var raw3 = d3[0].map(function (s) { return s[0]; }).join('');
          var res3 = raw3.replace(new RegExp('\\s*' + NL_MARK + '\\s*', 'g'), '\n');
          cacheSet(text, res3);
          return res3;
        }
      } catch (e3) {}
    }
    return null;
  }

  // ── 機能17: ゲーム用語辞書 ──
  var GLOSSARY_KEY = 'ja_trans_glossary_v1';
  var _glossaryCache = null;
  function loadGlossary(cb) {
    if (_glossaryCache !== null) { cb(_glossaryCache); return; }
    chrome.storage.local.get([GLOSSARY_KEY], function(r) {
      _glossaryCache = r[GLOSSARY_KEY] || {};
      cb(_glossaryCache);
    });
  }
  function applyGlossary(text, cb) {
    loadGlossary(function(glossary) {
      var keys = Object.keys(glossary);
      if (!keys.length) { cb(text); return; }
      var result = text;
      keys.forEach(function(k) {
        if (!k) return;
        var escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'gi'), glossary[k]);
      });
      cb(result);
    });
  }

  // ── Gemini AI分析 ──
  function promptApiKey(onSet) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);'
      + 'z-index:2147483646;display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#1b2838;border:1px solid #66c0f4;border-radius:6px;'
      + 'padding:20px 24px;width:360px;font-family:sans-serif;color:#c6d4df;';
    var title = document.createElement('div');
    title.style.cssText = 'color:#66c0f4;font-size:14px;font-weight:bold;margin-bottom:8px;';
    title.textContent = '🤖 Gemini APIキーを入力';
    var desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px;margin-bottom:12px;line-height:1.5;';
    desc.textContent = 'Google AI Studio（aistudio.google.com）で無料取得できます。';
    var input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'AIza...';
    input.style.cssText = 'width:100%;box-sizing:border-box;background:#2a475e;'
      + 'border:1px solid #4a5a6a;border-radius:3px;color:#c6d4df;'
      + 'padding:6px 8px;font-size:13px;margin-bottom:12px;';
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.style.cssText = 'padding:5px 14px;background:#1b2838;color:#c6d4df;border:1px solid #4a5a6a;border-radius:3px;cursor:pointer;font-size:12px;';
    var saveBtn = document.createElement('button');
    saveBtn.textContent = '保存して分析';
    saveBtn.style.cssText = 'padding:5px 14px;background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;border-radius:3px;cursor:pointer;font-size:12px;';
    cancelBtn.addEventListener('click', function () { overlay.remove(); });
    saveBtn.addEventListener('click', function () {
      var key = input.value.trim();
      if (!key) return;
      var obj = {}; obj[GEMINI_KEY_STORAGE] = key;
      chrome.storage.local.set(obj);
      _geminiKeyCache = key;
      overlay.remove();
      onSet(key);
    });
    box.appendChild(title); box.appendChild(desc); box.appendChild(input);
    btnRow.appendChild(cancelBtn); btnRow.appendChild(saveBtn);
    box.appendChild(btnRow); overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
  }

  // プロバイダー自動選択+フォールバック付きJSON取得ショートハンド
  async function _aiJson(prompt, webSearch) {
    var provider = (_opts.aiProvider === '1min' && _1minKeyCache) ? '1min' : 'gemini';
    var key = provider === '1min' ? _1minKeyCache : _geminiKeyCache;
    if (!key && _1minKeyCache) { provider = '1min'; key = _1minKeyCache; }
    if (!key) throw new Error('APIキーが未設定です');
    var result = await _callAiForJson(prompt, provider, key, 0, webSearch);
    if ((result === '__RETRY__' || result === null) && provider === 'gemini' && _1minKeyCache) {
      toast('⚠ Gemini失敗 → 1min.aiにフォールバック', '#f6c744');
      result = await _callAiForJson(prompt, '1min', _1minKeyCache, 0, webSearch);
    }
    if (!result || result === '__RETRY__') throw new Error('JSON parse failed');
    return result;
  }

  async function _aiText(prompt, webSearch) {
    var provider = (_opts.aiProvider === '1min' && _1minKeyCache) ? '1min' : 'gemini';
    var key = provider === '1min' ? _1minKeyCache : _geminiKeyCache;
    if (!key && _1minKeyCache) { provider = '1min'; key = _1minKeyCache; }
    if (!key) throw new Error('APIキーが未設定です');
    var text = null;
    try {
      text = await _callAiForText(prompt, provider, key, webSearch);
    } catch (e) {
      if (provider === 'gemini' && _1minKeyCache) {
        toast('⚠ Gemini失敗 → 1min.aiにフォールバック', '#f6c744');
        text = await _callAiForText(prompt, '1min', _1minKeyCache, webSearch);
      } else {
        throw e;
      }
    }
    if (!text && provider === 'gemini' && _1minKeyCache) {
      toast('⚠ Gemini空応答 → 1min.aiにフォールバック', '#f6c744');
      text = await _callAiForText(prompt, '1min', _1minKeyCache);
    }
    if (!text) throw new Error('AI応答取得失敗');
    return text;
  }

  async function _callAiForText(prompt, provider, apiKey, webSearch) {
    if (provider === '1min') {
      var model = (_opts && _opts.oneMinModel) || 'qwen3-8b';
      var body1m = { type: 'UNIFY_CHAT_WITH_AI', model: model, promptObject: { prompt: prompt, settings: { historySettings: { isMixed: false, historyMessageLimit: 0 }, webSearchSettings: { webSearch: !!webSearch } } } };
      var r1m = await _bgFetch('https://api.1min.ai/api/chat-with-ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'API-KEY': apiKey }, body: JSON.stringify(body1m) });
      var d1m = await r1m.json();
      if (!r1m.ok || d1m.errorCode) throw new Error(d1m.message || String(r1m.status));
      var searchList1m = d1m.aiRecord && d1m.aiRecord.aiRecordDetail && d1m.aiRecord.aiRecordDetail.promptObject && d1m.aiRecord.aiRecordDetail.promptObject.searchContentList;
      _lastSearchSources = (searchList1m && searchList1m.length) ? searchList1m : null;
      return (d1m.aiRecord && d1m.aiRecord.aiRecordDetail && d1m.aiRecord.aiRecordDetail.resultObject && d1m.aiRecord.aiRecordDetail.resultObject[0]) || '';
    } else {
      _lastSearchSources = null;
      var body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1024 } };
      var r = await _bgFetch('https://generativelanguage.googleapis.com/v1beta/models/' + _getActiveModel() + ':generateContent?key=' + apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var d = await r.json();
      if (!r.ok) throw new Error((d.error && d.error.message) || String(r.status));
      var parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
      return parts && parts.length ? parts[parts.length - 1].text.trim() : '';
    }
  }

  // ── レビュー自動AI強化バッジ描画 ──
  function _renderEnrichBadge(el, data) {
    if (!data || !el || el.querySelector('.ja-enrich-summary')) return;
    if (data.summary) {
      var sumEl = document.createElement('div');
      sumEl.className = 'ja-enrich-summary';
      sumEl.style.cssText = 'margin-top:4px;color:#8f98a0;font-size:10px;font-family:sans-serif;';
      sumEl.textContent = '📝 ' + data.summary;
      el.appendChild(sumEl);
    }
    if (data.usefulness) {
      var USE_STYLE = { high: { c: '#4caf50', t: '有用性:高' }, mid: { c: '#f6c744', t: '有用性:中' }, low: { c: '#8f98a0', t: '有用性:低' } };
      var us = USE_STYLE[data.usefulness] || USE_STYLE.mid;
      var badge = document.createElement('span');
      badge.className = 'ja-enrich-badge';
      badge.style.cssText = 'display:inline-block;margin-top:4px;padding:2px 7px;border-radius:10px;'
        + 'font-size:10px;font-family:sans-serif;vertical-align:middle;'
        + 'color:' + us.c + ';background:rgba(0,0,0,0.25);border:1px solid ' + us.c + ';';
      badge.textContent = '🎯 ' + us.t;
      el.appendChild(badge);
    }
  }

  // ── レビュー自動AI強化: 複数レビューを1コールで要約・感情・有用性判定（Qwen3-8B固定・無料） ──
  async function _enrichReviewsBatch(items) {
    if (!items || !items.length || !_1minKeyCache) return;
    var numbered = items.map(function (it, i) { return (i + 1) + '. ' + it.text.slice(0, 500); }).join('\n\n');
    var prompt = '以下は複数のSteamレビューです。それぞれについて、日本語で20字以内の要約(summary)、'
      + '感情(sentiment: positive/negative/neutral)、他プレイヤーへの有用性(usefulness: high/mid/low)を判定し、'
      + 'レビューと同じ順番のJSON配列のみで返してください（説明文・コードブロック不要）。\n'
      + '形式: [{"summary":"...","sentiment":"positive","usefulness":"high"}, ...]\n\n' + numbered;
    var body = {
      type: 'UNIFY_CHAT_WITH_AI',
      model: 'qwen3-8b',
      promptObject: { prompt: prompt, settings: { historySettings: { isMixed: false, historyMessageLimit: 0 }, webSearchSettings: { webSearch: false } } }
    };
    // 失敗時はdata-ja-enrichedマーカーを外し、次回scan()で再挑戦できるようにする
    // （マーカーを残したままだと一時的なAPIエラーでそのレビューが永久に強化対象から漏れる）
    function _resetEnrichedFlag(it) { delete it.el.dataset.jaEnriched; }
    try {
      var r = await _bgFetch('https://api.1min.ai/api/chat-with-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'API-KEY': _1minKeyCache },
        body: JSON.stringify(body)
      });
      var d = await r.json();
      if (!r.ok || d.errorCode) { console.warn('[SteamJaTrans][enrich] APIエラー', r.status, d.errorCode, d.message); items.forEach(_resetEnrichedFlag); return; }
      var text = (d.aiRecord && d.aiRecord.aiRecordDetail && d.aiRecord.aiRecordDetail.resultObject && d.aiRecord.aiRecordDetail.resultObject[0]) || '';
      var cleaned = text.replace(/```json|```/g, '').trim();
      var match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) { console.warn('[SteamJaTrans][enrich] JSON配列が見つからない', text.slice(0, 300)); items.forEach(_resetEnrichedFlag); return; }
      var results = JSON.parse(match[0]);
      items.forEach(function (it, i) {
        var data = results[i];
        if (!data) { _resetEnrichedFlag(it); return; }
        enrichCacheSet(it.text, data);
        _renderEnrichBadge(it.el, data);
      });
    } catch (e) { console.warn('[SteamJaTrans][enrich] 例外', e && e.message); items.forEach(_resetEnrichedFlag); }
  }

  // ── レビュー自動AI強化のスケジューリング（バッチ+間隔制御） ──
  function _scheduleReviewEnrich() {
    if (!_opts.aiAutoEnrich || !_1minKeyCache) return;
    var candidates = [];
    document.querySelectorAll('[data-ja-trans="1"]:not([data-ja-enriched])').forEach(function (el) {
      el.dataset.jaEnriched = '1';
      var text = (el._jaRawText || el.innerText || '').slice(0, 800);
      if (text.length < 20) return;
      var cached = enrichCacheGet(text);
      // summary/usefulnessどちらも欠けたキャッシュは過去の不正な応答の可能性があるため
      // 無効として扱い、再取得の候補に回す（同じ壊れたデータが永久にキャッシュされ続けるのを防ぐ）
      if (cached && (cached.summary || cached.usefulness)) { _renderEnrichBadge(el, cached); return; }
      if (cached) console.warn('[SteamJaTrans][enrich] 不正なキャッシュを破棄して再取得', cached);
      candidates.push({ el: el, text: text });
    });
    if (!candidates.length) return;
    var delay = 0;
    for (var i = 0; i < candidates.length; i += 12) {
      var batch = candidates.slice(i, i + 12);
      setTimeout(function (b) { return function () { _enrichReviewsBatch(b); }; }(batch), delay);
      delay += (_opts.bulkDelay || 1000);
    }
  }

  // AI APIを呼び出してJSONを返す汎用関数
  async function _callAiForJson(prompt, provider, apiKey, attempt, webSearch) {
    var text = null;
    var finishReason = null;

    if (provider === '1min') {
      var model = (_opts && _opts.oneMinModel) || 'qwen3-8b';
      var body1m = {
        type: 'UNIFY_CHAT_WITH_AI',
        model: model,
        promptObject: {
          prompt: prompt,
          settings: {
            historySettings: { isMixed: false, historyMessageLimit: 0 },
            webSearchSettings: { webSearch: !!webSearch }
          }
        }
      };
      var r1m = await _bgFetch('https://api.1min.ai/api/chat-with-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'API-KEY': apiKey },
        body: JSON.stringify(body1m)
      });
      var d1m = await r1m.json();
      if (!r1m.ok || d1m.errorCode) throw new Error(d1m.message || String(r1m.status));
      text = (d1m.aiRecord && d1m.aiRecord.aiRecordDetail && d1m.aiRecord.aiRecordDetail.resultObject && d1m.aiRecord.aiRecordDetail.resultObject[0]) || '';
    } else {
      // Gemini
      var isLiteModel = /lite/i.test(_getActiveModel());
      var gBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: isLiteModel ? 8192 : 16384, response_mime_type: 'application/json' }
      };
      var rg = await _bgFetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + _getActiveModel() + ':generateContent?key=' + apiKey,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gBody) }
      );
      if (!rg.ok) {
        var errBody = await rg.json().catch(function() { return {}; });
        var errMsg = (errBody.error && errBody.error.message) ? errBody.error.message : String(rg.status);
        if (attempt < 2 && _handleQuotaError(errMsg)) return null; // シグナル: クォータ再試行
        throw new Error(errMsg);
      }
      var dg = await rg.json();
      var candidate = dg.candidates && dg.candidates[0];
      if (!candidate) throw new Error('no candidate');
      finishReason = candidate.finishReason;
      var parts = candidate.content && candidate.content.parts;
      if (parts && parts.length) {
        for (var i = parts.length - 1; i >= 0; i--) {
          if (parts[i].text) { text = parts[i].text; break; }
        }
      }
    }

    if (!text) return '__RETRY__';
    var cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    var json = cleaned.match(/\{[\s\S]*\}/);
    if (!json) {
      // レビュー数が多くプロンプトが長いと、出力トークン上限に達して途中で切れることがある。
      // 生テキストの末尾を見れば「閉じ}が無いまま終わっている」等が判断できるため診断用に残す。
      console.warn('[SteamJaTrans] JSON抽出失敗。生テキスト末尾300字:', text.slice(-300));
      return '__RETRY__';
    }
    try { return JSON.parse(json[0]); }
    catch (e) {
      console.warn('[SteamJaTrans] JSON.parse失敗:', e.message, '抽出文字列末尾300字:', json[0].slice(-300));
      return '__RETRY__';
    }
  }

  // モデルが混乱すると、JSON構造は正しいままプロンプトの指示文やスキーマ例の値を
  // そのまま書き写して返すことがある(「30字以内」等の指示文そのものや、topics配列が
  // スキーマ例の「DLC/BGM/マルチ」のまま等)。JSONとして妥当なため通常のパース失敗検知では
  // 気づけない。低コストな一次チェック(指示文特有の言い回し)に加え、promptTemplateOnly
  // (レビュー本文を含まない指示文+スキーマ例)が渡された場合は出力中の文字列がそこからの
  // 逐語コピーになっていないかも照合する(レビュー本文からの正当な引用は誤検知しない)。
  // モデルは逐語コピーする際に「」【】等の装飾記号を落とすことがあるため、
  // 比較前に除去して正規化する（実際に観測: 「Steam DLC数」→Steam DLC数 のように括弧だけ欠落）。
  function _normalizeForLeakCheck(s) { return s.replace(/[「」『』【】()（）\s]/g, ''); }

  // 「30字以内」だけでなく「30字」のように修飾語だけ落として書き写すケースも実際に観測したため、
  // 「以内/以上/程度」を必須にせず数字+「字」の組だけで判定する（このフィールド群はAI自身の
  // 短評コメントであり、実際のレビュー本文や生成コメントに「NN字」という表現が自然に出ることはまず無い）。
  function _isLeakedString(s, normTmpl) {
    if (typeof s !== 'string' || !s) return false;
    if (/\d+字(以内|以上|程度)?/.test(s)) return true;
    if (normTmpl) {
      var ns = _normalizeForLeakCheck(s);
      if (ns.length >= 14 && normTmpl.indexOf(ns) >= 0) return true;
    }
    return false;
  }

  // recommendation.reason/summary/price_advice等、購入判断の核となるフィールドで書き写しが
  // 起きた場合は分析全体の信頼性が疑わしいため、既存のJSONパース失敗と同じリトライ経路で丸ごとやり直す。
  function _looksLikeTemplateLeak(analysis) {
    if (!analysis) return false;
    var coreFields = [
      analysis.recommendation && analysis.recommendation.reason,
      analysis.summary,
      analysis.price_advice
    ];
    return coreFields.some(function (f) { return _isLeakedString(f, null); });
  }

  // 上記以外の大半のフィールド(insight/detail/evidence/quote等の短評コメント)だけに書き写しが
  // 起きた場合、分析全体を再試行(=API呼び出しを何度も消費)する価値は無い。既存のレンダリング側は
  // これらのフィールドが無い(null)場合は該当行を省略するだけで安全に表示を続けられるため
  // (_sanitizeDlcRiskFlagsと同じ「部分除去」方針)、オブジェクト全体を再帰的に走査してその場で除去する。
  function _salvageTemplateLeaks(analysis, promptTemplateOnly) {
    if (!analysis) return;
    // 実際に観測: topics配列にスキーマ例(DLC:8, BGM:12, マルチ:5)がそのまま混入するケース。
    // 値が短く通常のテキスト一致では拾えないため、この組み合わせだけピンポイントで判定する。
    // 配列長を3に固定していると、AIがこの3件に加えて本物のトピックを追加で返した場合に
    // すり抜けてしまう(実例: No Man's Skyで5件中先頭3件がこの既定値だった)ため、
    // 配列全体を捨てるのではなく該当エントリだけを個別に除去する。
    var tp = analysis.topics;
    if (Array.isArray(tp)) {
      var LEAK_TOPIC_DEFAULTS = { 'DLC': 8, 'BGM': 12, 'マルチ': 5 };
      analysis.topics = tp.filter(function (t) {
        return !(t && LEAK_TOPIC_DEFAULTS[t.name] === t.count);
      });
    }
    var normTmpl = promptTemplateOnly ? _normalizeForLeakCheck(promptTemplateOnly) : null;
    (function walk(obj) {
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(function (k) {
        var v = obj[k];
        if (typeof v === 'string') {
          if (_isLeakedString(v, normTmpl)) obj[k] = null;
        } else {
          walk(v);
        }
      });
    })(analysis);
  }

  // AIがプロンプト指示を守らずDLC商法系の懸念を誤って出すことがあるため、
  // 実際のSteam DLC数(0個)と矛盾する場合はクライアント側で強制的に除去する最終防衛ライン。
  function _sanitizeDlcRiskFlags(analysis, extraMeta) {
    if (!analysis) return analysis;
    var basicData = extraMeta && extraMeta.basicData;
    var hasDlc = !!(basicData && Array.isArray(basicData.dlc) && basicData.dlc.length > 0);
    // DLC有無が「0個と確定」または「そもそも不明」のどちらの場合も、
    // 「DLC商法懸念」という断定的な警告文は誤情報のリスクが大きいため出さない。
    if (!hasDlc && Array.isArray(analysis.risk_flags)) {
      analysis.risk_flags = analysis.risk_flags.filter(function (f) { return !/DLC/i.test(f); });
    }
    // dlc_dependencyを「なし」に書き換えるのは、DLC数が実際に0個だと確定している場合のみ。
    // basicData自体が無い(不明)場合にまで「なし」と断定すると別の誤情報になるため何もしない。
    if (basicData && !hasDlc && analysis.dlc_dependency) {
      analysis.dlc_dependency.label = 'なし';
      analysis.dlc_dependency.score = 0;
    }
    // estimated_hoursはAIの自由記述頼みで非数値・非現実値が来ることがある。
    // コスパ順ソートの母数になるため範囲外はnull化しておく。
    if (analysis.estimated_hours != null) {
      var eh = Number(analysis.estimated_hours);
      analysis.estimated_hours = (isFinite(eh) && eh > 0 && eh <= 1000) ? eh : null;
    }
    return analysis;
  }

  async function analyzeWithGemini(texts, apiKey, priceInfo, gameTags, _attempt, reviewMeta, extraMeta) {
    _attempt = _attempt || 0;

    // 機能1: レビュー品質フィルター
    var originalCount = texts.length;
    texts = texts.filter(function(t) {
      if (!t || t.length < 10) return false;
      // 絵文字のみ判定（テキスト部分5文字未満）
      var textOnly = t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uD800-\uDFFF]/gu, '').trim();
      if (textOnly.length < 5) return false;
      // 同じ単語/フレーズが5回以上繰り返される
      var words = t.trim().split(/\s+/);
      if (words.length >= 5) {
        var freq = {};
        words.forEach(function(w) { var k = w.toLowerCase(); freq[k] = (freq[k] || 0) + 1; });
        if (Object.values(freq).some(function(c) { return c >= 5; })) return false;
      }
      return true;
    });
    if (texts.length < originalCount) {
      toast('📊 レビュー' + originalCount + '件→品質フィルター後' + texts.length + '件', '#8fcfa0');
    }

    var combined = texts.slice(0, 40).join('\n\n---\n\n').slice(0, 10000);
    var priceContext = priceInfo ? ('現在価格: ¥' + priceInfo.current.toLocaleString()
      + (priceInfo.discountPct ? '（' + priceInfo.discountPct + '%オフセール中）' : '')
      + (priceInfo.original ? '、定価: ¥' + priceInfo.original.toLocaleString() : '')
      + '　※この価格は本体ゲームのみの価格であり、DLCの価格は含まれない\n') : '';
    var tagContext = gameTags && gameTags.length ? 'Steamタグ: ' + gameTags.join(', ') + '\n' : '';
    var titleElAn = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
    var gameTitleAn = titleElAn ? titleElAn.textContent.trim() : '';
    var titleContext = gameTitleAn ? 'ゲームタイトル: ' + gameTitleAn + '\n' : '';

    // 機能6: プレイ時間グループ分け
    var playtimeCtx = '';
    if (reviewMeta && reviewMeta.playtimeGroups) {
      var pg = reviewMeta.playtimeGroups;
      playtimeCtx = 'プレイ時間グループ: 早期(<10h)=' + pg.early.count + '件(推薦' + pg.early.rec + '件) 中堅(10-100h)=' + pg.mid.count + '件(推薦' + pg.mid.rec + '件) ヘビー(>100h)=' + pg.heavy.count + '件(推薦' + pg.heavy.rec + '件)\n';
    }

    // 機能7: アップデート頻度
    var activityCtx = '';
    if (reviewMeta && reviewMeta.reviewSpanMonths != null) {
      activityCtx = 'レビュー期間: ' + reviewMeta.reviewSpanMonths + 'ヶ月, 総レビュー数: ' + (reviewMeta.totalReviews || texts.length) + '件\n';
    }

    // 機能8: ネガティブレビュー
    var negCtx = '';
    if (reviewMeta && reviewMeta.negativeTexts && reviewMeta.negativeTexts.length) {
      negCtx = '\n【ネガティブレビュー（批判的意見）】:\n' + reviewMeta.negativeTexts.slice(0, 10).join('\n---\n').slice(0, 2000) + '\n';
    }

    // 機能10: 日本語レビュー
    var jaCtx = '';
    if (reviewMeta && reviewMeta.jaTexts && reviewMeta.jaTexts.length >= 5) {
      jaCtx = '\n【日本語レビュー限定】:\n' + reviewMeta.jaTexts.slice(0, 10).join('\n---\n').slice(0, 2000) + '\n';
    }

    // 機能10(返金率)/11(バグスコア)/12(過疎)/13(爆撃)/14(DLC) コンテキスト
    var extraCtx = '';
    if (extraMeta) {
      if (extraMeta.refundNegPct != null) {
        extraCtx += '2時間未満で非推薦（返金候補）率: ' + extraMeta.refundNegPct + '%\n';
        if (extraMeta.refundNegTexts && extraMeta.refundNegTexts.length) {
          extraCtx += '【返金直前ネガ（品質問題の重要シグナル）】:\n' + extraMeta.refundNegTexts.join('\n---\n') + '\n';
        }
      } else if (extraMeta.refundRisk) extraCtx += '返金リスク: ' + extraMeta.refundRisk.pct + '%（2時間未満+非推薦）\n';
      if (extraMeta.playtimeCorr) {
        var pc = extraMeta.playtimeCorr;
        extraCtx += 'プレイ時間別推薦率（API直近' + (pc.total || '') + '件）:\n';
        if (pc.under2.tot >= 3)  extraCtx += '  ＜2時間: ' + pc.under2.pct + '% (' + pc.under2.tot + '件)\n';
        if (pc.h2to10.tot >= 3)  extraCtx += '  2-10時間: ' + pc.h2to10.pct + '% (' + pc.h2to10.tot + '件)\n';
        if (pc.h10to50.tot >= 3) extraCtx += '  10-50時間: ' + pc.h10to50.pct + '% (' + pc.h10to50.tot + '件)\n';
        if (pc.over50.tot >= 3)  extraCtx += '  50時間超: ' + pc.over50.pct + '% (' + pc.over50.tot + '件)\n';
      }
      if (extraMeta.bugScore) extraCtx += 'バグ/クラッシュ言及率: ' + extraMeta.bugScore.pct + '%\n';
      if (extraMeta.populationHealth) extraCtx += '過疎化言及率: ' + extraMeta.populationHealth.evidence_pct + '%（直近3ヶ月: ' + extraMeta.populationHealth.recent_pct + '%）\n';
      if (extraMeta.reviewBomb) extraCtx += 'レビュー爆撃疑い: 直近30日' + extraMeta.reviewBomb.count30 + '件・否定率' + extraMeta.reviewBomb.neg_pct + '%\n';
      if (extraMeta.dlcDependency) extraCtx += 'DLC関連言及率: ' + extraMeta.dlcDependency.score + '%\n';
      if (extraMeta.playstyle) {
        var ps = extraMeta.playstyle;
        extraCtx += 'プレイヤー設定: スタイル=' + (ps.casual ? 'カジュアル' : 'ハードコア') + ' 形態=' + (ps.mode || '不明') + ' 週間プレイ時間=' + (ps.weeklyHours || '不明') + '\n';
        if (ps.genres && ps.genres.length) extraCtx += '好きジャンル: ' + ps.genres.join(', ') + '\n';
      }
      if (extraMeta.basicData) {
        var bd = extraMeta.basicData;
        var rdStr = (bd.release_date && bd.release_date.date) ? bd.release_date.date : null;
        var isComingSoon = bd.release_date && bd.release_date.coming_soon;
        if (rdStr) extraCtx += 'リリース日: ' + rdStr + (isComingSoon ? ' (未リリース)' : '') + '\n';
        if (bd.is_free) extraCtx += '無料プレイ: yes\n';
        var isEA = bd.genres && bd.genres.some(function(g) { return g.id === '70' || g.description === 'Early Access'; });
        if (isEA) extraCtx += 'アーリーアクセス: yes（ea_graduationに卒業予測を必ず記載）\n';
        else extraCtx += 'アーリーアクセス: no（ea_graduation=null）\n';
        var dlcList = bd.dlc;
        if (dlcList && dlcList.length > 0) {
          extraCtx += 'Steam DLC数: ' + dlcList.length + '個（実際にDLCが存在する）\n';
        } else {
          extraCtx += 'Steam DLC数: 0（DLCなし）\n';
        }
      }
      if (extraMeta.newsItems && extraMeta.newsItems.length) {
        var ni = extraMeta.newsItems;
        extraCtx += '最近のアップデート/ニュース（新しい順）:\n';
        ni.forEach(function(item) {
          var d = item.date ? new Date(item.date * 1000).toISOString().slice(0,10) : '';
          extraCtx += '- [' + d + '] ' + (item.title || '') + '\n';
        });
      }
      if (extraMeta.trendMeta) {
        var tm = extraMeta.trendMeta;
        var tParts = [];
        if (tm.d30 !== null) tParts.push('直近30日=' + tm.d30 + '%');
        if (tm.d90 !== null) tParts.push('31-90日=' + tm.d90 + '%');
        if (tm.d365 !== null) tParts.push('91-365日=' + tm.d365 + '%');
        if (tm.dOld !== null) tParts.push('1年超=' + tm.dOld + '%');
        if (tParts.length) extraCtx += 'レビュー時期別推薦率: ' + tParts.join(', ') + '\n';
      }
      if (extraMeta.achieveData) {
        var ad = extraMeta.achieveData;
        extraCtx += '実績データ: 全' + ad.totalAchieve + '個、平均取得率' + ad.avgAchievePct + '%、最難関' + ad.minAchievePct + '%（' + ad.minAchieveName + '）\n';
      }
    }

    var schema = JSON.stringify({
      categories: [
        { name: 'ゲームプレイ', stars: 4, comment: '操作感・ゲームループの説明' },
        { name: 'ストーリー', stars: null, comment: null },
        { name: 'グラフィック', stars: 3, comment: '映像品質の説明' },
        { name: 'サウンド', stars: null, comment: null },
        { name: 'コスパ', stars: 4, comment: '価格対価値の説明' },
        { name: '安定性', stars: null, comment: null },
        { name: '総合', stars: 4, comment: '総評' }
      ],
      summary: '一言でゲームを表すキャッチコピー（30字以内）',
      pros: ['具体的な良い点1', '良い点2', '良い点3'],
      cons: ['具体的な悪い点1', '悪い点2'],
      trend: { positive_pct: 65, recent_sentiment: '最近のアップデートや評価傾向（30字以内）' },
      recommendation: {
        verdict: '買い',
        reason: '購入推奨理由（40字以内）。verdictは「今すぐ買い」「買い」「セール待ち」「人を選ぶ」「見送り」のいずれか'
      },
      audience: {
        for: ['おすすめできるプレイヤー像1', 'プレイヤー像2'],
        against: ['向いていないプレイヤー像1']
      },
      topics: [
        { name: 'DLC', sentiment: 'negative', count: 8, evidence: '本編未完成のままDLC販売という言及' },
        { name: 'BGM', sentiment: 'positive', count: 12, evidence: 'サウンドトラックが秀逸との言及' },
        { name: 'マルチ', sentiment: 'neutral', count: 5, evidence: null }
      ],
      playtime: '〜30時間でクリア可能。やり込み要素で100時間超も',
      estimated_hours: 30,
      risk_flags: ['DLC商法懸念', '過疎化懸念'],
      confidence: { level: 'high', reason: 'レビュー数が少ない場合のみ理由を記載。levelはhigh/medium/lowのいずれか' },
      representative_reviews: [
        { type: 'positive', quote: 'レビューから最も典型的なポジティブ発言を原文のまま50字以内で引用', quote_ja: '日本語訳（50字以内）' },
        { type: 'negative', quote: 'レビューから最も典型的なネガティブ発言を原文のまま50字以内で引用', quote_ja: '日本語訳（50字以内）' }
      ],
      similar_games: [
        { name: 'ゲーム名（英語）', reason: 'おすすめ理由（30字以内）' },
        { name: 'ゲーム名2', reason: 'おすすめ理由2' },
        { name: 'ゲーム名3', reason: 'おすすめ理由3' }
      ],
      price_advice: '価格とコンテンツ量を踏まえた購入判断コメント（40字以内）。verdictが「買い」なら「¥XXXは妥当」、「セール待ち」なら「XX%オフが狙い目」など',
      sale_prediction: { verdict: 'セール中|定価買いOK|セール待ち推奨のいずれか', advice: '購入タイミングアドバイス（30字以内）', candidates: [ { name: 'Steamウィンターセール', date: '2026年12月18日頃', discount_pct: 40, confidence: 'high' }, { name: 'Steamオータムセール', date: '2026年11月20日頃', discount_pct: 30, confidence: 'medium' } ] },
      playtime_analysis: { early: { count: 0, recommend_pct: 75 }, mid: { count: 0, recommend_pct: 80 }, heavy: { count: 0, recommend_pct: 85 }, insight: '早期/中堅/ヘビー別の傾向コメント（30字以内）' },
      update_activity: { score: 'active', review_span_months: 12, insight: '開発活発度コメント（30字以内）' },
      negative_summary: { main_complaints: ['主な不満点1', '主な不満点2', '主な不満点3'], deal_breaker: '致命的問題（なければnull）' },
      ja_vs_en_sentiment: { ja_score: 70, en_score: 75, difference: '日本語と英語レビューの感情差異コメント（30字以内）' },
      refund_risk: { pct: 8, label: '低', insight: '返金リスクに関するコメント（30字以内）' },
      bug_score: { pct: 12, severity: 'minor', detail: 'バグ・安定性に関するコメント（30字以内）' },
      population_health: { status: 'active', evidence_pct: 5, insight: 'プレイヤー数・過疎化に関するコメント（30字以内）' },
      review_bomb: { detected: false, period: null, trigger: null, insight: null },
      dlc_dependency: { score: 10, label: '任意', detail: 'DLC・課金に関するコメント（30字以内）' },
      playstyle_match: { score: 75, label: '良好', reason: 'プレイヤーとの相性理由（30字以内）' },
      temporal_analysis: { trend: 'improving', recent_positive_pct: 80, historical_positive_pct: 65, ea_transition: null, update_impact: '直近アップデートによる改善内容（30字）', insight: '時系列・更新履歴を踏まえた総合コメント（40字）' },
      review_clusters: [
        { theme: 'クラスター名', sentiment: 'positive', count: 5, summary: 'このグループの要約', quote: '代表的なレビューの原文の一部（なければnull）' }
      ],
      sound_analysis: { score: 70, label: '良好', ost_notable: false, detail: 'サウンドに関するコメント（30字）' },
      replay_value: { score: 60, label: '普通', loop_quality: 'ゲームループの単調さ評価（30字）' },
      story_vs_gameplay: { story_score: 7, gameplay_score: 8, balance: 'gameplay_heavy', insight: 'コメント30字以内' },
      toxicity_risk: { score: 2, label: '低', cheater_presence: false, toxic_community: false, insight: 'コメント30字以内' },
      ea_graduation: { estimated_date: '2027年後半', confidence: 'medium', evidence: '根拠（30字以内）', current_completion_pct: 60 },
      achievement_analysis: { total_count: 50, avg_unlock_pct: 35, completion_est_pct: 8, difficulty: 'hard', insight: 'コメント30字以内' }
    });
    var promptInstructions = 'あなたはゲームレビューアナリストです。以下のユーザーレビューを分析し、'
      + '日本語で詳細な評価をまとめてください。\n'
      + '・topicsはレビュー中で繰り返し言及されるキーワードを抽出。実際に複数レビューで言及されているトピックが存在する限り、最低5個・最大8個は積極的に拾うこと（DLC/BGM/マルチだけでなく、グラフィック・操作性・ロード時間・翻訳・チュートリアル・実績・Mod・ストーリー等も対象）。無理に埋めるのではなく実在する言及の中から幅広く拾う。evidenceにはそのトピックについて実際に何と言われているかを20字以内で（該当レビューが少なく要約しづらい場合はnull）\n'
      + '・risk_flagsは実際に裏付け(提供データまたはレビュー本文の具体的な言及)がある懸念のみを記載すること。裏付けの無い推測での記載は絶対禁止。該当がなければ必ず空配列とし、無理に埋めないこと。カテゴリと条件は以下の通り（該当条件を満たすもののみ、複数可）:\n'
      + '  - 「DLC商法懸念」: 【必須】「Steam DLC数」が1個以上、かつレビューでDLCの売り方(本体が未完成・DLC必須・過度な細分化販売等)への具体的な不満がある場合のみ。Steam DLC数が0の場合は理由を問わず絶対に記載しないこと\n'
      + '  - 「マイクロトランザクション懸念」: ガチャ・課金アイテム・pay-to-win等、DLC以外の課金要素への具体的な不満がある場合のみ（DLCの話はここに含めずDLC商法懸念側に分類）\n'
      + '  - 「過疎化懸念」: マルチプレイ要素のあるゲームで、プレイヤー数減少・マッチング困難への具体的な言及がある場合のみ\n'
      + '  - 「未完成懸念」: バグ・クラッシュ・未実装機能への具体的な言及が複数件ある場合のみ\n'
      + '  - 「チート横行懸念」: チーター・不正行為への具体的な言及がある場合のみ\n'
      + '  - 「翻訳/日本語対応懸念」: 機械翻訳の粗さ・日本語未対応への具体的な不満がある場合のみ\n'
      + '  - 「サーバー依存懸念」: 常時オンライン必須・サーバー停止でプレイ不可になるリスクへの言及がある場合のみ\n'
      + '  - 「グラインド/水増し懸念」: 単調な繰り返し作業・意図的な時間稼ぎ的コンテンツ設計への具体的な不満がある場合のみ\n'
      + '  - 「開発放置懸念」: 発売後のアップデート停止・サポート終了・開発者の音信不通への具体的な言及がある場合のみ（未完成のまま停止した場合は未完成懸念と併記可）\n'
      + '  - 「最適化懸念」: 動作の重さ・要求スペックの割に低品質・低スペック機での不満など、パフォーマンスへの具体的な不満がある場合のみ（クラッシュ・バグそのものはbug_score側で扱う）\n'
      + '  - 「コミュニティ民度懸念」: 荒らし・迷惑行為・暴言・toxicなコミュニティ環境への具体的な言及がある場合のみ\n'
      + '  - 「改悪/値上げ懸念」: アップデートによる機能削除・仕様変更・価格変更など、既存ユーザーへの裏切り的変更への具体的な不満がある場合のみ\n'
      + '  - 上記に当てはまらない明確な懸念があれば20字以内の具体的なラベルを自由記載してよいが、必ず本文中の具体的根拠を伴うこと\n'
      + '・estimated_hoursはplaytimeで述べた目安時間を表す数値のみ（単位:時間、幅がある場合は代表値1つ）。playtimeの文章と矛盾しないこと\n'
      + '・confidence.levelはレビュー数が5件未満ならlow、10件未満ならmedium、それ以上ならhigh\n'
      + '・representative_reviewsのquoteは原文をそのまま引用、quote_jaにはそのquoteの自然な日本語訳を記載\n'
      + '・similar_gamesはSteamタグとレビューで語られるコアメカニクス・ゲームループ・雰囲気が一致するゲームを3本選ぶこと。ジャンルが同じだけで実際のプレイ感が異なるゲームは除外。reasonには「なぜ似ているか」を具体的に（例: 同じ経営×戦闘ループ、同じ孤独感・緊張感）\n'
      + '・price_adviceは価格とコンテンツ量・品質を踏まえたコメントを必ず記載。verdictが「買い/今すぐ買い」なら「¥XXXは妥当/安い」、「セール待ち」なら「XX〜XX%オフが狙い目」など具体的に。【重要】現在価格は本体ゲームのみでDLCを含まないため、「DLCを含む価格」等DLCが価格に含まれるかのような誤った記載は絶対にしないこと。DLCへの言及はdlc_dependencyフィールドで行い、price_adviceでは本体価格のみを評価すること\n'
      + '・sale_predictionは必ず記載。candidatesは【必須・絶対省略禁止】本日を起点に近い順で2〜3件列挙。Steamセール過去実績: ウィンター=毎年12月19日前後（〜1月上旬）、オータム=毎年11月20日前後（〜12月初旬）、サマー=毎年6月26日前後（〜7月上旬）、スプリング=毎年3月13日前後（〜3月下旬）、NextFest=2月/6月/10月中旬（週間）。discount_pctは当該ゲームの過去最大割引率・セール頻度を踏まえて予測（初セールは低め、常連は高め）。confidenceはhigh=Steamメジャーセール確実/medium=推定/low=不確か。verdictは「セール中」「定価買いOK」「セール待ち推奨」のいずれか\n'
      + '・playtime_analysisは提供されたプレイ時間グループ統計を使ってearly/mid/heavyの推薦率を計算し、insightは30字以内のコメント\n'
      + '・update_activityのscoreはリリース日・最近のアップデート/ニュース履歴・レビュー期間を総合判断して「active」「normal」「inactive」のいずれかで判断。早期アクセスから正式リリースした場合はその事実を優先し、EA期間中の「アップデート遅い」批判を過去のものとして評価すること。insightは開発活発度について30字以内\n'
      + '・temporal_analysisのtrendはレビュー時期別推薦率（提供された場合）から「improving/stable/declining」で判定。ea_transitionは早期アクセス→正式リリース移行があれば「EA→正式リリース済み」など（なければnull）。update_impactは最近のニュースで報告されたアップデートと古いレビューの不満が解消されているかを評価（30字）。insightは時系列変化の総合コメント（40字）\n'
      + '・negative_summaryはネガティブレビューから主な不満3点を抽出。deal_breakerは致命的問題があれば記載（なければnull）\n'
      + '・ja_vs_en_sentimentは日本語レビューが5件以上の場合のみ記載。ja_score/en_scoreは0-100の感情スコア。differenceは30字以内\n'
      + '・refund_risk.labelは「高/中/低」。insight30字以内\n'
      + '・bug_score.severityは「critical/moderate/minor/clean」。detail30字以内\n'
      + '・population_health.statusは「thriving/active/declining/dead」。insight30字以内\n'
      + '・review_bomb.detectedはレビュー爆撃が疑われる場合true。triggerは原因推測（30字）、insightはコメント（30字）\n'
      + '・dlc_dependency.labelは「必須/推奨/任意/なし」。【重要】「Steam DLC数」が0の場合は必ずlabel=「なし」・score=0にすること（DLCが存在しないゲームに依存度を付けてはならない）。1個以上なら必ずlabel≠「なし」にし、DLC数が多いほど依存度が高い傾向とする。detail30字以内\n'
      + '・playstyle_matchはプレイヤー設定が提供された場合のみ記載。scoreは0-100、labelは「最適/良好/普通/不向き」、reason30字以内\n'
      + '・review_clustersはレビューを主要テーマ別にグループ化。実際に複数レビューが同じ話題を共有している場合、最低2〜3クラスター・最大5クラスターまで積極的に分けること（1クラスターにまとめすぎない）。theme（20字以内）・sentiment（positive/negative/mixed）・count（件数）・summary（30字以内）・quote（そのクラスターを象徴する原文の一部30字以内、適切な引用が無ければnull）を記載\n'
      + '・sound_analysisはレビューでのBGM・SE・サウンドトラック・音楽・音声への言及を専門分析。scoreは0-100、labelは「秀逸/良好/普通/不評/言及なし」のいずれか。ost_notableはOSTが特に話題になっている場合true。detail30字以内\n'
      + '・replay_valueはゲームループの多様性・繰り返し遊べるか・コンテンツ量をレビューから評価。scoreは高いほど飽きにくい（0-100）。labelは「無限/高い/普通/低い/一周で十分」のいずれか。loop_qualityはゲームループの単調さ評価（30字以内）\n'
      + '・story_vs_gameplayはストーリー重視度（story_score）とゲームプレイ重視度（gameplay_score）をそれぞれ0-10で評価。balanceは「story_heavy」「balanced」「gameplay_heavy」のいずれか。insightは30字以内\n'
      + '・toxicity_riskはレビュー内の「チート」「荒らし」「垢BAN」「toxic」「cheater」「griefing」などのキーワード頻度と文脈からscoreを0-10で判定。labelは「低/中/高」（score0-3=低、4-6=中、7-10=高）。オフラインゲームや協力プレイ専用はscore:0。cheater_presenceはチーターの存在言及があればtrue、toxic_communityは毒コミュニティ言及があればtrue。insight30字以内\n'
      + '・ea_graduationは早期アクセスゲームの場合のみ記載（非EAはnull）。開発期間・ニュースのロードマップ言及・過去の更新頻度から正式リリース時期を推定。estimated_dateは「20XX年XX半」形式、confidenceは「high/medium/low」、evidenceは根拠30字以内、current_completion_pctは体感的な完成度0-100\n'
      + '・achievement_analysisは実績データが提供された場合に記載。total_countは実績総数、avg_unlock_pctは平均取得率、completion_est_pctはゲームクリアに必要な実績を達成しているプレイヤーの推定割合、difficultyは「easy/normal/hard/extreme」。insight30字以内\n\n';
    // レビュー本文を含まない指示文+スキーマ例だけの断片。モデルがここから逐語コピーした値を
    // 出力していないか(_looksLikeTemplateLeak)を照合するための基準テキストとして使う。
    var promptTemplateOnly = promptInstructions + schema;
    var prompt = promptInstructions
      + '本日の日付: ' + new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) + '\n'
      + titleContext
      + tagContext
      + priceContext
      + playtimeCtx
      + activityCtx
      + (_saleContextForAnalysis || '')
      + extraCtx
      + 'レビュー:\n' + combined
      + negCtx
      + jaCtx
      + '\n\n以下のJSON形式のみで回答してください（コードブロック不要、説明文不要）:\n' + schema;
    // プロバイダー判定: 設定が1minなら1min.ai優先、それ以外はGemini
    var provider = (_opts && _opts.aiProvider === '1min' && _1minKeyCache) ? '1min' : 'gemini';
    var activeKey = provider === '1min' ? _1minKeyCache : apiKey;

    // 1min.aiへフォールバックするヘルパー
    var _fallbackTo1Min = async function(reason) {
      if (!_1minKeyCache || provider === '1min') return null;
      toast('⚠ Gemini ' + reason + ' → 1min.aiにフォールバック', '#f6c744');
      try {
        var fb = await _callAiForJson(prompt, '1min', _1minKeyCache, 0, true);
        if (fb && fb !== '__RETRY__') {
          if (_looksLikeTemplateLeak(fb)) {
            console.warn('[SteamJaTrans] フォールバック先(1min.ai)も必須項目が書き写し、諦めます', fb);
            return null;
          }
          _salvageTemplateLeaks(fb, promptTemplateOnly);
          _lastAnalysisModel = _opts.oneMinModel || 'qwen3-8b';
          return _sanitizeDlcRiskFlags(fb, extraMeta);
        }
      } catch(e2) { /* 1min.aiも失敗 */ }
      return null;
    };

    var result;
    try {
      result = await _callAiForJson(prompt, provider, activeKey, _attempt, true);
    } catch (e) {
      // Geminiがエラーをthrow → 1min.aiにフォールバック
      var fb1 = await _fallbackTo1Min('エラー');
      if (fb1) return fb1;
      throw e;
    }

    if (result && result !== '__RETRY__') {
      // 購入推奨理由・要約等の必須フィールドで書き写しが起きている場合は分析全体が信頼できない
      // サインのため、既存のJSONパース失敗と同じリトライ/フォールバック経路に乗せる。
      // salvage側で先にnull化してしまうと判定が素通りしてしまうため、必ずsalvageより先に判定する。
      if (_looksLikeTemplateLeak(result)) {
        console.warn('[SteamJaTrans] AI出力の必須項目にプロンプト指示文の書き写しを検出、破棄してリトライします', result);
        result = '__RETRY__';
      } else {
        // それ以外のinsight/detail等の付随フィールドだけの書き写しは、その部分だけ除去すれば
        // 残りの分析は活かせるため、再試行せずその場で直す。
        _salvageTemplateLeaks(result, promptTemplateOnly);
      }
    }

    // null = Geminiクォータエラー（liteモデルに切り替え済み）
    if (result === null) {
      if (_attempt < 2) {
        return analyzeWithGemini(texts, apiKey, priceInfo, gameTags, _attempt + 1, reviewMeta, extraMeta);
      }
      // liteモデルも全滅 → 1min.aiにフォールバック
      var fb2 = await _fallbackTo1Min('クォータ全滅');
      if (fb2) return fb2;
      throw new Error('クォータ超過: 全Geminiモデル失敗');
    }

    // __RETRY__ = JSONパース失敗
    if (result === '__RETRY__') {
      if (_attempt < 2) {
        toast('⚠ JSONパース失敗 リトライ中... (' + (_attempt + 1) + '/2)', '#f6c744');
        await new Promise(function(res){ setTimeout(res, 1500); });
        return analyzeWithGemini(texts, apiKey, priceInfo, gameTags, _attempt + 1, reviewMeta, extraMeta);
      }
      // リトライ全滅 → 1min.aiにフォールバック
      var fb3 = await _fallbackTo1Min('JSONパース失敗');
      if (fb3) return fb3;
      throw new Error('JSON parse failed（全プロバイダー失敗）');
    }

    _lastAnalysisModel = provider === '1min' ? (_opts.oneMinModel || 'qwen3-8b') : _getActiveModel();
    return _sanitizeDlcRiskFlags(result, extraMeta);
  }

  function renderStars(n) {
    if (n === null) return '—';
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
    return s;
  }

  // ── カテゴリ感情スコアのレーダーチャート（SVG） ──
  function _buildRadarChartSVG(cats) {
    var size = 220, cx = size / 2, cy = size / 2, R = 78;
    var n = cats.length;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.style.cssText = 'width:100%;max-width:260px;display:block;margin:0 auto;';

    function pointAt(i, frac) {
      var angle = -Math.PI / 2 + i * (2 * Math.PI / n);
      return { x: cx + Math.cos(angle) * R * frac, y: cy + Math.sin(angle) * R * frac };
    }

    [0.25, 0.5, 0.75, 1].forEach(function (frac) {
      var pts = [];
      for (var i = 0; i < n; i++) { var p = pointAt(i, frac); pts.push(p.x + ',' + p.y); }
      var poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', pts.join(' '));
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', '#2d5a3d');
      poly.setAttribute('stroke-width', '1');
      svg.appendChild(poly);
    });

    for (var i = 0; i < n; i++) {
      var edge = pointAt(i, 1);
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', cx); line.setAttribute('y1', cy);
      line.setAttribute('x2', edge.x); line.setAttribute('y2', edge.y);
      line.setAttribute('stroke', '#2d5a3d'); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      var labelPos = pointAt(i, 1.2);
      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', labelPos.x); label.setAttribute('y', labelPos.y);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '9');
      label.setAttribute('fill', '#8fcfa0');
      label.textContent = cats[i].name;
      svg.appendChild(label);
    }

    var dataPts = [];
    for (var j = 0; j < n; j++) {
      var frac2 = Math.max(0, Math.min(1, cats[j].stars / 5));
      var p2 = pointAt(j, frac2);
      dataPts.push(p2.x + ',' + p2.y);
    }
    var dataPoly = document.createElementNS(svgNS, 'polygon');
    dataPoly.setAttribute('points', dataPts.join(' '));
    dataPoly.setAttribute('fill', 'rgba(76,175,80,0.25)');
    dataPoly.setAttribute('stroke', '#4caf50');
    dataPoly.setAttribute('stroke-width', '2');
    svg.appendChild(dataPoly);

    for (var k = 0; k < n; k++) {
      var frac3 = Math.max(0, Math.min(1, cats[k].stars / 5));
      var p3 = pointAt(k, frac3);
      var dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', p3.x); dot.setAttribute('cy', p3.y); dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', '#4caf50');
      svg.appendChild(dot);
    }

    return svg;
  }

  // ── 機能18: バッジホバーtooltip ──
  function showBadgeTooltip(el, text) {
    var tip = document.createElement('div');
    tip.id = 'ja-badge-tooltip';
    tip.style.cssText = 'position:fixed;z-index:99999;background:#1b2838;border:1px solid #4c6b7a;'
      + 'color:#c6d4df;font-size:11px;padding:5px 9px;border-radius:4px;pointer-events:none;'
      + 'max-width:220px;line-height:1.4;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
    tip.textContent = text;
    document.body.appendChild(tip);
    var rect = el.getBoundingClientRect();
    var top = rect.bottom + 4;
    var left = rect.left;
    if (left + 220 > window.innerWidth) left = window.innerWidth - 224;
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }
  function hideBadgeTooltip() {
    var t = document.getElementById('ja-badge-tooltip');
    if (t) t.remove();
  }
  function addBadgeTooltip(el, text) {
    el.title = text;
    el.addEventListener('mouseenter', function() { showBadgeTooltip(el, text); });
    el.addEventListener('mouseleave', hideBadgeTooltip);
  }

  function renderPageAnalysis(anchor, analysis, extraData) {
    var steamScore  = (extraData && extraData.steamScore) || getSteamScore();
    var langDist    = (extraData && extraData.langDist) || {};
    var priceInfo   = (extraData && extraData.priceInfo) || getGamePrice();
    var cacheTime   = extraData && extraData.cacheTime;   // キャッシュ時刻（fromCacheのとき）
    var usedModel   = extraData && extraData.usedModel;   // 使用モデル名
    var existing = document.getElementById('ja-ai-page-result');
    if (existing) existing.remove();

    var reviewCount = document.querySelectorAll('.' + BTN_CLASS).length;
    var overall = analysis.categories && analysis.categories.find(function (c) { return c.name === '総合'; });

    // 購入判定の色設定
    var VERDICT_STYLE = {
      '今すぐ買い': { bg: '#1b3a1e', border: '#4caf50', color: '#4caf50', icon: '🟢' },
      '買い':       { bg: '#1b3a1e', border: '#66bb6a', color: '#66bb6a', icon: '✅' },
      'セール待ち': { bg: '#2a2a10', border: '#f6c744', color: '#f6c744', icon: '⏳' },
      '人を選ぶ':   { bg: '#2a1a00', border: '#ff9800', color: '#ff9800', icon: '⚠️' },
      '見送り':     { bg: '#2a1010', border: '#e74c3c', color: '#e74c3c', icon: '🚫' },
    };
    var verdict = analysis.recommendation && analysis.recommendation.verdict;
    var vs = VERDICT_STYLE[verdict] || VERDICT_STYLE['人を選ぶ'];

    var div = document.createElement('div');
    div.id = 'ja-ai-page-result';
    div.style.cssText = 'margin:10px 0;background:#0f1923;border:1px solid #2d5a3d;border-radius:6px;'
      + 'color:#c6d4df;font-family:sans-serif;overflow:hidden;';

    // ── ヘッダー ──
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;'
      + 'padding:10px 16px;background:#0d1a10;border-bottom:1px solid #2d5a3d;cursor:pointer;';

    var hdrLeft = document.createElement('div');
    hdrLeft.style.cssText = 'display:flex;align-items:center;gap:10px;';
    var hdrIcon = document.createElement('span');
    hdrIcon.style.cssText = 'font-size:16px;';
    hdrIcon.textContent = '🤖';
    var hdrText = document.createElement('div');
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#4caf50;font-size:13px;font-weight:bold;';
    hdrTitle.textContent = 'AI総合分析';
    var hdrSub = document.createElement('div');
    hdrSub.style.cssText = 'color:#5a8a65;font-size:11px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
    var subText = document.createElement('span');
    subText.textContent = reviewCount + '件のレビューをもとに分析';
    hdrSub.appendChild(subText);
    // 使用モデルバッジ
    if (usedModel) {
      var modelBadge = document.createElement('span');
      var isFallback = QUOTA_FALLBACK_MODELS.indexOf(usedModel) >= 0;
      modelBadge.style.cssText = 'padding:1px 6px;border-radius:8px;font-size:10px;'
        + (isFallback
          ? 'background:rgba(246,199,68,0.12);color:#f6c744;border:1px solid rgba(246,199,68,0.4);'
          : 'background:rgba(76,175,80,0.1);color:#5a8a65;border:1px solid rgba(76,175,80,0.3);');
      modelBadge.textContent = '⚡ ' + usedModel;
      hdrSub.appendChild(modelBadge);
    }
    // キャッシュ鮮度
    if (cacheTime) {
      var ageBadge = document.createElement('span');
      ageBadge.style.cssText = 'padding:1px 6px;border-radius:8px;font-size:10px;'
        + 'background:rgba(100,181,246,0.1);color:#74c0fc;border:1px solid rgba(100,181,246,0.3);cursor:default;';
      ageBadge.textContent = '📦 ' + getCacheAgeText(cacheTime) + 'のキャッシュ';
      ageBadge.title = '再分析するには🔄ボタンを押してください';
      hdrSub.appendChild(ageBadge);
    }
    hdrText.appendChild(hdrTitle); hdrText.appendChild(hdrSub);
    hdrLeft.appendChild(hdrIcon); hdrLeft.appendChild(hdrText);

    // 購入判定バッジ（ヘッダー内）
    if (verdict) {
      var verdictBadge = document.createElement('div');
      verdictBadge.style.cssText = 'padding:3px 12px;border-radius:12px;font-size:12px;font-weight:bold;'
        + 'border:1px solid ' + vs.border + ';color:' + vs.color + ';background:' + vs.bg + ';';
      verdictBadge.textContent = vs.icon + ' ' + verdict;
      hdrLeft.appendChild(verdictBadge);
    }

    var hdrRight = document.createElement('div');
    hdrRight.style.cssText = 'display:flex;align-items:center;gap:10px;';

    // 総合スコア
    if (overall && overall.stars !== null) {
      var overallEl = document.createElement('div');
      overallEl.style.cssText = 'text-align:right;';
      var overallStars = document.createElement('div');
      overallStars.style.cssText = 'color:#f6c744;font-size:18px;letter-spacing:2px;';
      overallStars.textContent = renderStars(overall.stars);
      var overallLabel = document.createElement('div');
      overallLabel.style.cssText = 'color:#5a8a65;font-size:10px;text-align:center;margin-top:2px;';
      overallLabel.textContent = '総合スコア';
      overallEl.appendChild(overallStars); overallEl.appendChild(overallLabel);
      hdrRight.appendChild(overallEl);
    }

    // Steamスコア（ヘッダー内）
    if (steamScore) {
      var ssEl = document.createElement('div');
      ssEl.style.cssText = 'display:flex;flex-direction:column;align-items:center;border:1px solid ' + steamScore.color + ';border-radius:4px;padding:2px 8px;';
      var ssLabel = document.createElement('div');
      ssLabel.style.cssText = 'font-size:9px;color:#5a8a65;';
      ssLabel.textContent = 'Steam公式';
      var ssVal = document.createElement('div');
      ssVal.style.cssText = 'font-size:11px;font-weight:bold;color:' + steamScore.color + ';';
      ssVal.textContent = steamScore.ja;
      ssEl.appendChild(ssLabel); ssEl.appendChild(ssVal);
      hdrRight.appendChild(ssEl);

      // 機能9: 最近のスコアバッジ（全体と異なる場合のみ）
      var recentScore = extraData && extraData.recentScore;
      if (recentScore && recentScore.en !== steamScore.en) {
        var rsEl = document.createElement('div');
        rsEl.style.cssText = 'display:flex;flex-direction:column;align-items:center;border:1px solid ' + recentScore.color + ';border-radius:4px;padding:2px 8px;';
        var rsLabel = document.createElement('div');
        rsLabel.style.cssText = 'font-size:9px;color:#5a8a65;';
        rsLabel.textContent = '最近';
        var rsVal = document.createElement('div');
        rsVal.style.cssText = 'font-size:11px;font-weight:bold;color:' + recentScore.color + ';';
        rsVal.textContent = recentScore.ja;
        rsEl.appendChild(rsLabel); rsEl.appendChild(rsVal);
        hdrRight.appendChild(rsEl);
      }
    }

    // Markdownコピーボタン
    var copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 MD';
    copyBtn.title = 'Markdown形式でコピー（Discord等向け）';
    copyBtn.style.cssText = 'padding:3px 10px;background:transparent;color:#5a8a65;border:1px solid #2d5a3d;border-radius:3px;cursor:pointer;font-size:11px;';
    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var gameName = (document.querySelector('.apphub_AppName,#appHubAppName') || { textContent: 'ゲーム' }).textContent.trim();
      var lines = ['## 🤖 AI総合分析 — ' + gameName, ''];
      var metaLine = '';
      if (verdict) metaLine += '**判定**: ' + vs.icon + ' ' + verdict;
      if (analysis.trend && analysis.trend.positive_pct != null) metaLine += (metaLine ? ' | ' : '') + '**ポジティブ率**: ' + analysis.trend.positive_pct + '%';
      if (steamScore) metaLine += (metaLine ? ' | ' : '') + '**Steam公式**: ' + steamScore.ja;
      if (metaLine) { lines.push(metaLine); lines.push(''); }
      if (analysis.recommendation && analysis.recommendation.reason) { lines.push('> ' + analysis.recommendation.reason); lines.push(''); }
      if (analysis.summary) { lines.push('*「' + analysis.summary + '」*'); lines.push(''); }
      var scoreCats = analysis.categories && analysis.categories.filter(function (c) { return c.stars !== null && c.name !== '総合'; });
      if (scoreCats && scoreCats.length) {
        lines.push('### カテゴリスコア');
        lines.push('| カテゴリ | 評価 | コメント |');
        lines.push('|---|:---:|---|');
        scoreCats.forEach(function (c) { lines.push('| ' + c.name + ' | ' + renderStars(c.stars) + ' | ' + (c.comment || '') + ' |'); });
        lines.push('');
      }
      if (analysis.pros && analysis.pros.length) { lines.push('### ✓ 良い点'); analysis.pros.forEach(function (p) { lines.push('- ' + p); }); lines.push(''); }
      if (analysis.cons && analysis.cons.length) { lines.push('### ✗ 悪い点'); analysis.cons.forEach(function (c) { lines.push('- ' + c); }); lines.push(''); }
      if (analysis.audience && analysis.audience.for && analysis.audience.for.length) { lines.push('### 👍 向いている人'); analysis.audience.for.forEach(function (a) { lines.push('- ' + a); }); lines.push(''); }
      if (analysis.audience && analysis.audience.against && analysis.audience.against.length) { lines.push('### 👎 向いていない人'); analysis.audience.against.forEach(function (a) { lines.push('- ' + a); }); lines.push(''); }
      if (analysis.risk_flags && analysis.risk_flags.length) { lines.push('### ⚠ リスク'); lines.push(analysis.risk_flags.map(function (f) { return '`' + f + '`'; }).join(' ')); lines.push(''); }
      if (analysis.playtime) { lines.push('⏱ ' + analysis.playtime); lines.push(''); }
      lines.push('*' + reviewCount + '件のレビューをAIが分析 — Steam Japanese Translator*');
      copyToClipboard(lines.join('\n'));
      copyBtn.textContent = '✓ コピー済';
      setTimeout(function () { copyBtn.textContent = '📋 MD'; }, 2000);
    });
    hdrRight.appendChild(copyBtn);

    // 再分析ボタン
    var reAnalyzeBtn = document.createElement('button');
    reAnalyzeBtn.id = 'ja-reanalyze-btn';
    reAnalyzeBtn.textContent = '🔄 再分析';
    reAnalyzeBtn.style.cssText = 'padding:3px 10px;background:transparent;color:#5a8a65;border:1px solid #2d5a3d;border-radius:3px;cursor:pointer;font-size:11px;display:inline-block;';
    reAnalyzeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var aiBtn = document.getElementById('ja-ai-header-btn');
      if (aiBtn) { _forceReanalyze = true; div.remove(); aiBtn.textContent = '🤖 AI分析'; aiBtn.click(); }
    });
    hdrRight.appendChild(reAnalyzeBtn);

    // ブックマークボタン
    var bmAppId = getGameId();
    var bmName = document.querySelector('.apphub_AppName,.game_name_inner,h1.csms_h1,[class*="gameTitle"]');
    bmName = bmName ? bmName.textContent.trim() : (bmAppId || '');
    var bmBtn = document.createElement('button');
    bmBtn.title = '気になるリストに追加/削除';
    bmBtn.style.cssText = 'padding:3px 8px;background:transparent;border:1px solid #2d5a3d;border-radius:3px;cursor:pointer;font-size:13px;line-height:1;';
    function _updateBmBtn() {
      bmBtn.textContent = isBookmarked(bmAppId) ? '❤' : '🤍';
      bmBtn.style.color = isBookmarked(bmAppId) ? '#e74c3c' : '#5a8a65';
      bmBtn.style.borderColor = isBookmarked(bmAppId) ? '#e74c3c' : '#2d5a3d';
    }
    _updateBmBtn();
    bmBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleBookmark(bmAppId, bmName, analysis && analysis.recommendation && analysis.recommendation.verdict, extraData && extraData.priceInfo);
      _updateBmBtn();
      toast(isBookmarked(bmAppId) ? '❤ 気になるリストに追加' : '🤍 気になるリストから削除', isBookmarked(bmAppId) ? '#e74c3c' : '#5a8a65');
    });
    if (bmAppId) hdrRight.appendChild(bmBtn);

    // メモボタン
    var noteBtn = document.createElement('button');
    function _updateNoteBtn() {
      var hasNote = bmAppId && _gameNotes[bmAppId] && _gameNotes[bmAppId].text;
      noteBtn.textContent = hasNote ? '📝●' : '📝';
      noteBtn.title = hasNote ? _gameNotes[bmAppId].text.slice(0, 80) : 'メモを追加';
    }
    noteBtn.style.cssText = 'padding:3px 8px;background:transparent;border:1px solid #2d5a3d;border-radius:3px;cursor:pointer;font-size:13px;line-height:1;color:#8fcfa0;';
    _updateNoteBtn();
    noteBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _openNoteEditor(bmAppId, bmName, noteBtn, function () { _updateNoteBtn(); });
    });
    if (bmAppId) hdrRight.appendChild(noteBtn);

    var toggleEl = document.createElement('span');
    toggleEl.style.cssText = 'color:#4caf50;font-size:16px;';
    toggleEl.textContent = '▲';
    hdrRight.appendChild(toggleEl);
    hdr.appendChild(hdrLeft); hdr.appendChild(hdrRight);

    // ── ボディ ──
    var body = document.createElement('div');
    body.style.cssText = 'padding:14px 16px;';
    var collapsed = false;
    hdr.addEventListener('click', function () {
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : 'block';
      toggleEl.textContent = collapsed ? '▼' : '▲';
    });

    // ── 機能7: バグ/クラッシュ言及集計 ──
    var bugCount = extraData && extraData.bugCount;
    var totalForBug = extraData && extraData.totalReviewCount;
    if (bugCount != null && totalForBug > 0) {
      var bugPct = Math.round(bugCount / totalForBug * 100);
      var bugColor = bugPct > 20 ? '#e74c3c' : bugPct > 10 ? '#f6c744' : '#4caf50';
      if (bugPct > 0) {
        var bugWrap = document.createElement('div');
        bugWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
          + 'background:rgba(0,0,0,0.2);border:1px solid ' + bugColor + ';'
          + 'color:' + bugColor + ';font-size:11px;font-family:sans-serif;';
        bugWrap.textContent = '⚠ ' + bugCount + 'レビューがバグ・クラッシュに言及 (' + bugPct + '%)';
        body.appendChild(bugWrap);
      }
    }

    // ── 購入判定カード ──
    if (verdict && analysis.recommendation) {
      var vCard = document.createElement('div');
      vCard.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:12px;'
        + 'padding:12px 14px;background:' + vs.bg + ';border:1px solid ' + vs.border + ';border-radius:6px;';
      var vBig = document.createElement('div');
      vBig.style.cssText = 'font-size:28px;flex-shrink:0;';
      vBig.textContent = vs.icon;
      var vInfo = document.createElement('div');
      var vVerdict = document.createElement('div');
      vVerdict.style.cssText = 'color:' + vs.color + ';font-size:16px;font-weight:bold;margin-bottom:3px;';
      vVerdict.textContent = verdict;
      var vReason = document.createElement('div');
      vReason.style.cssText = 'color:#8f98a0;font-size:12px;line-height:1.4;';
      vReason.textContent = analysis.recommendation.reason || '';
      vInfo.appendChild(vVerdict); vInfo.appendChild(vReason);
      vCard.appendChild(vBig); vCard.appendChild(vInfo);

      // まとめキャッチコピー（右寄せ）
      if (analysis.summary) {
        var vSum = document.createElement('div');
        vSum.style.cssText = 'margin-left:auto;text-align:right;flex-shrink:0;max-width:40%;';
        var vSumText = document.createElement('div');
        vSumText.style.cssText = 'color:#c6d4df;font-size:12px;font-style:italic;line-height:1.4;';
        vSumText.textContent = '「' + analysis.summary + '」';
        vSum.appendChild(vSumText);
        vCard.appendChild(vSum);
      }
      body.appendChild(vCard);
    }

    // ── 価格 + セールアドバイス ──
    if (priceInfo) {
      var priceCard = document.createElement('div');
      priceCard.style.cssText = 'display:flex;align-items:center;gap:14px;margin-bottom:12px;'
        + 'padding:10px 14px;background:#162520;border:1px solid #1e3828;border-radius:4px;flex-wrap:wrap;';
      var priceIcon = document.createElement('span');
      priceIcon.style.cssText = 'font-size:18px;flex-shrink:0;';
      priceIcon.textContent = '💴';
      var priceLeft = document.createElement('div');
      var priceCur = document.createElement('div');
      priceCur.style.cssText = 'color:#c6d4df;font-size:15px;font-weight:bold;';
      priceCur.textContent = '¥' + priceInfo.current.toLocaleString();
      if (priceInfo.discountPct) {
        var pctBadge = document.createElement('span');
        pctBadge.style.cssText = 'display:inline-block;margin-left:8px;padding:1px 6px;background:#4caf50;color:#fff;border-radius:3px;font-size:11px;';
        pctBadge.textContent = '-' + priceInfo.discountPct + '%';
        priceCur.appendChild(pctBadge);
        if (priceInfo.original) {
          var priceOrig = document.createElement('span');
          priceOrig.style.cssText = 'color:#5a8a65;font-size:11px;text-decoration:line-through;margin-left:6px;';
          priceOrig.textContent = '¥' + priceInfo.original.toLocaleString();
          priceCur.appendChild(priceOrig);
        }
      }
      priceLeft.appendChild(priceCur);
      priceCard.appendChild(priceIcon);
      priceCard.appendChild(priceLeft);
      var priceAdvice = analysis.price_advice || analysis.sale_advice;
      if (priceAdvice) {
        var advEl = document.createElement('div');
        var isGood = verdict === '今すぐ買い' || verdict === '買い';
        advEl.style.cssText = 'color:' + (isGood ? '#8fcfa0' : '#f6c744') + ';font-size:11px;line-height:1.4;flex:1;min-width:120px;';
        advEl.textContent = '💡 ' + priceAdvice;
        priceCard.appendChild(advEl);
      }
      body.appendChild(priceCard);
    } else {
      var priceAdvice = analysis.price_advice || analysis.sale_advice;
      if (priceAdvice) {
        var advWrap = document.createElement('div');
        var isGood2 = verdict === '今すぐ買い' || verdict === '買い';
        advWrap.style.cssText = 'margin-bottom:12px;padding:8px 12px;background:' + (isGood2 ? '#0d1e0d' : '#1e1a00') + ';'
          + 'border:1px solid ' + (isGood2 ? '#4caf50' : '#f6c744') + ';border-radius:4px;'
          + 'color:' + (isGood2 ? '#8fcfa0' : '#f6c744') + ';font-size:11px;line-height:1.5;';
        advWrap.textContent = '💡 ' + priceAdvice;
        body.appendChild(advWrap);
      }
    }

    // ── 機能16: 価格詳細 + SteamDBリンク ──
    (function() {
      var appId16 = getGameId();
      if (!appId16) return;
      var p16Wrap = document.createElement('div');
      p16Wrap.style.cssText = 'margin-bottom:8px;padding:5px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.15);border:1px solid #1e3828;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
      if (priceInfo) {
        var p16Text = document.createElement('span');
        p16Text.style.cssText = 'color:#8f98a0;font-size:11px;';
        var priceStr = '現在: ¥' + priceInfo.current.toLocaleString();
        if (priceInfo.discountPct) priceStr += '（' + priceInfo.discountPct + '%オフ）';
        else if (priceInfo.original) priceStr += '（定価）';
        p16Text.textContent = priceStr;
        p16Wrap.appendChild(p16Text);
      }
      // Steam Deck互換バッジ
      var deckCat = _extraMeta && _extraMeta.deckCompat;
      if (deckCat) {
        var deckBadge = document.createElement('span');
        var deckInfo = deckCat === 3 ? { icon: '🎮', label: 'Deck Verified', color: '#4caf50', bg: 'rgba(76,175,80,0.12)', border: 'rgba(76,175,80,0.4)' }
          : deckCat === 2 ? { icon: '🎮', label: 'Deck Playable', color: '#f6c744', bg: 'rgba(246,199,68,0.1)', border: 'rgba(246,199,68,0.4)' }
          : { icon: '🎮', label: 'Deck Unsupported', color: '#e74c3c', bg: 'rgba(231,76,60,0.1)', border: 'rgba(231,76,60,0.4)' };
        deckBadge.style.cssText = 'padding:1px 7px;border-radius:8px;font-size:10px;border:1px solid '
          + deckInfo.border + ';background:' + deckInfo.bg + ';color:' + deckInfo.color + ';white-space:nowrap;';
        deckBadge.textContent = deckInfo.icon + ' ' + deckInfo.label;
        p16Wrap.appendChild(deckBadge);
      }
      var p16Link = document.createElement('a');
      p16Link.href = 'https://steamdb.info/app/' + appId16 + '/';
      p16Link.target = '_blank';
      p16Link.rel = 'noopener';
      p16Link.style.cssText = 'color:#66c0f4;font-size:10px;text-decoration:none;';
      p16Link.textContent = '📈 SteamDBで価格履歴を確認';
      p16Link.addEventListener('mouseenter', function() { p16Link.style.textDecoration = 'underline'; });
      p16Link.addEventListener('mouseleave', function() { p16Link.style.textDecoration = 'none'; });
      p16Wrap.appendChild(p16Link);
      body.appendChild(p16Wrap);
    })();

    // ── 機能11: セール予測カード ──
    if (analysis.sale_prediction && analysis.sale_prediction.verdict) {
      var sp = analysis.sale_prediction;
      var spCard = document.createElement('div');
      spCard.style.cssText = 'margin-bottom:10px;padding:8px 12px;border-radius:4px;'
        + 'background:rgba(246,199,68,0.06);border:1px solid rgba(246,199,68,0.4);'
        + 'color:#c6d4df;font-size:11px;display:flex;flex-direction:column;gap:5px;';
      // 1行目: verdict + advice
      var spTop = document.createElement('div');
      spTop.style.cssText = 'display:flex;align-items:center;gap:8px;';
      var spVerdict = document.createElement('span');
      spVerdict.style.cssText = 'font-weight:bold;color:#f6c744;';
      spVerdict.textContent = '🔖 ' + sp.verdict;
      spTop.appendChild(spVerdict);
      if (sp.advice) {
        var spAdvice = document.createElement('span');
        spAdvice.style.cssText = 'color:#8f98a0;font-size:10px;';
        spAdvice.textContent = sp.advice;
        spTop.appendChild(spAdvice);
      }
      spCard.appendChild(spTop);
      // 2行目以降: candidates
      var cands = Array.isArray(sp.candidates) ? sp.candidates : [];
      // 旧形式(next_sale_date)フォールバック
      if (!cands.length && sp.next_sale_date) {
        cands = [{ name: 'セール予想', date: sp.next_sale_date, confidence: sp.confidence }];
      }
      cands.forEach(function(c, i) {
        var confColor = { high: '#4caf50', medium: '#f6c744', low: '#8f98a0' }[c.confidence] || '#8f98a0';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;' + (i === 0 ? '' : 'opacity:0.75;');
        var icon = document.createElement('span');
        icon.textContent = i === 0 ? '📅' : '📆';
        var dateSpan = document.createElement('span');
        dateSpan.style.cssText = 'font-weight:' + (i === 0 ? 'bold' : 'normal') + ';color:' + (i === 0 ? confColor : '#c6d4df') + ';font-size:' + (i === 0 ? '12px' : '11px') + ';';
        dateSpan.textContent = c.date + (c.name ? '（' + c.name + '）' : '');
        var meta = document.createElement('span');
        meta.style.cssText = 'font-size:10px;color:#8f98a0;';
        var metaParts = [];
        if (c.discount_pct) metaParts.push('割引率予想 ' + c.discount_pct + '%');
        metaParts.push({ high: '確度高', medium: '確度中', low: '確度低' }[c.confidence] || '');
        meta.textContent = metaParts.filter(Boolean).join(' · ');
        row.appendChild(icon);
        row.appendChild(dateSpan);
        row.appendChild(meta);
        spCard.appendChild(row);
      });
      body.appendChild(spCard);
    }

    // ── ポジティブ率バー ──
    if (analysis.trend && analysis.trend.positive_pct != null) {
      var pct = Math.max(0, Math.min(100, analysis.trend.positive_pct));
      var barColor = pct >= 70 ? 'linear-gradient(90deg,#4caf50,#8bc34a)' : pct >= 40 ? 'linear-gradient(90deg,#ff9800,#f6c744)' : 'linear-gradient(90deg,#e74c3c,#ff5722)';
      var trendWrap = document.createElement('div');
      trendWrap.style.cssText = 'margin-bottom:12px;background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 14px;';
      var trendTop = document.createElement('div');
      trendTop.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
      var trendTitle = document.createElement('span');
      trendTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;';
      trendTitle.textContent = 'ポジティブ率';
      var trendPct = document.createElement('span');
      trendPct.style.cssText = 'color:#f6c744;font-size:15px;font-weight:bold;';
      trendPct.textContent = pct + '%';
      trendTop.appendChild(trendTitle); trendTop.appendChild(trendPct);
      var bWrap = document.createElement('div');
      bWrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
      var bPos = document.createElement('div');
      bPos.style.cssText = 'flex:1;height:10px;background:#1e3828;border-radius:5px;overflow:hidden;';
      var bPosInner = document.createElement('div');
      bPosInner.style.cssText = 'height:100%;background:' + barColor + ';width:' + pct + '%;border-radius:5px;';
      bPos.appendChild(bPosInner);
      var bNegLabel = document.createElement('span');
      bNegLabel.style.cssText = 'color:#8f98a0;font-size:10px;flex-shrink:0;';
      bNegLabel.textContent = (100 - pct) + '% ✗';
      bWrap.appendChild(bPos); bWrap.appendChild(bNegLabel);
      trendWrap.appendChild(trendTop); trendWrap.appendChild(bWrap);
      if (analysis.trend.recent_sentiment) {
        var trendNote = document.createElement('div');
        trendNote.style.cssText = 'color:#8f98a0;font-size:11px;';
        trendNote.textContent = '💬 ' + analysis.trend.recent_sentiment;
        trendWrap.appendChild(trendNote);
      }
      body.appendChild(trendWrap);
    }

    // ── レビュー言語分布 ──
    var langKeys = Object.keys(langDist);
    if (langKeys.length > 0) {
      var total = langKeys.reduce(function (s, k) { return s + langDist[k]; }, 0);
      var ldWrap = document.createElement('div');
      ldWrap.style.cssText = 'margin-bottom:12px;background:#162520;border:1px solid #1e3828;border-radius:4px;padding:8px 12px;';
      var ldTitle = document.createElement('div');
      ldTitle.style.cssText = 'color:#8fcfa0;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;';
      ldTitle.textContent = '🌐 レビュー言語構成';
      ldWrap.appendChild(ldTitle);
      var ldBar = document.createElement('div');
      ldBar.style.cssText = 'display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:6px;';
      var ldLabels = document.createElement('div');
      ldLabels.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      var langColors = { EN:'#5dade2',RU:'#e8734a',ZH:'#e74c3c',KO:'#3498db',JA:'#e91e63',DE:'#f39c12',FR:'#2980b9',AR:'#27ae60',TH:'#2980b9' };
      var sorted = langKeys.sort(function (a, b) { return langDist[b] - langDist[a]; });
      sorted.forEach(function (lang) {
        var pct = Math.round(langDist[lang] / total * 100);
        var color = langColors[lang] || '#8f98a0';
        var seg = document.createElement('div');
        seg.style.cssText = 'flex:' + pct + ';background:' + color + ';';
        ldBar.appendChild(seg);
        var info = LANG_INFO[lang];
        var lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:10px;color:' + color + ';';
        lbl.textContent = (info ? info.flag + ' ' : '') + lang + ' ' + pct + '%';
        ldLabels.appendChild(lbl);
      });
      ldWrap.appendChild(ldBar); ldWrap.appendChild(ldLabels);
      body.appendChild(ldWrap);
    }

    // ── カテゴリグリッド ──
    var cats = analysis.categories && analysis.categories.filter(function (c) { return c.stars !== null && c.name !== '総合'; });
    if (cats && cats.length) {
      var grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:12px;';
      cats.forEach(function (cat) {
        var card = document.createElement('div');
        card.style.cssText = 'background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 12px;';
        var cName = document.createElement('div');
        cName.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;';
        cName.textContent = cat.name;
        var cStars = document.createElement('div');
        cStars.style.cssText = 'color:#f6c744;font-size:15px;margin-bottom:5px;letter-spacing:1px;';
        cStars.textContent = renderStars(cat.stars);
        var bWrap = document.createElement('div');
        bWrap.style.cssText = 'height:4px;background:#1e3828;border-radius:2px;margin-bottom:7px;';
        var bFill = document.createElement('div');
        var starPct = cat.stars * 20;
        var bColor = starPct >= 70 ? '#4caf50' : starPct >= 50 ? '#8bc34a' : starPct >= 30 ? '#ff9800' : '#e74c3c';
        bFill.style.cssText = 'height:100%;border-radius:2px;background:' + bColor + ';width:' + starPct + '%;';
        bWrap.appendChild(bFill);
        var cComment = document.createElement('div');
        cComment.style.cssText = 'color:#8f98a0;font-size:11px;line-height:1.5;';
        cComment.textContent = cat.comment || '';
        card.style.cursor = 'pointer';
        card.title = cat.name + 'に関連するレビューをハイライト';
        (function (catName) {
          card.addEventListener('click', function () {
            var kws = CAT_KEYWORDS[catName] || [catName];
            var re = new RegExp(kws.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'i');
            var allCards = document.querySelectorAll('.apphub_CardTextContent,.userReviewCardContent,._1zbKizfCRpoX2D_zOLQes0');
            var matched = 0;
            allCards.forEach(function (el) {
              var txt = el.textContent;
              if (re.test(txt)) {
                el.style.outline = '2px solid #f6c744';
                el.style.outlineOffset = '2px';
                matched++;
              } else {
                el.style.outline = '';
              }
            });
            if (matched) {
              var first = Array.from(allCards).find(function (el) { return re.test(el.textContent); });
              if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
              toast('「' + catName + '」言及レビュー: ' + matched + '件', '#f6c744');
            } else {
              toast('「' + catName + '」に関連するレビューは未翻訳か見つかりません', '#8f98a0');
            }
          });
        })(cat.name);
        card.appendChild(cName); card.appendChild(cStars); card.appendChild(bWrap); card.appendChild(cComment);
        grid.appendChild(card);
      });
      body.appendChild(grid);

      if (cats.length >= 3) {
        var radarWrap = document.createElement('div');
        radarWrap.style.cssText = 'margin-bottom:12px;background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 12px;';
        var radarTitle = document.createElement('div');
        radarTitle.style.cssText = 'color:#8fcfa0;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;text-align:center;';
        radarTitle.textContent = '📊 カテゴリバランス';
        radarWrap.appendChild(radarTitle);
        radarWrap.appendChild(_buildRadarChartSVG(cats));
        body.appendChild(radarWrap);
      }
    }

    // ── 言及トピックタグ ──
    if (analysis.topics && analysis.topics.length) {
      var topicWrap = document.createElement('div');
      topicWrap.style.cssText = 'margin-bottom:12px;';
      var topicTitle = document.createElement('div');
      topicTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;';
      topicTitle.textContent = '📌 よく言及されるトピック';
      topicWrap.appendChild(topicTitle);
      var tagRow = document.createElement('div');
      tagRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      analysis.topics.forEach(function (t) {
        var tagColor = t.sentiment === 'positive' ? { bg: 'rgba(76,175,80,0.15)', border: '#4caf50', text: '#4caf50' }
          : t.sentiment === 'negative' ? { bg: 'rgba(231,76,60,0.15)', border: '#e74c3c', text: '#e74c3c' }
          : { bg: 'rgba(143,152,160,0.15)', border: '#4a5a6a', text: '#8f98a0' };
        var tag = document.createElement('span');
        tag.style.cssText = 'padding:3px 10px;border-radius:12px;font-size:12px;'
          + 'background:' + tagColor.bg + ';border:1px solid ' + tagColor.border + ';color:' + tagColor.text + ';';
        var icon = t.sentiment === 'positive' ? '↑' : t.sentiment === 'negative' ? '↓' : '·';
        tag.textContent = t.name + (t.count ? ' ' + icon + t.count : '');
        if (t.evidence) addBadgeTooltip(tag, t.evidence);
        tagRow.appendChild(tag);
      });
      topicWrap.appendChild(tagRow);
      body.appendChild(topicWrap);
    }

    // ── 良い点・悪い点 ──
    if ((analysis.pros && analysis.pros.length) || (analysis.cons && analysis.cons.length)) {
      var pcRow = document.createElement('div');
      pcRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;';
      var makeList = function (items, color, icon, label) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 12px;';
        var t = document.createElement('div');
        t.style.cssText = 'color:' + color + ';font-size:11px;font-weight:bold;margin-bottom:6px;';
        t.textContent = icon + ' ' + label;
        wrap.appendChild(t);
        items.forEach(function (item) {
          var li = document.createElement('div');
          li.style.cssText = 'color:#c6d4df;font-size:12px;line-height:1.5;margin-bottom:3px;display:flex;gap:5px;';
          var bullet = document.createElement('span');
          bullet.style.cssText = 'color:' + color + ';flex-shrink:0;';
          bullet.textContent = '•';
          var text = document.createElement('span');
          text.textContent = item;
          li.appendChild(bullet); li.appendChild(text);
          wrap.appendChild(li);
        });
        return wrap;
      };
      if (analysis.pros && analysis.pros.length) pcRow.appendChild(makeList(analysis.pros, '#4caf50', '✓', '良い点'));
      if (analysis.cons && analysis.cons.length) pcRow.appendChild(makeList(analysis.cons, '#e74c3c', '✗', '悪い点'));
      body.appendChild(pcRow);
    }

    // ── こんな人向け / 向けでない ──
    if (analysis.audience && (
      (analysis.audience.for && analysis.audience.for.length) ||
      (analysis.audience.against && analysis.audience.against.length)
    )) {
      var audRow = document.createElement('div');
      audRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;';
      var makeAudList = function (items, color, icon, label) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 12px;';
        var t = document.createElement('div');
        t.style.cssText = 'color:' + color + ';font-size:11px;font-weight:bold;margin-bottom:6px;';
        t.textContent = icon + ' ' + label;
        wrap.appendChild(t);
        (items || []).forEach(function (item) {
          var li = document.createElement('div');
          li.style.cssText = 'color:#c6d4df;font-size:12px;line-height:1.5;margin-bottom:3px;';
          li.textContent = '• ' + item;
          wrap.appendChild(li);
        });
        return wrap;
      };
      if (analysis.audience.for && analysis.audience.for.length)
        audRow.appendChild(makeAudList(analysis.audience.for, '#66c0f4', '👍', 'こんな人向け'));
      if (analysis.audience.against && analysis.audience.against.length)
        audRow.appendChild(makeAudList(analysis.audience.against, '#ff9800', '👎', '向いていない人'));
      body.appendChild(audRow);
    }

    // ── プレイ時間推定 ──
    if (analysis.playtime) {
      var ptWrap = document.createElement('div');
      ptWrap.style.cssText = 'margin-bottom:12px;background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 14px;display:flex;align-items:center;gap:10px;';
      var ptIcon = document.createElement('span');
      ptIcon.style.cssText = 'font-size:18px;flex-shrink:0;';
      ptIcon.textContent = '⏱';
      var ptInfo = document.createElement('div');
      var ptLabel = document.createElement('div');
      ptLabel.style.cssText = 'color:#8fcfa0;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;';
      ptLabel.textContent = 'プレイ時間の目安';
      var ptText = document.createElement('div');
      ptText.style.cssText = 'color:#c6d4df;font-size:12px;';
      ptText.textContent = analysis.playtime;
      ptInfo.appendChild(ptLabel); ptInfo.appendChild(ptText);
      ptWrap.appendChild(ptIcon); ptWrap.appendChild(ptInfo);
      body.appendChild(ptWrap);
    }

    // ── 信頼度インジケーター ──
    if (analysis.confidence && analysis.confidence.level !== 'high') {
      var confColor = analysis.confidence.level === 'low' ? '#e74c3c' : '#ff9800';
      var confWrap = document.createElement('div');
      confWrap.style.cssText = 'margin-bottom:12px;padding:8px 12px;border-radius:4px;'
        + 'background:rgba(255,152,0,0.08);border:1px solid ' + confColor + ';display:flex;align-items:center;gap:8px;';
      var confIcon = document.createElement('span');
      confIcon.style.cssText = 'font-size:14px;flex-shrink:0;';
      confIcon.textContent = analysis.confidence.level === 'low' ? '⚠️' : '📊';
      var confText = document.createElement('div');
      confText.style.cssText = 'color:' + confColor + ';font-size:11px;line-height:1.4;';
      confText.textContent = (analysis.confidence.level === 'low' ? '信頼度: 低 — ' : '信頼度: 中 — ')
        + (analysis.confidence.reason || 'レビュー数が少なく参考程度に留めてください');
      confWrap.appendChild(confIcon); confWrap.appendChild(confText);
      addBadgeTooltip(confWrap, 'AI分析の信頼度: レビュー数が少ない場合は低くなる');
      body.insertBefore(confWrap, body.firstChild);
    }

    // ── 公式カテゴリバッジ(VR/コントローラー/Workshop/クロスプレイ/アクセシビリティ/日本語音声) ──
    // AIの推測ではなく、Steam appdetailsのcategoriesフィールド(id固定・ローカライズ非依存)から
    // 機械的に判定する。descriptionの文字列は&l=言語指定なしだと英語/日本語が呼び出しによって
    // 揺れるため一切参照せず、idだけで判定する。
    var pageCats = (_extraMeta && _extraMeta.basicData && _extraMeta.basicData.categories) || [];
    if (pageCats.length) {
      var _catIds = pageCats.map(function (c) { return c.id; });
      var _hasCat = function (id) { return _catIds.indexOf(id) >= 0; };
      var ACCESS_LABELS = { 13: '字幕あり', 65: '字幕設定', 68: '音量調整', 78: '難易度調整', 79: '随時セーブ', 67: '画面酔い対策', 74: 'タイムアタック不要操作' };
      var catBadges = [];
      if (_hasCat(31) || _hasCat(54)) catBadges.push({ icon: '🥽', label: 'VR対応', tip: null });
      if (_hasCat(28)) catBadges.push({ icon: '🎮', label: 'フルコントローラー対応', tip: null });
      else if (_hasCat(18)) catBadges.push({ icon: '🎮', label: '部分的コントローラー対応', tip: null });
      if (_hasCat(30)) catBadges.push({ icon: '🛠', label: 'Steam Workshop対応', tip: null });
      if (_hasCat(27)) catBadges.push({ icon: '🔀', label: 'クロスプラットフォーム対応', tip: null });
      var accessHit = Object.keys(ACCESS_LABELS).map(Number).filter(_hasCat);
      if (accessHit.length) {
        catBadges.push({ icon: '♿', label: 'アクセシビリティ機能あり', tip: accessHit.map(function (id) { return ACCESS_LABELS[id]; }).join('・') });
      }
      // ── 日本語フル音声対応(supported_languagesのHTML文字列から機械的に判定) ──
      // 字幕のみ対応は大半のJP販売タイトルに該当し情報量が薄いため、フル音声のみバッジ化する
      // (コントローラー対応と同じく「無いことが情報」の設計)。
      var suppLang = _extraMeta && _extraMeta.basicData && _extraMeta.basicData.supported_languages;
      if (typeof suppLang === 'string' && /Japanese<strong>\*<\/strong>/.test(suppLang)) {
        catBadges.push({ icon: '🇯🇵', label: '日本語フル音声対応', tip: null });
      }
      if (catBadges.length) {
        var catWrap = document.createElement('div');
        catWrap.style.cssText = 'margin-bottom:12px;display:flex;flex-wrap:wrap;gap:6px;';
        catBadges.forEach(function (cb) {
          var tag = document.createElement('span');
          tag.style.cssText = 'padding:3px 10px;border-radius:12px;font-size:12px;'
            + 'background:rgba(102,192,244,0.1);border:1px solid #66c0f4;color:#66c0f4;';
          tag.textContent = cb.icon + ' ' + cb.label;
          if (cb.tip) addBadgeTooltip(tag, cb.tip);
          catWrap.appendChild(tag);
        });
        body.appendChild(catWrap);
      }
    }

    // ── リスクフラグ ──
    if (analysis.risk_flags && analysis.risk_flags.length) {
      var rfWrap = document.createElement('div');
      rfWrap.style.cssText = 'margin-bottom:12px;';
      var rfTitle = document.createElement('div');
      rfTitle.style.cssText = 'color:#e74c3c;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;';
      rfTitle.textContent = '⚠ リスクフラグ';
      rfWrap.appendChild(rfTitle);
      var rfRow = document.createElement('div');
      rfRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      analysis.risk_flags.forEach(function (flag) {
        var tag = document.createElement('span');
        tag.style.cssText = 'padding:3px 10px;border-radius:12px;font-size:12px;'
          + 'background:rgba(231,76,60,0.12);border:1px solid #e74c3c;color:#e74c3c;';
        tag.textContent = '⚠ ' + flag;
        rfRow.appendChild(tag);
      });
      rfWrap.appendChild(rfRow);
      body.appendChild(rfWrap);
    }

    // ── 代表レビュー引用 ──
    if (analysis.representative_reviews && analysis.representative_reviews.length) {
      var rrWrap = document.createElement('div');
      rrWrap.style.cssText = 'margin-bottom:12px;';
      var rrTitle = document.createElement('div');
      rrTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;';
      rrTitle.textContent = '💬 代表的なレビュー';
      rrWrap.appendChild(rrTitle);
      analysis.representative_reviews.forEach(function (rv) {
        if (!rv.quote) return;
        var isPos = rv.type === 'positive';
        var rvEl = document.createElement('div');
        rvEl.style.cssText = 'padding:8px 12px;margin-bottom:6px;border-radius:4px;'
          + 'background:' + (isPos ? 'rgba(76,175,80,0.08)' : 'rgba(231,76,60,0.08)') + ';'
          + 'border-left:3px solid ' + (isPos ? '#4caf50' : '#e74c3c') + ';';
        var rvIcon = document.createElement('span');
        rvIcon.style.cssText = 'color:' + (isPos ? '#4caf50' : '#e74c3c') + ';font-size:11px;font-weight:bold;margin-right:6px;flex-shrink:0;';
        rvIcon.textContent = isPos ? '👍' : '👎';
        var rvBody = document.createElement('div');
        rvBody.style.cssText = 'flex:1;';
        if (rv.quote_ja && rv.quote_ja !== rv.quote) {
          var rvJa = document.createElement('div');
          rvJa.style.cssText = 'color:#c6d4df;font-size:12px;line-height:1.5;margin-bottom:2px;';
          rvJa.textContent = rv.quote_ja;
          rvBody.appendChild(rvJa);
        }
        var rvText = document.createElement('div');
        rvText.style.cssText = 'color:#5a8a65;font-size:10px;line-height:1.4;font-style:italic;';
        rvText.textContent = '"' + rv.quote + '"';
        rvBody.appendChild(rvText);
        rvEl.style.display = 'flex'; rvEl.style.alignItems = 'flex-start'; rvEl.style.gap = '6px';
        rvEl.appendChild(rvIcon); rvEl.appendChild(rvBody);
        rrWrap.appendChild(rvEl);
      });
      body.appendChild(rrWrap);
    }

    // ── 類似ゲームおすすめ ──
    if (analysis.similar_games && analysis.similar_games.length) {
      var sgWrap = document.createElement('div');
      sgWrap.style.cssText = 'margin-bottom:12px;';
      var sgTitle = document.createElement('div');
      sgTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;';
      sgTitle.textContent = '🎮 このゲームが好きなら';
      sgWrap.appendChild(sgTitle);
      var sgGrid = document.createElement('div');
      sgGrid.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
      analysis.similar_games.forEach(function (sg) {
        if (!sg.name) return;
        var sgCard = document.createElement('a');
        sgCard.href = 'https://store.steampowered.com/search/?term=' + encodeURIComponent(sg.name);
        sgCard.target = '_blank';
        sgCard.style.cssText = 'display:flex;flex-direction:column;padding:8px 12px;flex:1;min-width:140px;max-width:220px;'
          + 'background:#162520;border:1px solid #1e3828;border-radius:4px;text-decoration:none;'
          + 'cursor:pointer;transition:border-color 0.15s;';
        sgCard.addEventListener('mouseenter', function () { sgCard.style.borderColor = '#4caf50'; });
        sgCard.addEventListener('mouseleave', function () { sgCard.style.borderColor = '#1e3828'; });
        var sgName = document.createElement('div');
        sgName.style.cssText = 'color:#66c0f4;font-size:12px;font-weight:bold;margin-bottom:3px;';
        sgName.textContent = sg.name;
        var sgReason = document.createElement('div');
        sgReason.style.cssText = 'color:#8f98a0;font-size:10px;line-height:1.4;';
        sgReason.textContent = sg.reason || '';
        // 機能12: 分析済みバッジ
        var sgNameLower = sg.name.toLowerCase();
        var isCached = Object.keys(_aiCache).some(function(k) {
          var entry = _aiCache[k];
          return entry && entry.analysis && entry.analysis.summary && sgNameLower.length > 2;
        }) && (function() {
          // ゲーム名でキャッシュを簡易照合
          for (var k in _aiCache) {
            var entry = _aiCache[k];
            if (!entry) continue;
            // appId照合は困難なので、summaryやsimilar_gamesのnameで照合
            if (entry.analysis && entry.analysis.similar_games) {
              var found = entry.analysis.similar_games.some(function(s) {
                return s.name && s.name.toLowerCase() === sgNameLower;
              });
              if (found) return true;
            }
          }
          return false;
        })();
        sgCard.appendChild(sgName); sgCard.appendChild(sgReason);
        if (isCached) {
          var cachedBadge = document.createElement('span');
          cachedBadge.style.cssText = 'font-size:9px;color:#66c0f4;border:1px solid #2a475e;border-radius:8px;padding:1px 5px;margin-top:3px;display:inline-block;';
          cachedBadge.textContent = '📊 分析済み';
          sgCard.appendChild(cachedBadge);
        }
        // 機能23: 所持ゲームバッジ
        (function(card, title) {
          getOwnedGames(function(owned) {
            if (!owned || !owned.length) return;
            var titleLower = title.toLowerCase();
            var isOwned = owned.some(function(g) {
              return g && g.toLowerCase().trim() === titleLower;
            });
            if (isOwned && !card.querySelector('.ja-owned-badge')) {
              var ownedBadge = document.createElement('span');
              ownedBadge.className = 'ja-owned-badge';
              ownedBadge.style.cssText = 'font-size:9px;color:#4caf50;border:1px solid #4caf50;border-radius:8px;padding:1px 5px;margin-top:3px;display:inline-block;';
              ownedBadge.textContent = '✓ 所持済み';
              card.appendChild(ownedBadge);
            }
          });
        })(sgCard, sg.name);
        sgGrid.appendChild(sgCard);
      });
      sgWrap.appendChild(sgGrid);
      body.appendChild(sgWrap);
    }

    // ── 機能12: ストーリーvsゲームプレイ分離スコア ──
    if (analysis.story_vs_gameplay) {
      var svg = analysis.story_vs_gameplay;
      var svgWrap = document.createElement('div');
      svgWrap.style.cssText = 'margin-bottom:12px;background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 14px;';
      var svgTitle = document.createElement('div');
      svgTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;';
      svgTitle.textContent = '⚖ ストーリー vs ゲームプレイ';
      svgWrap.appendChild(svgTitle);
      var svgBars = document.createElement('div');
      svgBars.style.cssText = 'display:flex;gap:10px;';
      [
        { label: '🎭 ストーリー', score: svg.story_score, color: '#9b59b6' },
        { label: '🎮 ゲームプレイ', score: svg.gameplay_score, color: '#3498db' }
      ].forEach(function(item) {
        var col = document.createElement('div');
        col.style.cssText = 'flex:1;';
        var lbl = document.createElement('div');
        lbl.style.cssText = 'color:#8f98a0;font-size:10px;margin-bottom:4px;';
        lbl.textContent = item.label + ' ' + (item.score || 0) + '/10';
        var barWrap = document.createElement('div');
        barWrap.style.cssText = 'height:8px;background:#1e3828;border-radius:4px;overflow:hidden;';
        var barFill = document.createElement('div');
        barFill.style.cssText = 'height:100%;width:' + Math.max(0, Math.min(100, (item.score || 0) * 10)) + '%;background:' + item.color + ';border-radius:4px;';
        barWrap.appendChild(barFill);
        col.appendChild(lbl); col.appendChild(barWrap);
        svgBars.appendChild(col);
      });
      svgWrap.appendChild(svgBars);
      if (svg.insight) {
        var svgNote = document.createElement('div');
        svgNote.style.cssText = 'color:#8f98a0;font-size:10px;margin-top:6px;';
        svgNote.textContent = '💡 ' + svg.insight;
        svgWrap.appendChild(svgNote);
      }
      body.appendChild(svgWrap);
    }

    // ── 機能15: チート・グリーフ問題スコア（score>=3のみ表示） ──
    if (analysis.toxicity_risk && analysis.toxicity_risk.score >= 3) {
      var tr = analysis.toxicity_risk;
      var trColor = tr.score >= 7 ? '#e74c3c' : '#f6c744';
      var trWrap = document.createElement('div');
      trWrap.style.cssText = 'margin-bottom:12px;padding:8px 12px;border-radius:4px;'
        + 'background:rgba(231,76,60,0.07);border:1px solid ' + trColor + ';display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
      var trBadge = document.createElement('span');
      trBadge.style.cssText = 'font-size:12px;font-weight:bold;color:' + trColor + ';flex-shrink:0;';
      trBadge.textContent = '⚠ 有害度: ' + (tr.label || '') + ' (' + tr.score + '/10)';
      trWrap.appendChild(trBadge);
      var trFlags = [];
      if (tr.cheater_presence) trFlags.push('🚫 チーター報告あり');
      if (tr.toxic_community) trFlags.push('💢 毒コミュニティ');
      if (trFlags.length) {
        var trFlagEl = document.createElement('span');
        trFlagEl.style.cssText = 'font-size:10px;color:#c6d4df;';
        trFlagEl.textContent = trFlags.join(' / ');
        trWrap.appendChild(trFlagEl);
      }
      if (tr.insight) {
        var trNote = document.createElement('div');
        trNote.style.cssText = 'width:100%;font-size:10px;color:#8f98a0;margin-top:3px;';
        trNote.textContent = tr.insight;
        trWrap.appendChild(trNote);
      }
      body.appendChild(trWrap);
    }

    // ── 機能6: プレイ時間帯別分析 ──
    var paCorr = _extraMeta && _extraMeta.playtimeCorr;
    if (analysis.playtime_analysis || paCorr) {
      var pa = analysis.playtime_analysis || {};
      var paWrap = document.createElement('div');
      paWrap.style.cssText = 'margin-bottom:12px;background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 14px;';
      var paTitle = document.createElement('div');
      paTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;';
      paTitle.textContent = '⏱ プレイ時間別 推薦率';
      paWrap.appendChild(paTitle);
      if (paCorr) {
        // API実データで表示（より正確）
        var apiGroups = [
          { key: 'under2',  label: '＜2時間',   color: '#66c0f4' },
          { key: 'h2to10',  label: '2-10時間',  color: '#8bc34a' },
          { key: 'h10to50', label: '10-50時間', color: '#f6c744' },
          { key: 'over50',  label: '50時間超',  color: '#ff9800' },
        ];
        var hasAnyApi = false;
        apiGroups.forEach(function(g) {
          var gd = paCorr[g.key];
          if (!gd || gd.tot < 3 || gd.pct === null) return;
          hasAnyApi = true;
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px;';
          var lbl = document.createElement('span');
          lbl.style.cssText = 'color:#8f98a0;font-size:10px;min-width:68px;';
          lbl.textContent = g.label;
          var barWrap = document.createElement('div');
          barWrap.style.cssText = 'flex:1;height:8px;background:#1e3828;border-radius:4px;overflow:hidden;';
          var barFill = document.createElement('div');
          var p = Math.max(0, Math.min(100, gd.pct));
          barFill.style.cssText = 'height:100%;width:' + p + '%;background:' + g.color + ';border-radius:4px;transition:width 0.4s;';
          barWrap.appendChild(barFill);
          var pctLbl = document.createElement('span');
          pctLbl.style.cssText = 'color:' + g.color + ';font-size:10px;min-width:50px;text-align:right;';
          pctLbl.textContent = p + '% (' + gd.tot + '件)';
          row.appendChild(lbl); row.appendChild(barWrap); row.appendChild(pctLbl);
          paWrap.appendChild(row);
        });
        if (!hasAnyApi && pa.insight) { /* fallback to AI insight */ }
        // 短時間vs長時間の乖離を検出して表示
        if (paCorr.under2.pct !== null && paCorr.over50.pct !== null) {
          var gap = paCorr.over50.pct - paCorr.under2.pct;
          if (Math.abs(gap) >= 20) {
            var gapNote = document.createElement('div');
            gapNote.style.cssText = 'font-size:10px;margin-top:4px;padding:3px 6px;border-radius:3px;'
              + (gap > 0
                ? 'color:#8bc34a;background:rgba(139,195,74,0.08);'
                : 'color:#f6c744;background:rgba(246,199,68,0.08);');
            gapNote.textContent = gap > 0
              ? '⬆ 長時間プレイヤーほど高評価（' + gap + 'pt差）—するほど化ける'
              : '⬇ 短時間の方が高評価（' + Math.abs(gap) + 'pt差）—長期プレイで粗が出やすい';
            paWrap.appendChild(gapNote);
          }
        }
      } else {
        // AI推定値でフォールバック
        var groups = [
          { key: 'early', label: '早期 <10h',   color: '#66c0f4' },
          { key: 'mid',   label: '中堅 10-100h', color: '#8bc34a' },
          { key: 'heavy', label: 'ヘビー >100h', color: '#f6c744' },
        ];
        groups.forEach(function(g) {
          var gd = pa[g.key];
          if (!gd || gd.count === 0) return;
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px;';
          var lbl = document.createElement('span');
          lbl.style.cssText = 'color:#8f98a0;font-size:10px;min-width:80px;';
          lbl.textContent = g.label;
          var barWrap = document.createElement('div');
          barWrap.style.cssText = 'flex:1;height:8px;background:#1e3828;border-radius:4px;overflow:hidden;';
          var barFill = document.createElement('div');
          var pct = Math.max(0, Math.min(100, gd.recommend_pct || 0));
          barFill.style.cssText = 'height:100%;width:' + pct + '%;background:' + g.color + ';border-radius:4px;';
          barWrap.appendChild(barFill);
          var pctLbl = document.createElement('span');
          pctLbl.style.cssText = 'color:' + g.color + ';font-size:10px;min-width:34px;text-align:right;';
          pctLbl.textContent = pct + '% (' + gd.count + ')';
          row.appendChild(lbl); row.appendChild(barWrap); row.appendChild(pctLbl);
          paWrap.appendChild(row);
        });
      }
      if (pa.insight) {
        var paNote = document.createElement('div');
        paNote.style.cssText = 'color:#8f98a0;font-size:10px;margin-top:5px;';
        paNote.textContent = '💡 ' + pa.insight;
        paWrap.appendChild(paNote);
      }
      body.appendChild(paWrap);
    }

    // ── 機能14: ゲームクリア率推定 ──
    if (analysis.achievement_analysis && analysis.achievement_analysis.total_count > 0) {
      var aa = analysis.achievement_analysis;
      var aaCompPct = aa.completion_est_pct || 0;
      var aaLabel, aaColor;
      if (aaCompPct < 10) {
        aaLabel = '激難'; aaColor = '#e74c3c';
      } else if (aaCompPct < 30) {
        aaLabel = 'ハード'; aaColor = '#f6c744';
      } else if (aaCompPct < 50) {
        aaLabel = '普通'; aaColor = '#8fcfa0';
      } else {
        aaLabel = 'カジュアル'; aaColor = '#4caf50';
      }
      var aaWrap = document.createElement('div');
      aaWrap.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
      var aaBadge = document.createElement('span');
      aaBadge.style.cssText = 'font-size:11px;color:' + aaColor + ';border:1px solid ' + aaColor + ';border-radius:10px;padding:2px 8px;';
      aaBadge.textContent = '🏆 クリア率〜' + aaCompPct + '%（' + aaLabel + '）';
      aaWrap.appendChild(aaBadge);
      if (aa.total_count) {
        var aaMeta = document.createElement('span');
        aaMeta.style.cssText = 'font-size:10px;color:#8f98a0;';
        aaMeta.textContent = '実績' + aa.total_count + '個 / 平均取得' + (aa.avg_unlock_pct || 0) + '%';
        aaWrap.appendChild(aaMeta);
      }
      if (aa.insight) {
        var aaNote = document.createElement('div');
        aaNote.style.cssText = 'width:100%;font-size:10px;color:#8f98a0;';
        aaNote.textContent = aa.insight;
        aaWrap.appendChild(aaNote);
      }
      body.appendChild(aaWrap);
    }

    // ── 機能7: アップデート頻度評価 ──
    if (analysis.update_activity) {
      var ua = analysis.update_activity;
      var uaColors = { active: '#4caf50', normal: '#f6c744', inactive: '#e74c3c' };
      var uaColor = uaColors[ua.score] || '#8f98a0';
      var uaWrap = document.createElement('div');
      uaWrap.style.cssText = 'margin-bottom:12px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid ' + uaColor + ';display:flex;align-items:center;gap:8px;';
      var uaBadge = document.createElement('span');
      uaBadge.style.cssText = 'font-size:11px;font-weight:bold;color:' + uaColor + ';flex-shrink:0;';
      var uaLabel = { active: '🔄 活発', normal: '🔄 普通', inactive: '🔄 低調' };
      uaBadge.textContent = uaLabel[ua.score] || '🔄';
      var uaText = document.createElement('span');
      uaText.style.cssText = 'color:#8f98a0;font-size:11px;';
      uaText.textContent = (ua.review_span_months ? ua.review_span_months + 'ヶ月間のレビュー。' : '') + (ua.insight || '');
      uaWrap.appendChild(uaBadge); uaWrap.appendChild(uaText);
      body.appendChild(uaWrap);
    }

    // ── 機能29: アーリーアクセス卒業予測 ──
    if (analysis.ea_graduation && analysis.ea_graduation !== null) {
      var eag = analysis.ea_graduation;
      var eagWrap = document.createElement('div');
      eagWrap.style.cssText = 'margin-bottom:12px;padding:10px 14px;border-radius:4px;'
        + 'background:rgba(102,192,244,0.07);border:1px solid rgba(102,192,244,0.5);';
      var eagTitle = document.createElement('div');
      eagTitle.style.cssText = 'color:#66c0f4;font-size:11px;font-weight:bold;margin-bottom:6px;';
      eagTitle.textContent = '🚀 アーリーアクセス卒業予測';
      eagWrap.appendChild(eagTitle);
      var eagRow = document.createElement('div');
      eagRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:5px;';
      if (eag.estimated_date) {
        var eagDate = document.createElement('span');
        eagDate.style.cssText = 'font-size:13px;font-weight:bold;color:#c6d4df;';
        eagDate.textContent = eag.estimated_date;
        eagRow.appendChild(eagDate);
      }
      if (eag.confidence) {
        var confColors = { high: '#4caf50', medium: '#f6c744', low: '#8f98a0' };
        var confLabels = { high: '確度高', medium: '確度中', low: '確度低' };
        var eagConf = document.createElement('span');
        eagConf.style.cssText = 'font-size:10px;color:' + (confColors[eag.confidence] || '#8f98a0') + ';border:1px solid ' + (confColors[eag.confidence] || '#8f98a0') + ';border-radius:3px;padding:1px 5px;';
        eagConf.textContent = confLabels[eag.confidence] || eag.confidence;
        eagRow.appendChild(eagConf);
      }
      eagWrap.appendChild(eagRow);
      if (eag.current_completion_pct != null) {
        var eagBarWrap = document.createElement('div');
        eagBarWrap.style.cssText = 'margin-bottom:5px;';
        var eagBarLabel = document.createElement('div');
        eagBarLabel.style.cssText = 'color:#8f98a0;font-size:10px;margin-bottom:3px;';
        eagBarLabel.textContent = '体感完成度 ' + eag.current_completion_pct + '%';
        var eagBar = document.createElement('div');
        eagBar.style.cssText = 'height:6px;background:#1e3828;border-radius:3px;overflow:hidden;';
        var eagFill = document.createElement('div');
        eagFill.style.cssText = 'height:100%;width:' + Math.max(0, Math.min(100, eag.current_completion_pct)) + '%;background:#66c0f4;border-radius:3px;';
        eagBar.appendChild(eagFill);
        eagBarWrap.appendChild(eagBarLabel); eagBarWrap.appendChild(eagBar);
        eagWrap.appendChild(eagBarWrap);
      }
      if (eag.evidence) {
        var eagNote = document.createElement('div');
        eagNote.style.cssText = 'color:#8f98a0;font-size:10px;';
        eagNote.textContent = '根拠: ' + eag.evidence;
        eagWrap.appendChild(eagNote);
      }
      body.appendChild(eagWrap);
    }

    // ── temporal_analysis: レビュー時系列・アップデート改善分析 ──
    if (analysis.temporal_analysis) {
      var ta = analysis.temporal_analysis;
      var taColors = { improving: '#4caf50', stable: '#f6c744', declining: '#e74c3c' };
      var taLabels = { improving: '📈 改善傾向', stable: '📊 横ばい', declining: '📉 悪化傾向' };
      var taColor = taColors[ta.trend] || '#8f98a0';
      var taWrap = document.createElement('div');
      taWrap.style.cssText = 'margin-bottom:12px;padding:10px 14px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid ' + taColor + ';';
      var taHeader = document.createElement('div');
      taHeader.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
      var taBadge = document.createElement('span');
      taBadge.style.cssText = 'font-size:11px;font-weight:bold;color:' + taColor + ';';
      taBadge.textContent = taLabels[ta.trend] || '📊';
      taHeader.appendChild(taBadge);
      if (ta.ea_transition) {
        var eaBadge = document.createElement('span');
        eaBadge.style.cssText = 'font-size:10px;background:rgba(102,192,244,0.2);color:#66c0f4;'
          + 'border:1px solid #66c0f4;border-radius:3px;padding:1px 5px;';
        eaBadge.textContent = ta.ea_transition;
        taHeader.appendChild(eaBadge);
      }
      taWrap.appendChild(taHeader);
      if (ta.recent_positive_pct != null && ta.historical_positive_pct != null) {
        var taBar = document.createElement('div');
        taBar.style.cssText = 'display:flex;gap:12px;margin-bottom:5px;font-size:11px;color:#8f98a0;';
        var mkStat = function(label, pct) {
          var s = document.createElement('span');
          s.textContent = label + ': ' + pct + '%';
          return s;
        };
        taBar.appendChild(mkStat('直近', ta.recent_positive_pct));
        taBar.appendChild(mkStat('過去', ta.historical_positive_pct));
        taWrap.appendChild(taBar);
      }
      if (ta.update_impact) {
        var taImpact = document.createElement('div');
        taImpact.style.cssText = 'font-size:11px;color:#c6d4df;margin-bottom:3px;';
        taImpact.textContent = '🔧 ' + ta.update_impact;
        taWrap.appendChild(taImpact);
      }
      if (ta.insight) {
        var taInsight = document.createElement('div');
        taInsight.style.cssText = 'font-size:11px;color:#8f98a0;';
        taInsight.textContent = ta.insight;
        taWrap.appendChild(taInsight);
      }
      body.appendChild(taWrap);
    }

    // ── 機能3: 感情スコア時系列グラフ ──
    (function() {
      var tm = _extraMeta && _extraMeta.trendMeta;
      if (!tm) return;
      var bars = [
        { label: '〜30日', val: tm.d30 },
        { label: '〜90日', val: tm.d90 },
        { label: '〜1年', val: tm.d365 },
        { label: 'それ以前', val: tm.dOld }
      ].filter(function(b) { return b.val !== null && b.val !== undefined; });
      if (!bars.length) return;
      var tgWrap = document.createElement('div');
      tgWrap.style.cssText = 'margin-bottom:12px;background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 14px;';
      var tgTitle = document.createElement('div');
      tgTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;';
      tgTitle.textContent = '📊 感情スコア 時系列';
      tgWrap.appendChild(tgTitle);
      var svgW = 240, svgH = 80, padL = 28, padB = 20, barGap = 4;
      var barW = Math.floor((svgW - padL - barGap * (bars.length - 1)) / bars.length - barGap);
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', svgW);
      svg.setAttribute('height', svgH + padB);
      svg.style.cssText = 'display:block;overflow:visible;';
      bars.forEach(function(b, i) {
        var barColor = b.val >= 70 ? '#4caf50' : b.val >= 40 ? '#f6c744' : '#e74c3c';
        var barH = Math.max(4, Math.round((b.val / 100) * svgH));
        var x = padL + i * (barW + barGap);
        var y = svgH - barH;
        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x); rect.setAttribute('y', y);
        rect.setAttribute('width', barW); rect.setAttribute('height', barH);
        rect.setAttribute('fill', barColor); rect.setAttribute('rx', '2');
        svg.appendChild(rect);
        var valText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        valText.setAttribute('x', x + barW / 2); valText.setAttribute('y', y - 3);
        valText.setAttribute('text-anchor', 'middle');
        valText.setAttribute('font-size', '9'); valText.setAttribute('fill', barColor);
        valText.textContent = b.val + '%';
        svg.appendChild(valText);
        var lblText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lblText.setAttribute('x', x + barW / 2); lblText.setAttribute('y', svgH + padB - 2);
        lblText.setAttribute('text-anchor', 'middle');
        lblText.setAttribute('font-size', '8'); lblText.setAttribute('fill', '#8f98a0');
        lblText.textContent = b.label;
        svg.appendChild(lblText);
      });
      // Y軸ガイドライン
      [0, 50, 100].forEach(function(v) {
        var yPos = svgH - Math.round(v / 100 * svgH);
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padL - 4); line.setAttribute('x2', svgW);
        line.setAttribute('y1', yPos); line.setAttribute('y2', yPos);
        line.setAttribute('stroke', '#2d3d35'); line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
        var yLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        yLbl.setAttribute('x', 0); yLbl.setAttribute('y', yPos + 3);
        yLbl.setAttribute('font-size', '8'); yLbl.setAttribute('fill', '#5a7a65');
        yLbl.textContent = v;
        svg.appendChild(yLbl);
      });
      tgWrap.appendChild(svg);
      body.appendChild(tgWrap);
    })();

    // ── 機能8: ネガティブ集約カード ──
    if (analysis.negative_summary && analysis.negative_summary.main_complaints && analysis.negative_summary.main_complaints.length) {
      var ns = analysis.negative_summary;
      var nsWrap = document.createElement('div');
      nsWrap.style.cssText = 'margin-bottom:12px;padding:10px 14px;border-radius:4px;'
        + 'background:rgba(231,76,60,0.07);border:1px solid rgba(231,76,60,0.5);';
      var nsTitle = document.createElement('div');
      nsTitle.style.cssText = 'color:#e74c3c;font-size:11px;font-weight:bold;margin-bottom:7px;';
      nsTitle.textContent = '⚠ 主な不満点';
      nsWrap.appendChild(nsTitle);
      ns.main_complaints.forEach(function(c) {
        if (!c) return;
        var item = document.createElement('div');
        item.style.cssText = 'color:#c6d4df;font-size:12px;line-height:1.5;margin-bottom:3px;display:flex;gap:5px;';
        var bullet = document.createElement('span');
        bullet.style.cssText = 'color:#e74c3c;flex-shrink:0;';
        bullet.textContent = '•';
        var txt = document.createElement('span');
        txt.textContent = c;
        item.appendChild(bullet); item.appendChild(txt);
        nsWrap.appendChild(item);
      });
      if (ns.deal_breaker && ns.deal_breaker !== 'null' && ns.deal_breaker !== null) {
        var dbEl = document.createElement('div');
        dbEl.style.cssText = 'margin-top:7px;padding:5px 8px;background:rgba(231,76,60,0.15);border-radius:3px;'
          + 'color:#ff6b6b;font-size:11px;font-weight:bold;border:1px solid rgba(231,76,60,0.4);';
        dbEl.textContent = '🚫 致命的問題: ' + ns.deal_breaker;
        nsWrap.appendChild(dbEl);
      }
      body.appendChild(nsWrap);
    }

    // ── 機能10: 日本語vs英語感情分析 ──
    if (analysis.ja_vs_en_sentiment && (extraData && extraData.jaReviewCount >= 5)) {
      var jes = analysis.ja_vs_en_sentiment;
      var jesWrap = document.createElement('div');
      jesWrap.style.cssText = 'margin-bottom:12px;background:#162520;border:1px solid #1e3828;border-radius:4px;padding:10px 14px;';
      var jesTitle = document.createElement('div');
      jesTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;';
      jesTitle.textContent = '🇯🇵 日本語 vs 英語 感情分析';
      jesWrap.appendChild(jesTitle);
      var jesRow = document.createElement('div');
      jesRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
      var makeScore = function(label, score, color) {
        var el = document.createElement('div');
        el.style.cssText = 'flex:1;';
        var lbl = document.createElement('div');
        lbl.style.cssText = 'color:#8f98a0;font-size:10px;margin-bottom:3px;';
        lbl.textContent = label;
        var bar = document.createElement('div');
        bar.style.cssText = 'height:8px;background:#1e3828;border-radius:4px;overflow:hidden;margin-bottom:2px;';
        var fill = document.createElement('div');
        fill.style.cssText = 'height:100%;width:' + Math.max(0,Math.min(100,score||0)) + '%;background:' + color + ';border-radius:4px;';
        bar.appendChild(fill);
        var val = document.createElement('span');
        val.style.cssText = 'color:' + color + ';font-size:10px;font-weight:bold;';
        val.textContent = (score || 0) + '/100';
        el.appendChild(lbl); el.appendChild(bar); el.appendChild(val);
        return el;
      };
      jesRow.appendChild(makeScore('🇯🇵 日本語', jes.ja_score, '#e91e63'));
      jesRow.appendChild(makeScore('🇺🇸 英語', jes.en_score, '#5dade2'));
      jesWrap.appendChild(jesRow);
      if (jes.difference) {
        var jesDiff = document.createElement('div');
        jesDiff.style.cssText = 'color:#8f98a0;font-size:10px;margin-top:5px;';
        jesDiff.textContent = '💬 ' + jes.difference;
        jesWrap.appendChild(jesDiff);
      }
      body.appendChild(jesWrap);
    }

    // ── 機能F10: 返金リスクカード ──
    if (analysis.refund_risk && analysis.refund_risk.pct != null) {
      var rr = analysis.refund_risk;
      var rrColor = rr.label === '高' ? '#e74c3c' : rr.label === '中' ? '#f6c744' : '#4caf50';
      var rrWrap = document.createElement('div');
      rrWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid ' + rrColor + ';'
        + 'color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;';
      var rrIcon = document.createElement('span');
      rrIcon.textContent = '💸';
      var rrText = document.createElement('span');
      rrText.style.cssText = 'flex:1;';
      rrText.textContent = '返金リスク: ' + rr.label + ' (' + rr.pct + '%)';
      if (rr.insight) rrText.textContent += ' — ' + rr.insight;
      rrWrap.appendChild(rrIcon); rrWrap.appendChild(rrText);
      addBadgeTooltip(rrWrap, '返金リスク' + rr.pct + '%: 2時間以内に返金されやすいゲームかの推定値');
      body.appendChild(rrWrap);
    }

    // ── 機能F11: バグスコアカード ──
    if (analysis.bug_score && analysis.bug_score.pct != null) {
      var bs = analysis.bug_score;
      var bsColor = bs.severity === 'critical' ? '#e74c3c' : bs.severity === 'moderate' ? '#ff9800' : bs.severity === 'minor' ? '#f6c744' : '#4caf50';
      if (bs.severity !== 'clean' || bs.pct > 0) {
        var bsWrap = document.createElement('div');
        bsWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
          + 'background:rgba(0,0,0,0.2);border:1px solid ' + bsColor + ';'
          + 'color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;';
        var bsIcon = document.createElement('span');
        bsIcon.textContent = '🐛';
        var bsSeverityLabel = { critical: '深刻', moderate: '中程度', minor: '軽微', clean: 'なし' };
        var bsText = document.createElement('span');
        bsText.style.cssText = 'flex:1;';
        bsText.textContent = 'バグ/クラッシュ言及: ' + bs.pct + '% (' + (bsSeverityLabel[bs.severity] || bs.severity) + ')';
        if (bs.detail) bsText.textContent += ' — ' + bs.detail;
        bsWrap.appendChild(bsIcon); bsWrap.appendChild(bsText);
        addBadgeTooltip(bsWrap, 'スコア' + bs.pct + ': レビューから算出したバグ・クラッシュ頻度の深刻度');
        body.appendChild(bsWrap);
      }
    }

    // ── 機能F12: マルチ過疎化カード ──
    if (analysis.population_health && analysis.population_health.status) {
      var ph = analysis.population_health;
      var phColors = { thriving: '#4caf50', active: '#66c0f4', declining: '#f6c744', dead: '#e74c3c' };
      var phLabels = { thriving: '活発', active: '普通', declining: '減少傾向', dead: '過疎' };
      var phColor = phColors[ph.status] || '#8f98a0';
      var phWrap = document.createElement('div');
      phWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid ' + phColor + ';'
        + 'color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;';
      var phIcon = document.createElement('span');
      phIcon.textContent = '👥';
      var phText = document.createElement('span');
      phText.style.cssText = 'flex:1;';
      phText.textContent = 'プレイヤー数: ' + (phLabels[ph.status] || ph.status) + ' (過疎言及: ' + ph.evidence_pct + '%)';
      // レビュー文面からのAI推測だけでなく、Steam公式APIの実際の同時接続数(ground truth)があれば併記する。
      if (_extraMeta && _extraMeta.currentPlayers != null) {
        phText.textContent += ' · 現在の同時接続数: ' + _extraMeta.currentPlayers.toLocaleString() + '人';
      }
      if (ph.insight) phText.textContent += ' — ' + ph.insight;
      phWrap.appendChild(phIcon); phWrap.appendChild(phText);
      addBadgeTooltip(phWrap, '過疎度スコア: マルチプレイのマッチング・コミュニティ活性度');
      body.appendChild(phWrap);
    } else if (_extraMeta && _extraMeta.currentPlayers != null) {
      // AIがpopulation_healthを返さなかった場合でも、実数だけは分かっているので単独表示する。
      var pcWrap = document.createElement('div');
      pcWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid #4a5a6a;color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;';
      var pcIcon = document.createElement('span');
      pcIcon.textContent = '👥';
      var pcText = document.createElement('span');
      pcText.textContent = '現在の同時接続数: ' + _extraMeta.currentPlayers.toLocaleString() + '人';
      pcWrap.appendChild(pcIcon); pcWrap.appendChild(pcText);
      body.appendChild(pcWrap);
    }

    // ── 機能F13: レビュー爆撃警告 ──
    if (analysis.review_bomb && analysis.review_bomb.detected) {
      var rb = analysis.review_bomb;
      var rbWrap = document.createElement('div');
      rbWrap.style.cssText = 'margin-bottom:10px;padding:10px 14px;border-radius:4px;'
        + 'background:rgba(231,76,60,0.12);border:2px solid #e74c3c;'
        + 'color:#ff6b6b;font-size:12px;font-weight:bold;';
      var rbTitle = document.createElement('div');
      rbTitle.style.cssText = 'margin-bottom:4px;font-size:13px;';
      rbTitle.textContent = '🚨 レビュー爆撃の可能性';
      var rbDetail = document.createElement('div');
      rbDetail.style.cssText = 'color:#c6d4df;font-size:11px;font-weight:normal;';
      var detailText = rb.period ? rb.period + 'に集中 ' : '';
      if (rb.trigger) detailText += '— 推測原因: ' + rb.trigger;
      if (rb.insight) detailText += ' ' + rb.insight;
      rbDetail.textContent = detailText;
      rbWrap.appendChild(rbTitle); rbWrap.appendChild(rbDetail);
      addBadgeTooltip(rbWrap, 'レビュー爆撃検出: 特定期間に不自然なネガティブレビューが集中した形跡');
      body.insertBefore(rbWrap, body.firstChild);
    }

    // ── 機能F14: DLC依存度カード ──
    if (analysis.dlc_dependency && analysis.dlc_dependency.score != null) {
      var dd = analysis.dlc_dependency;
      var ddColors = { 必須: '#e74c3c', 推奨: '#ff9800', 任意: '#f6c744', なし: '#4caf50' };
      var ddColor = ddColors[dd.label] || '#8f98a0';
      if (dd.label !== 'なし' || dd.score > 0) {
        var ddWrap = document.createElement('div');
        ddWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
          + 'background:rgba(0,0,0,0.2);border:1px solid ' + ddColor + ';'
          + 'color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;';
        var ddIcon = document.createElement('span');
        ddIcon.textContent = '🎮';
        var ddText = document.createElement('span');
        ddText.style.cssText = 'flex:1;';
        ddText.textContent = 'DLC依存度: ' + dd.label + ' (' + dd.score + '%)';
        if (dd.detail) ddText.textContent += ' — ' + dd.detail;
        ddWrap.appendChild(ddIcon); ddWrap.appendChild(ddText);
        body.appendChild(ddWrap);
      }
    }

    // ── DLC合計金額 ──
    // ページ読み込み時ではなくボタン押下時に取得する: DLC数の多いゲーム(パラドックス系等)で
    // 開いただけで大量にSteamへリクエストが飛ぶとAkamaiのbot判定に引っかかるおそれがあるため。
    (function () {
      var dlcIds = (_extraMeta && _extraMeta.basicData && _extraMeta.basicData.dlc) || [];
      if (!dlcIds.length) return;
      var DLC_CAP = 30;
      var capped = dlcIds.slice(0, DLC_CAP);
      var dlcWrap = document.createElement('div');
      dlcWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid #66c0f4;'
        + 'color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;';
      var dlcIcon = document.createElement('span');
      dlcIcon.textContent = '📦';
      var dlcText = document.createElement('span');
      dlcText.style.cssText = 'flex:1;';
      dlcText.textContent = 'DLC ' + dlcIds.length + '個'
        + (dlcIds.length > DLC_CAP ? '（上位' + DLC_CAP + '個のみ計算対象）' : '');
      var dlcBtn = document.createElement('button');
      dlcBtn.textContent = '💰 合計金額を計算';
      dlcBtn.style.cssText = 'padding:3px 10px;background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;'
        + 'border-radius:3px;cursor:pointer;font-size:11px;font-family:sans-serif;';
      dlcBtn.addEventListener('click', async function () {
        dlcBtn.disabled = true;
        dlcBtn.textContent = '⏳ 取得中...';
        var total = 0, priced = 0, skipped = 0;
        var CHUNK = 10;
        for (var i = 0; i < capped.length; i += CHUNK) {
          var chunk = capped.slice(i, i + CHUNK);
          try {
            var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + chunk.join(',') + '&filters=price_overview&cc=jp', { signal: _timeoutSignal(8000) });
            var d = r.ok ? await r.json() : null;
            chunk.forEach(function (id) {
              var po = d && d[id] && d[id].data && d[id].data.price_overview;
              if (po && po.final != null) { total += po.final; priced++; }
              else skipped++;
            });
          } catch (e) { skipped += chunk.length; }
          if (i + CHUNK < capped.length) await new Promise(function (res) { setTimeout(res, 500); });
        }
        dlcBtn.remove();
        dlcText.textContent = 'DLC合計 ¥' + Math.floor(total / 100).toLocaleString() + '（' + priced + '個分'
          + (skipped ? '・' + skipped + '個は価格取得不可' : '') + (dlcIds.length > DLC_CAP ? '・上位' + DLC_CAP + '個のみ' : '') + '）';
      });
      dlcWrap.appendChild(dlcIcon); dlcWrap.appendChild(dlcText); dlcWrap.appendChild(dlcBtn);
      body.appendChild(dlcWrap);
    })();

    // ── 機能F28: プレイスタイル相性スコア ──
    if (analysis.playstyle_match && analysis.playstyle_match.score != null) {
      var pm = analysis.playstyle_match;
      var pmColor = pm.score >= 80 ? '#4caf50' : pm.score >= 60 ? '#66c0f4' : pm.score >= 40 ? '#f6c744' : '#e74c3c';
      var pmWrap = document.createElement('div');
      pmWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid ' + pmColor + ';'
        + 'color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;';
      var pmIcon = document.createElement('span');
      pmIcon.textContent = '🎯';
      var pmText = document.createElement('span');
      pmText.style.cssText = 'flex:1;';
      pmText.textContent = 'あなたへの相性: ' + pm.label + ' (' + pm.score + '/100)';
      if (pm.reason) pmText.textContent += ' — ' + pm.reason;
      pmWrap.appendChild(pmIcon); pmWrap.appendChild(pmText);
      body.appendChild(pmWrap);
    }

    // ── 機能F24/25: HowLongToBeat / PCGamingWiki リンクカード ──
    (function() {
      var titleEl = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
      var gameTitle = titleEl ? titleEl.textContent.trim() : '';
      if (!gameTitle) return;
      var extCard = document.createElement('div');
      extCard.style.cssText = 'margin-bottom:10px;padding:8px 12px;border-radius:4px;'
        + 'background:#162520;border:1px solid #1e3828;display:flex;gap:12px;flex-wrap:wrap;align-items:center;';
      var extTitle = document.createElement('div');
      extTitle.style.cssText = 'color:#8fcfa0;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;width:100%;margin-bottom:4px;';
      extTitle.textContent = '外部リンク';
      var hltbLink = document.createElement('a');
      hltbLink.href = 'https://howlongtobeat.com/?q=' + encodeURIComponent(gameTitle);
      hltbLink.target = '_blank';
      hltbLink.style.cssText = 'color:#66c0f4;font-size:11px;text-decoration:none;';
      hltbLink.addEventListener('mouseenter', function() { hltbLink.style.textDecoration = 'underline'; });
      hltbLink.addEventListener('mouseleave', function() { hltbLink.style.textDecoration = 'none'; });
      hltbLink.textContent = '⏱ HowLongToBeat で確認';
      var pcwLink = document.createElement('a');
      pcwLink.href = 'https://www.pcgamingwiki.com/w/index.php?search=' + encodeURIComponent(gameTitle);
      pcwLink.target = '_blank';
      pcwLink.style.cssText = 'color:#66c0f4;font-size:11px;text-decoration:none;';
      pcwLink.addEventListener('mouseenter', function() { pcwLink.style.textDecoration = 'underline'; });
      pcwLink.addEventListener('mouseleave', function() { pcwLink.style.textDecoration = 'none'; });
      pcwLink.textContent = '🖥 PCGamingWiki で互換性確認';
      extCard.appendChild(extTitle);
      extCard.appendChild(hltbLink);
      extCard.appendChild(pcwLink);
      body.appendChild(extCard);
    })();

    // ── 機能F27: SteamSpy オーナー数 ──
    (function() {
      var appId = getGameId();
      if (!appId) return;
      var ssWrap = document.createElement('div');
      ssWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:#162520;border:1px solid #1e3828;font-size:11px;color:#8f98a0;';
      ssWrap.textContent = '📊 SteamSpy データ取得中...';
      body.appendChild(ssWrap);
      _bgFetch('https://steamspy.com/api.php?request=appdetails&appid=' + appId, {})
        .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return JSON.parse(r.bodyText); })
        .then(function(d) {
          if (!d || !d.owners) { ssWrap.remove(); return; }
          var owners = d.owners; // "1,000,000 .. 2,000,000"
          var avgForever = d.average_forever || 0;
          var avg2weeks = d.average_2weeks || 0;
          var avgHForever = Math.round(avgForever / 60 * 10) / 10;
          var avg2wH = Math.round(avg2weeks / 60 * 10) / 10;
          ssWrap.textContent = '';
          var ssIcon = document.createElement('span');
          ssIcon.textContent = '📊 ';
          var ssText = document.createElement('span');
          ssText.style.cssText = 'color:#c6d4df;';
          // 機能23: 人気度ラベル計算
          var ownerLow = 0;
          var ownerMatch = owners.match(/([\d,]+)/);
          if (ownerMatch) ownerLow = parseInt(ownerMatch[1].replace(/,/g, ''), 10) || 0;
          var popularLabel = ownerLow >= 1000000 ? '🔥 人気タイトル' : ownerLow >= 100000 ? '📈 中規模タイトル' : ownerLow >= 10000 ? '🎮 インディー' : '🌱 ニッチ';
          ssText.textContent = '推定オーナー数: ' + owners + '人 / 平均プレイ: ' + avgHForever + 'h全体 · ' + avg2wH + 'h直近2週 · ' + popularLabel;
          ssWrap.appendChild(ssIcon); ssWrap.appendChild(ssText);
        })
        .catch(function() { ssWrap.remove(); });
    })();

    // ── 機能10: MODコミュニティ評価 ──
    (function() {
      var wc = _extraMeta && _extraMeta.workshopCount;
      if (!wc || wc <= 0) return;
      var wcWrap = document.createElement('div');
      wcWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:#162520;border:1px solid #1e3828;font-size:11px;color:#c6d4df;display:flex;gap:8px;align-items:center;';
      var wcColor = wc >= 1000 ? '#4caf50' : wc >= 100 ? '#f6c744' : '#8f98a0';
      var wcLabel = wc >= 1000 ? '🔧 MOD豊富 (' + wc.toLocaleString() + '件)' : wc >= 100 ? '🔧 MODあり (' + wc.toLocaleString() + '件)' : '🔧 MOD少 (' + wc + '件)';
      var wcEl = document.createElement('span');
      wcEl.style.cssText = 'color:' + wcColor + ';font-weight:bold;';
      wcEl.textContent = wcLabel;
      wcWrap.appendChild(wcEl);
      body.appendChild(wcWrap);
    })();

    // ── 体験版有無 ──
    (function () {
      var demos = _extraMeta && _extraMeta.basicData && _extraMeta.basicData.demos;
      if (!demos || !demos.length) return;
      var demoWrap = document.createElement('div');
      demoWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(102,192,244,0.08);border:1px solid rgba(102,192,244,0.3);'
        + 'font-size:11px;color:#66c0f4;font-weight:bold;';
      demoWrap.textContent = '🎮 体験版あり — 購入前に試遊できます';
      body.appendChild(demoWrap);
    })();

    // ── 機能21: Metacritic連携 ──
    (function() {
      var mc = _extraMeta && _extraMeta.metacritic;
      if (!mc || !mc.score) return;
      var mcScore = mc.score;
      var mcColor = mcScore >= 80 ? '#4caf50' : mcScore >= 60 ? '#f6c744' : '#e74c3c';
      var mcLabel = mcScore >= 80 ? '好評' : mcScore >= 60 ? '普通' : '不評';
      var mcWrap = document.createElement('div');
      mcWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid ' + mcColor + ';font-size:11px;color:#c6d4df;display:flex;gap:8px;align-items:center;';
      var mcBadge = document.createElement('span');
      mcBadge.style.cssText = 'background:' + mcColor + ';color:#fff;font-weight:bold;font-size:12px;padding:2px 7px;border-radius:3px;';
      mcBadge.textContent = 'MC: ' + mcScore + ' (' + mcLabel + ')';
      mcWrap.appendChild(mcBadge);
      if (mc.url) {
        var mcLink = document.createElement('a');
        mcLink.href = mc.url;
        mcLink.target = '_blank';
        mcLink.rel = 'noopener';
        mcLink.style.cssText = 'color:#66c0f4;font-size:10px;text-decoration:none;margin-left:4px;';
        mcLink.textContent = 'Metacriticで見る →';
        mcLink.addEventListener('mouseenter', function() { mcLink.style.textDecoration = 'underline'; });
        mcLink.addEventListener('mouseleave', function() { mcLink.style.textDecoration = 'none'; });
        mcWrap.appendChild(mcLink);
      }
      body.appendChild(mcWrap);
    })();

    // ── 機能24: コミュニティ活性度 ──
    (function() {
      var avg = _extraMeta && _extraMeta.weeklyReviewAvg;
      if (avg == null) return;
      var actColor = avg >= 50 ? '#4caf50' : avg >= 10 ? '#66c0f4' : '#8f98a0';
      var actLabel = avg >= 50 ? '🔥 活発' : avg >= 10 ? '💬 普通' : '😴 過疎気味';
      var actWrap = document.createElement('div');
      actWrap.style.cssText = 'margin-bottom:10px;padding:7px 12px;border-radius:4px;'
        + 'background:rgba(0,0,0,0.2);border:1px solid ' + actColor + ';font-size:11px;color:#8f98a0;display:flex;gap:8px;align-items:center;';
      var actEl = document.createElement('span');
      actEl.style.cssText = 'color:' + actColor + ';font-weight:bold;';
      actEl.textContent = actLabel;
      var actNote = document.createElement('span');
      actNote.textContent = 'コミュニティ活性度 (週平均 ' + avg + '件のレビュー)';
      actWrap.appendChild(actEl); actWrap.appendChild(actNote);
      body.appendChild(actWrap);
    })();

    // ── 機能4: プレイスタイル自己診断 ──
    (function() {
      var DIAG_KEY = 'ja_trans_playstyle';
      var diagBtn = document.createElement('button');
      diagBtn.id = 'ja-diag-btn';
      diagBtn.style.cssText = 'display:block;width:100%;margin:8px 0;padding:8px 14px;'
        + 'background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;border-radius:4px;'
        + 'cursor:pointer;font-size:12px;font-family:sans-serif;text-align:center;';

      function refreshDiagBtn(saved) {
        diagBtn.textContent = saved ? '🎯 マッチ度を再診断' : '🎯 あなたとのマッチ度を診断';
      }
      chrome.storage.local.get([DIAG_KEY], function(r) { refreshDiagBtn(r[DIAG_KEY]); });

      var diagPanel = null;
      diagBtn.addEventListener('click', function() {
        if (diagPanel) { diagPanel.remove(); diagPanel = null; return; }
        diagPanel = document.createElement('div');
        diagPanel.style.cssText = 'background:#162520;border:1px solid #2d5a3d;border-radius:4px;'
          + 'padding:12px 14px;margin-bottom:8px;font-family:sans-serif;';

        var QUESTIONS = [
          { key: 'style', label: 'プレイスタイル', opts: ['ストーリー重視', 'ゲームプレイ重視', 'バランス'] },
          { key: 'time',  label: 'プレイ時間/週',  opts: ['カジュアル（〜2時間）', '普通（2〜10時間）', 'ヘビー（10時間+）'] },
          { key: 'mode',  label: 'プレイ形式',      opts: ['ソロ専', 'たまにマルチ', 'マルチ中心'] },
          { key: 'diff',  label: '難易度好み',      opts: ['ゆったり', '普通', '歯ごたえあり'] },
          { key: 'genre', label: 'ジャンル傾向',    opts: ['アクション系', '戦略・管理系', '探索・オープンワールド', 'ホラー・サバイバル'] },
        ];
        var answers = {};

        // 保存済み回答を読み込む
        chrome.storage.local.get([DIAG_KEY], function(r) {
          var saved = r[DIAG_KEY] || {};
          QUESTIONS.forEach(function(q) {
            var qWrap = document.createElement('div');
            qWrap.style.cssText = 'margin-bottom:10px;';
            var qLabel = document.createElement('div');
            qLabel.style.cssText = 'color:#8fcfa0;font-size:11px;margin-bottom:5px;';
            qLabel.textContent = q.label;
            qWrap.appendChild(qLabel);
            var optRow = document.createElement('div');
            optRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
            q.opts.forEach(function(opt) {
              var lbl = document.createElement('label');
              lbl.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:#c6d4df;';
              var inp = document.createElement('input');
              inp.type = 'radio';
              inp.name = 'diag_' + q.key;
              inp.value = opt;
              inp.style.cssText = 'accent-color:#4caf50;';
              if (saved[q.key] === opt) { inp.checked = true; answers[q.key] = opt; }
              inp.addEventListener('change', function() { answers[q.key] = opt; });
              lbl.appendChild(inp);
              lbl.appendChild(document.createTextNode(opt));
              optRow.appendChild(lbl);
            });
            qWrap.appendChild(optRow);
            diagPanel.appendChild(qWrap);
          });

          var submitDiag = document.createElement('button');
          submitDiag.textContent = '診断する';
          submitDiag.style.cssText = 'padding:6px 16px;background:#0d1a10;color:#4caf50;border:1px solid #4caf50;'
            + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;margin-top:6px;';
          var diagResult = document.createElement('div');
          diagResult.style.cssText = 'margin-top:10px;font-size:12px;color:#c6d4df;';

          submitDiag.addEventListener('click', async function() {
            if (Object.keys(answers).length < 5) {
              diagResult.textContent = '全ての質問に回答してください';
              diagResult.style.color = '#e74c3c';
              return;
            }
            submitDiag.disabled = true;
            submitDiag.textContent = '診断中...';
            diagResult.textContent = '';
            try {
              var analysisData = {
                verdict: analysis.recommendation && analysis.recommendation.verdict,
                summary: analysis.summary,
                pros: analysis.pros,
                cons: analysis.cons,
                categories: analysis.categories,
                audience: analysis.audience,
              };
              var diagPrompt = 'ゲーム分析データとユーザーのプレイスタイル回答をもとに、このゲームとユーザーのマッチ度を診断してください。\n\n'
                + 'ゲーム分析: ' + JSON.stringify(analysisData) + '\n\n'
                + 'ユーザー回答: ' + JSON.stringify(answers) + '\n\n'
                + '以下のJSON形式のみで回答（コードブロック不要）:\n'
                + '{"match_score":75,"verdict":"ほぼマッチ","reasons":["理由1","理由2"],"concern":null,"recommendation":"総合的なアドバイス（40字）"}';
              var result = await _aiJson(diagPrompt);
              var score = parseInt(result.match_score) || 0;
              var scoreColor = score >= 70 ? '#4caf50' : score >= 40 ? '#f6c744' : '#e74c3c';
              while (diagResult.firstChild) { diagResult.removeChild(diagResult.firstChild); }
              var scoreEl = document.createElement('div');
              scoreEl.style.cssText = 'font-size:20px;font-weight:bold;color:' + scoreColor + ';margin-bottom:4px;';
              scoreEl.textContent = score + '% — ' + (result.verdict || '');
              diagResult.appendChild(scoreEl);
              if (result.reasons && result.reasons.length) {
                var reasonEl = document.createElement('ul');
                reasonEl.style.cssText = 'margin:6px 0 6px 14px;padding:0;font-size:11px;color:#8fcfa0;';
                result.reasons.forEach(function(r) {
                  var li = document.createElement('li');
                  li.textContent = r;
                  reasonEl.appendChild(li);
                });
                diagResult.appendChild(reasonEl);
              }
              if (result.concern) {
                var concernEl = document.createElement('div');
                concernEl.style.cssText = 'font-size:11px;color:#f6c744;margin-bottom:4px;';
                concernEl.textContent = '⚠ ' + result.concern;
                diagResult.appendChild(concernEl);
              }
              if (result.recommendation) {
                var recEl = document.createElement('div');
                recEl.style.cssText = 'font-size:11px;color:#c6d4df;border-top:1px solid #1e3828;padding-top:6px;margin-top:4px;';
                renderLiteMarkdown(recEl, result.recommendation);
                diagResult.appendChild(recEl);
              }
              // 回答を保存
              var saveObj = {}; saveObj[DIAG_KEY] = answers;
              chrome.storage.local.set(saveObj);
              refreshDiagBtn(true);
            } catch(e) {
              diagResult.textContent = '診断失敗: ' + e.message;
              diagResult.style.color = '#e74c3c';
            }
            submitDiag.disabled = false;
            submitDiag.textContent = '診断する';
          });
          diagPanel.appendChild(submitDiag);
          diagPanel.appendChild(diagResult);
        });

        diagBtn.parentNode.insertBefore(diagPanel, diagBtn.nextSibling);
      });
      body.appendChild(diagBtn);
    })();

    // ── 機能F29: 購入判断レポートボタン ──
    (function() {
      var reportBtn = document.createElement('button');
      reportBtn.id = 'ja-purchase-report-btn';
      reportBtn.textContent = '📋 購入判断レポートを生成';
      reportBtn.style.cssText = 'display:block;width:100%;margin:10px 0;padding:8px 14px;'
        + 'background:#1b2838;color:#f6c744;border:1px solid #f6c744;border-radius:4px;'
        + 'cursor:pointer;font-size:12px;font-family:sans-serif;text-align:center;';
      reportBtn.addEventListener('click', async function() {
        var existingReport = document.getElementById('ja-purchase-report-result');
        if (existingReport) { existingReport.remove(); return; }
        var _activeApiKey = (_opts.aiProvider === '1min' && _1minKeyCache) ? _1minKeyCache : _geminiKeyCache;
        if (!_activeApiKey && !_1minKeyCache) { toast('レポート生成にはAPIキーが必要です', '#f6c744'); return; }
        reportBtn.disabled = true;
        reportBtn.textContent = '⏳ 生成中...';
        try {
          var summaryData = JSON.stringify({
            verdict: analysis.recommendation && analysis.recommendation.verdict,
            reason: analysis.recommendation && analysis.recommendation.reason,
            pros: analysis.pros,
            cons: analysis.cons,
            summary: analysis.summary,
            playtime: analysis.playtime,
            playstyle_match: analysis.playstyle_match,
            bug_score: analysis.bug_score,
            dlc_dependency: analysis.dlc_dependency,
            refund_risk: analysis.refund_risk
          });
          var reportPrompt = '以下のゲーム分析データをもとに、購入判断レポートを生成してください。\n\n'
            + summaryData + '\n\n'
            + '以下のJSON形式のみで回答（コードブロック不要）:\n'
            + '{"buy_verdict":"今すぐ買い/セール待ち/見送り推奨","one_line":"15字以内","reasons_to_buy":["理由1","理由2","理由3"],"reasons_to_skip":["理由1","理由2"],"best_for":"どんな人に最適か（20字）","final_advice":"最終アドバイス（50字）"}';
          var report = await _aiJson(reportPrompt);
          var isBuy = report.buy_verdict && (report.buy_verdict.indexOf('買い') >= 0 || report.buy_verdict === '今すぐ買い');
          var isSkip = report.buy_verdict && report.buy_verdict.indexOf('見送り') >= 0;
          var rColor = isBuy ? '#4caf50' : isSkip ? '#e74c3c' : '#f6c744';
          var rBg = isBuy ? 'rgba(76,175,80,0.08)' : isSkip ? 'rgba(231,76,60,0.08)' : 'rgba(246,199,68,0.06)';
          var reportDiv = document.createElement('div');
          reportDiv.id = 'ja-purchase-report-result';
          reportDiv.style.cssText = 'margin:8px 0;padding:12px 14px;border-radius:6px;'
            + 'background:' + rBg + ';border:1px solid ' + rColor + ';font-family:sans-serif;';
          var rtitle = document.createElement('div');
          rtitle.style.cssText = 'color:' + rColor + ';font-size:14px;font-weight:bold;margin-bottom:8px;';
          rtitle.textContent = '📋 ' + (report.buy_verdict || '購入判断');
          reportDiv.appendChild(rtitle);
          if (report.one_line) {
            var rOneLine = document.createElement('div');
            rOneLine.style.cssText = 'color:#c6d4df;font-size:13px;font-style:italic;margin-bottom:10px;';
            rOneLine.textContent = '「' + report.one_line + '」';
            reportDiv.appendChild(rOneLine);
          }
          var makeReportList = function(items, color, title) {
            if (!items || !items.length) return;
            var wrap = document.createElement('div');
            wrap.style.cssText = 'margin-bottom:8px;';
            var t = document.createElement('div');
            t.style.cssText = 'color:' + color + ';font-size:11px;font-weight:bold;margin-bottom:4px;';
            t.textContent = title;
            wrap.appendChild(t);
            items.forEach(function(item) {
              var li = document.createElement('div');
              li.style.cssText = 'color:#c6d4df;font-size:11px;line-height:1.5;';
              li.textContent = '• ' + item;
              wrap.appendChild(li);
            });
            reportDiv.appendChild(wrap);
          };
          makeReportList(report.reasons_to_buy, '#4caf50', '✓ 購入理由');
          makeReportList(report.reasons_to_skip, '#e74c3c', '✗ 見送り理由');
          if (report.best_for) {
            var rbf = document.createElement('div');
            rbf.style.cssText = 'color:#66c0f4;font-size:11px;margin-bottom:6px;';
            rbf.textContent = '👤 こんな人に最適: ' + report.best_for;
            reportDiv.appendChild(rbf);
          }
          if (report.final_advice) {
            var rfa = document.createElement('div');
            rfa.style.cssText = 'color:#8fcfa0;font-size:11px;padding:6px 8px;background:rgba(76,175,80,0.06);border-radius:3px;border-left:3px solid ' + rColor + ';';
            rfa.textContent = '💡 ' + report.final_advice;
            reportDiv.appendChild(rfa);
          }
          reportBtn.parentNode.insertBefore(reportDiv, reportBtn.nextSibling);
        } catch(e) {
          toast('レポート生成失敗: ' + e.message, '#e74c3c');
        }
        reportBtn.disabled = false;
        reportBtn.textContent = '📋 購入判断レポートを生成';
      });
      body.appendChild(reportBtn);

      // ── 辛口評価 ──
      var harshBtn = document.createElement('button');
      harshBtn.id = 'ja-harsh-btn';
      harshBtn.textContent = '🌶 辛口評価を見る';
      harshBtn.style.cssText = 'display:block;width:100%;margin:6px 0;padding:8px 14px;'
        + 'background:#1b2838;color:#e74c3c;border:1px solid #e74c3c;border-radius:4px;'
        + 'cursor:pointer;font-size:12px;font-family:sans-serif;text-align:center;';
      harshBtn.addEventListener('click', async function() {
        var existing = document.getElementById('ja-harsh-result');
        if (existing) { existing.remove(); return; }
        if (!_geminiKeyCache && !_1minKeyCache) { toast('APIキーが必要です', '#f6c744'); return; }
        harshBtn.disabled = true; harshBtn.textContent = '⏳ 生成中...';
        try {
          var harshData = {
            title: (document.querySelector('.apphub_AppName, h1.game_name') || {}).textContent || 'このゲーム',
            verdict: analysis.recommendation && analysis.recommendation.verdict,
            pros: analysis.pros,
            cons: analysis.cons,
            summary: analysis.summary,
            negative_summary: analysis.negative_summary,
            bug_score: analysis.bug_score,
            refund_risk: analysis.refund_risk,
            risk_flags: analysis.risk_flags,
            dlc_dependency: analysis.dlc_dependency,
            update_activity: analysis.update_activity,
            review_bomb: analysis.review_bomb,
            population_health: analysis.population_health,
            temporal_analysis: analysis.temporal_analysis,
            playtime: analysis.playtime,
            price_advice: analysis.price_advice,
            sale_prediction: analysis.sale_prediction,
            representative_reviews: analysis.representative_reviews
          };
          var harshPrompt = '以下のゲームデータを元に、忖度なしのプロレビュアー視点で詳細な辛口評価を生成してください。\n\n'
            + JSON.stringify(harshData) + '\n\n'
            + 'ルール:\n'
            + '- お世辞・フォロー禁止。欠点・リスクを正直かつ具体的に指摘\n'
            + '- 褒める点も認めるが過大評価しない\n'
            + '- 「このゲームを買って後悔する人」を明確に示す\n'
            + '- 開発者への辛口コメントも含める\n'
            + '- 競合タイトルと比較してコスパを評価する\n\n'
            + '以下のJSON形式のみで回答（コードブロック不要）:\n'
            + '{"score":7,"verdict":"ひと言辛口評価（15字以内）",'
            + '"scores":{"gameplay":7,"content":6,"value":5,"stability":4,"developer":6},'
            + '"critical_flaws":[{"title":"欠点タイトル（15字）","detail":"具体的な問題（40字）","severity":"high/medium/low"}],'
            + '"honest_positives":["実際に良い点1（25字）","実際に良い点2（25字）"],'
            + '"avoid_if":["こういう人は買わない方がいい条件1","条件2","条件3"],'
            + '"dev_comment":"開発者への辛口コメント（60字）",'
            + '"vs_alternatives":"競合タイトルと比べたコスパ評価（60字）",'
            + '"honest_take":"正直な総評（150字以内）",'
            + '"should_buy":"yes/no/sale_only","reason":"その理由（40字以内）"}';
          var result = await _aiJson(harshPrompt, true);
          var score = parseInt(result.score) || 0;
          var scoreColor = score >= 7 ? '#4caf50' : score >= 5 ? '#f6c744' : '#e74c3c';
          var harshDiv = document.createElement('div');
          harshDiv.id = 'ja-harsh-result';
          harshDiv.style.cssText = 'margin:8px 0;padding:12px 14px;border-radius:6px;'
            + 'background:rgba(231,76,60,0.06);border:1px solid #e74c3c;font-family:sans-serif;display:flex;flex-direction:column;gap:8px;';

          // ヘッダー: 総合スコア + verdict
          var htop = document.createElement('div');
          htop.style.cssText = 'display:flex;align-items:center;gap:12px;';
          var hscoreWrap = document.createElement('div');
          hscoreWrap.style.cssText = 'min-width:52px;height:52px;border-radius:50%;border:2px solid ' + scoreColor + ';'
            + 'display:flex;align-items:center;justify-content:center;flex-direction:column;flex-shrink:0;';
          var hscoreNum = document.createElement('div');
          hscoreNum.style.cssText = 'color:' + scoreColor + ';font-size:18px;font-weight:bold;line-height:1;';
          hscoreNum.textContent = score;
          var hscoreLabel = document.createElement('div');
          hscoreLabel.style.cssText = 'color:#8f98a0;font-size:9px;';
          hscoreLabel.textContent = '/10';
          hscoreWrap.appendChild(hscoreNum); hscoreWrap.appendChild(hscoreLabel);
          var hright = document.createElement('div');
          var hverdict = document.createElement('div');
          hverdict.style.cssText = 'color:#e74c3c;font-size:13px;font-weight:bold;margin-bottom:2px;';
          hverdict.textContent = '🌶 ' + (result.verdict || '辛口評価');
          hright.appendChild(hverdict);
          htop.appendChild(hscoreWrap); htop.appendChild(hright);
          harshDiv.appendChild(htop);

          // カテゴリ別スコアバー
          if (result.scores) {
            var catWrap = document.createElement('div');
            catWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
            var catLabels = { gameplay: 'ゲームプレイ', content: 'コンテンツ量', value: 'コスパ', stability: '安定性', developer: '開発姿勢' };
            Object.keys(catLabels).forEach(function(key) {
              var val = parseInt(result.scores[key]) || 0;
              var cColor = val >= 7 ? '#4caf50' : val >= 5 ? '#f6c744' : '#e74c3c';
              var row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:center;gap:6px;';
              var lbl = document.createElement('span');
              lbl.style.cssText = 'width:72px;font-size:10px;color:#8f98a0;flex-shrink:0;';
              lbl.textContent = catLabels[key];
              var barWrap = document.createElement('div');
              barWrap.style.cssText = 'flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;';
              var bar = document.createElement('div');
              bar.style.cssText = 'height:100%;width:' + (val * 10) + '%;background:' + cColor + ';border-radius:3px;';
              barWrap.appendChild(bar);
              var num = document.createElement('span');
              num.style.cssText = 'width:16px;font-size:10px;color:' + cColor + ';text-align:right;flex-shrink:0;';
              num.textContent = val;
              row.appendChild(lbl); row.appendChild(barWrap); row.appendChild(num);
              catWrap.appendChild(row);
            });
            harshDiv.appendChild(catWrap);
          }

          // 致命的欠点
          if (result.critical_flaws && result.critical_flaws.length) {
            var cfWrap = document.createElement('div');
            var cfTitle = document.createElement('div');
            cfTitle.style.cssText = 'color:#e74c3c;font-size:11px;font-weight:bold;margin-bottom:4px;';
            cfTitle.textContent = '⚠ 欠点・問題点';
            cfWrap.appendChild(cfTitle);
            result.critical_flaws.forEach(function(f) {
              var sevColor = { high: '#e74c3c', medium: '#f6c744', low: '#8f98a0' }[f.severity] || '#8f98a0';
              var li = document.createElement('div');
              li.style.cssText = 'margin-bottom:4px;padding:4px 8px;background:rgba(231,76,60,0.06);border-left:3px solid ' + sevColor + ';border-radius:0 3px 3px 0;';
              var ltitle = document.createElement('div');
              ltitle.style.cssText = 'color:' + sevColor + ';font-size:11px;font-weight:bold;';
              ltitle.textContent = f.title || f;
              li.appendChild(ltitle);
              if (f.detail) {
                var ldetail = document.createElement('div');
                ldetail.style.cssText = 'color:#c6d4df;font-size:10px;line-height:1.4;margin-top:1px;';
                ldetail.textContent = f.detail;
                li.appendChild(ldetail);
              }
              cfWrap.appendChild(li);
            });
            harshDiv.appendChild(cfWrap);
          }

          // 本当に良い点
          if (result.honest_positives && result.honest_positives.length) {
            var hpWrap = document.createElement('div');
            var hpTitle = document.createElement('div');
            hpTitle.style.cssText = 'color:#4caf50;font-size:11px;font-weight:bold;margin-bottom:4px;';
            hpTitle.textContent = '✓ 認める良い点';
            hpWrap.appendChild(hpTitle);
            result.honest_positives.forEach(function(p) {
              var li = document.createElement('div');
              li.style.cssText = 'color:#c6d4df;font-size:11px;line-height:1.5;';
              li.textContent = '• ' + p;
              hpWrap.appendChild(li);
            });
            harshDiv.appendChild(hpWrap);
          }

          // こういう人は買わない方がいい
          if (result.avoid_if && result.avoid_if.length) {
            var aiWrap = document.createElement('div');
            var aiTitle = document.createElement('div');
            aiTitle.style.cssText = 'color:#f6c744;font-size:11px;font-weight:bold;margin-bottom:4px;';
            aiTitle.textContent = '🚫 こんな人は買わないで';
            aiWrap.appendChild(aiTitle);
            result.avoid_if.forEach(function(c) {
              var li = document.createElement('div');
              li.style.cssText = 'color:#c6d4df;font-size:11px;line-height:1.5;';
              li.textContent = '• ' + c;
              aiWrap.appendChild(li);
            });
            harshDiv.appendChild(aiWrap);
          }

          // 競合比較
          if (result.vs_alternatives) {
            var vsEl = document.createElement('div');
            vsEl.style.cssText = 'font-size:11px;color:#8f98a0;padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:3px;';
            vsEl.textContent = '⚖ ' + result.vs_alternatives;
            harshDiv.appendChild(vsEl);
          }

          // 開発者コメント
          if (result.dev_comment) {
            var devEl = document.createElement('div');
            devEl.style.cssText = 'font-size:11px;color:#8f98a0;font-style:italic;';
            devEl.textContent = '👨‍💻 開発者へ: ' + result.dev_comment;
            harshDiv.appendChild(devEl);
          }

          // 総評
          if (result.honest_take) {
            var ht = document.createElement('div');
            ht.style.cssText = 'padding:8px 10px;background:rgba(231,76,60,0.08);border-radius:3px;'
              + 'border-left:3px solid #e74c3c;color:#c6d4df;font-size:11px;line-height:1.6;';
            renderLiteMarkdown(ht, result.honest_take);
            harshDiv.appendChild(ht);
          }

          // 最終判定
          if (result.should_buy) {
            var buyLabel = { yes: '✓ 買ってOK', no: '✗ 見送り推奨', sale_only: '△ セール時のみ' }[result.should_buy] || result.should_buy;
            var buyColor = { yes: '#4caf50', no: '#e74c3c', sale_only: '#f6c744' }[result.should_buy] || '#8f98a0';
            var hbuy = document.createElement('div');
            hbuy.style.cssText = 'padding:6px 10px;border-radius:3px;border:1px solid ' + buyColor + ';'
              + 'color:' + buyColor + ';font-size:12px;font-weight:bold;text-align:center;';
            hbuy.textContent = buyLabel + (result.reason ? ' — ' + result.reason : '');
            harshDiv.appendChild(hbuy);
          }

          harshBtn.parentNode.insertBefore(harshDiv, harshBtn.nextSibling);
        } catch(e) { toast('辛口評価生成失敗: ' + e.message, '#e74c3c'); }
        harshBtn.disabled = false; harshBtn.textContent = '🌶 辛口評価を見る';
      });
      body.appendChild(harshBtn);
    })();

    // ── 機能23: 所持ゲームとの照合（similar_games拡張） ──
    var _ownedGamesCache = null;
    function getOwnedGames(cb) {
      if (_ownedGamesCache !== null) { cb(_ownedGamesCache); return; }
      chrome.storage.local.get(['ja_trans_owned_games_v1'], function(r) {
        _ownedGamesCache = r['ja_trans_owned_games_v1'] || [];
        cb(_ownedGamesCache);
      });
    }

    // ── 機能15: レビュークラスター ──
    if (analysis.review_clusters && analysis.review_clusters.length) {
      try {
        var rcWrap = document.createElement('div');
        rcWrap.style.cssText = 'margin-bottom:12px;';
        var rcTitle = document.createElement('div');
        rcTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;';
        rcTitle.textContent = '📦 レビュークラスター';
        rcWrap.appendChild(rcTitle);
        var rcList = document.createElement('div');
        rcList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        var CLUSTER_COLORS = {
          positive: { bg:'rgba(76,175,80,0.12)', border:'#4caf50', text:'#4caf50' },
          negative: { bg:'rgba(231,76,60,0.12)',  border:'#e74c3c', text:'#e74c3c' },
          mixed:    { bg:'rgba(246,199,68,0.10)', border:'#f6c744', text:'#f6c744' }
        };
        analysis.review_clusters.forEach(function(cl) {
          if (!cl.theme) return;
          var col = CLUSTER_COLORS[cl.sentiment] || CLUSTER_COLORS.mixed;
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-radius:4px;'
            + 'background:' + col.bg + ';border:1px solid ' + col.border + ';';
          var pill = document.createElement('span');
          pill.style.cssText = 'flex-shrink:0;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:bold;'
            + 'background:' + col.bg + ';border:1px solid ' + col.border + ';color:' + col.text + ';';
          pill.textContent = cl.sentiment === 'positive' ? '✓' : cl.sentiment === 'negative' ? '✗' : '±';
          var info = document.createElement('div');
          info.style.cssText = 'flex:1;';
          var themeEl = document.createElement('div');
          themeEl.style.cssText = 'color:' + col.text + ';font-size:12px;font-weight:bold;margin-bottom:2px;';
          themeEl.textContent = cl.theme + (cl.count ? ' (' + cl.count + '件)' : '');
          var sumEl = document.createElement('div');
          sumEl.style.cssText = 'color:#8f98a0;font-size:11px;line-height:1.4;';
          sumEl.textContent = cl.summary || '';
          info.appendChild(themeEl); info.appendChild(sumEl);
          if (cl.quote) {
            var quoteEl = document.createElement('div');
            quoteEl.style.cssText = 'color:#5a8a65;font-size:10px;line-height:1.4;margin-top:3px;font-style:italic;';
            quoteEl.textContent = '"' + cl.quote + '"';
            info.appendChild(quoteEl);
          }
          row.appendChild(pill); row.appendChild(info);
          rcList.appendChild(row);
        });
        rcWrap.appendChild(rcList);
        body.appendChild(rcWrap);
      } catch(e) {}
    }

    // ── 機能24: サウンド専門分析 ──
    if (analysis.sound_analysis && analysis.sound_analysis.label && analysis.sound_analysis.label !== '言及なし') {
      try {
        var sa = analysis.sound_analysis;
        var saScore = sa.score || 0;
        var saColor = saScore >= 80 ? '#4caf50' : saScore >= 60 ? '#66c0f4' : saScore >= 40 ? '#f6c744' : '#e74c3c';
        var saWrap = document.createElement('div');
        saWrap.style.cssText = 'margin-bottom:10px;padding:8px 12px;border-radius:4px;'
          + 'background:rgba(0,0,0,0.2);border:1px solid ' + saColor + ';'
          + 'color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
        var saIcon = document.createElement('span');
        saIcon.textContent = '🎵';
        var saText = document.createElement('span');
        saText.style.cssText = 'flex:1;';
        saText.textContent = 'サウンド: ' + sa.label + ' (' + saScore + '/100)';
        if (sa.detail) saText.textContent += ' — ' + sa.detail;
        saWrap.appendChild(saIcon); saWrap.appendChild(saText);
        if (sa.ost_notable) {
          var ostBadge = document.createElement('span');
          ostBadge.style.cssText = 'padding:1px 7px;border-radius:10px;font-size:10px;font-weight:bold;'
            + 'background:rgba(246,199,68,0.15);border:1px solid #f6c744;color:#f6c744;flex-shrink:0;';
          ostBadge.textContent = '🏆 OSTが高評価';
          saWrap.appendChild(ostBadge);
        }
        body.appendChild(saWrap);
      } catch(e) {}
    }

    // ── 機能25: 飽きやすさスコア ──
    if (analysis.replay_value && analysis.replay_value.label) {
      try {
        var rv = analysis.replay_value;
        var rvScore = rv.score || 0;
        var rvColor = rvScore >= 80 ? '#4caf50' : rvScore >= 60 ? '#66c0f4' : rvScore >= 40 ? '#f6c744' : '#e74c3c';
        var rvWrap = document.createElement('div');
        rvWrap.style.cssText = 'margin-bottom:10px;padding:8px 12px;border-radius:4px;'
          + 'background:rgba(0,0,0,0.2);border:1px solid ' + rvColor + ';'
          + 'color:#c6d4df;font-size:11px;display:flex;gap:8px;align-items:center;';
        var rvIcon = document.createElement('span');
        rvIcon.textContent = '🔁';
        var rvText = document.createElement('span');
        rvText.style.cssText = 'flex:1;';
        rvText.textContent = '繰り返しプレイ価値: ' + rv.label + ' (' + rvScore + '/100)';
        if (rv.loop_quality) rvText.textContent += ' — ' + rv.loop_quality;
        rvWrap.appendChild(rvIcon); rvWrap.appendChild(rvText);
        body.appendChild(rvWrap);
      } catch(e) {}
    }

    // ── 機能20: DLC一覧と評価 ──
    (function() {
      try {
        var dlcAppId = getGameId();
        if (!dlcAppId) return;
        var dlcBtn = document.createElement('button');
        dlcBtn.id = 'ja-dlc-btn';
        dlcBtn.textContent = '🎁 DLCを確認';
        dlcBtn.style.cssText = 'display:block;width:100%;margin:8px 0 4px;padding:8px 14px;'
          + 'background:#1b2838;color:#c6a84a;border:1px solid #c6a84a;border-radius:4px;'
          + 'cursor:pointer;font-size:12px;font-family:sans-serif;text-align:center;';
        var dlcResult = document.createElement('div');
        dlcResult.id = 'ja-dlc-result';
        dlcResult.style.cssText = 'display:none;margin:4px 0 8px;';

        dlcBtn.addEventListener('click', async function() {
          if (dlcResult.style.display !== 'none') {
            dlcResult.style.display = 'none';
            dlcBtn.textContent = '🎁 DLCを確認';
            return;
          }
          dlcBtn.disabled = true;
          dlcBtn.textContent = '⏳ 読み込み中...';
          try {
            // 分析済みデータを優先、なければAPI再取得
            var dlcIds = (_extraMeta && _extraMeta.basicData && Array.isArray(_extraMeta.basicData.dlc))
              ? _extraMeta.basicData.dlc
              : [];
            if (!dlcIds.length) {
              var dlcRes = await fetch('https://store.steampowered.com/api/appdetails?appids=' + dlcAppId + '&filters=dlc', { signal: _timeoutSignal(8000) });
              var dlcData = dlcRes.ok ? await dlcRes.json() : null;
              dlcIds = (dlcData && dlcData[dlcAppId] && dlcData[dlcAppId].data && dlcData[dlcAppId].data.dlc) || [];
            }
            if (!dlcIds.length) {
              dlcResult.style.display = 'block';
              var noDlcWrap = document.createElement('div');
              noDlcWrap.style.cssText = 'color:#8f98a0;font-size:11px;padding:6px 10px;display:flex;flex-direction:column;gap:4px;';
              var noDlcText = document.createElement('span');
              noDlcText.textContent = 'Steam APIではDLC未登録（削除済みDLCがある場合あり）';
              var noDlcLink = document.createElement('a');
              noDlcLink.href = 'https://store.steampowered.com/dlc/' + dlcAppId + '/';
              noDlcLink.target = '_blank';
              noDlcLink.rel = 'noopener';
              noDlcLink.style.cssText = 'color:#c6a84a;';
              noDlcLink.textContent = '🔗 Steamストアでスタンドアロン DLC を確認';
              noDlcWrap.appendChild(noDlcText);
              noDlcWrap.appendChild(noDlcLink);
              dlcResult.appendChild(noDlcWrap);
              dlcBtn.textContent = '🎁 DLCを確認';
              dlcBtn.disabled = false;
              return;
            }

            // 最大5件のDLCを並列取得
            var targetIds = dlcIds.slice(0, 5);
            var dlcItems = await Promise.all(targetIds.map(async function(id) {
              try {
                var detRes = await fetch('https://store.steampowered.com/api/appdetails?appids=' + id + '&filters=basic,price_overview&cc=jp', { signal: _timeoutSignal(6000) });
                var revRes = await fetch('https://store.steampowered.com/appreviews/' + id + '?json=1&num_per_page=0', { signal: _timeoutSignal(6000) });
                var detData = detRes.ok ? await detRes.json() : null;
                var revData = revRes.ok ? await revRes.json() : null;
                var info = detData && detData[id] && detData[id].data;
                var name = info ? info.name : 'DLC #' + id;
                var price = null;
                if (info && info.price_overview) {
                  price = '¥' + Math.floor(info.price_overview.final / 100).toLocaleString();
                } else if (info && info.is_free) {
                  price = '無料';
                }
                var reviewScore = null;
                if (revData && revData.query_summary) {
                  reviewScore = revData.query_summary.review_score_desc || null;
                }
                return { id: id, name: name, price: price, reviewScore: reviewScore };
              } catch(e) { return { id: id, name: 'DLC #' + id, price: null, reviewScore: null }; }
            }));

            dlcResult.textContent = '';
            dlcResult.style.display = 'block';
            var dlcWrap = document.createElement('div');
            dlcWrap.style.cssText = 'padding:10px 12px;background:rgba(198,168,74,0.06);border:1px solid rgba(198,168,74,0.3);border-radius:4px;font-size:11px;font-family:sans-serif;';
            var dlcHeader = document.createElement('div');
            dlcHeader.style.cssText = 'color:#c6a84a;font-size:11px;font-weight:bold;margin-bottom:7px;';
            dlcHeader.textContent = '🎁 DLC情報 (' + dlcIds.length + '件中' + targetIds.length + '件表示)';
            dlcWrap.appendChild(dlcHeader);
            dlcItems.forEach(function(item) {
              var row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(198,168,74,0.15);flex-wrap:wrap;';
              var nameEl20 = document.createElement('span');
              nameEl20.style.cssText = 'flex:1;color:#c6d4df;font-size:11px;min-width:120px;';
              nameEl20.textContent = item.name;
              row.appendChild(nameEl20);
              if (item.price) {
                var priceEl20 = document.createElement('span');
                priceEl20.style.cssText = 'color:#c6a84a;font-size:11px;white-space:nowrap;';
                priceEl20.textContent = item.price;
                row.appendChild(priceEl20);
              }
              if (item.reviewScore) {
                var scoreMap20 = {
                  'Overwhelmingly Positive':'圧倒的好評','Very Positive':'非常に好評',
                  'Positive':'好評','Mostly Positive':'概ね好評','Mixed':'賛否両論',
                  'Mostly Negative':'概ね不評','Negative':'不評','Very Negative':'非常に不評',
                  'Overwhelmingly Negative':'圧倒的不評'
                };
                var scoreJa20 = scoreMap20[item.reviewScore] || item.reviewScore;
                var scoreBadge = document.createElement('span');
                scoreBadge.style.cssText = 'font-size:10px;padding:1px 6px;border-radius:8px;'
                  + 'background:rgba(102,192,244,0.1);color:#74c0fc;border:1px solid rgba(102,192,244,0.3);white-space:nowrap;';
                scoreBadge.textContent = scoreJa20;
                row.appendChild(scoreBadge);
              }
              dlcWrap.appendChild(row);
            });
            dlcResult.appendChild(dlcWrap);
          } catch(e) {
            dlcResult.style.display = 'block';
            var errEl = document.createElement('div');
            errEl.style.cssText = 'color:#8f98a0;font-size:11px;padding:6px;';
            errEl.textContent = 'DLC情報を取得できませんでした';
            dlcResult.appendChild(errEl);
          }
          dlcBtn.textContent = '🎁 DLC（閉じる）';
          dlcBtn.disabled = false;
        });
        body.appendChild(dlcBtn);
        body.appendChild(dlcResult);
      } catch(e) {}
    })();

    // ── 機能21: 更新履歴AIサマリー ──
    (function() {
      try {
        if (!_geminiKeyCache) return;
        var updAppId = getGameId();
        if (!updAppId) return;
        var titleElUpd = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
        var gameTitleUpd = titleElUpd ? titleElUpd.textContent.trim() : '';
        var UPD_CACHE_KEY = 'ja_trans_update_summary_v1_' + updAppId;
        var UPD_CACHE_TTL = 3 * 86400000; // 3日

        var updBtn = document.createElement('button');
        updBtn.id = 'ja-update-summary-btn';
        updBtn.textContent = '📋 更新履歴をまとめる';
        updBtn.style.cssText = 'display:block;width:100%;margin:8px 0 4px;padding:8px 14px;'
          + 'background:#1b2838;color:#8fcfa0;border:1px solid #4caf50;border-radius:4px;'
          + 'cursor:pointer;font-size:12px;font-family:sans-serif;text-align:center;';
        var updResult = document.createElement('div');
        updResult.id = 'ja-update-summary-result';
        updResult.style.cssText = 'display:none;margin:4px 0 8px;';

        function renderUpdateSummary(data) {
          updResult.textContent = '';
          updResult.style.display = 'block';
          var wrap = document.createElement('div');
          wrap.style.cssText = 'padding:10px 12px;background:rgba(76,175,80,0.06);border:1px solid rgba(76,175,80,0.3);border-radius:4px;font-size:11px;font-family:sans-serif;';
          var header = document.createElement('div');
          header.style.cssText = 'color:#4caf50;font-size:11px;font-weight:bold;margin-bottom:6px;';
          header.textContent = '📋 更新履歴まとめ' + (data.period ? ' — ' + data.period : '');
          wrap.appendChild(header);
          var cats = [
            { key: 'added',    icon: '✨', label: '追加', color: '#4caf50' },
            { key: 'fixed',    icon: '🐛', label: '修正', color: '#66c0f4' },
            { key: 'balanced', icon: '⚖',  label: '調整', color: '#f6c744' },
          ];
          cats.forEach(function(cat) {
            var items = data[cat.key];
            if (!items || !items.length) return;
            var sec = document.createElement('div');
            sec.style.cssText = 'margin-bottom:6px;';
            var secTitle = document.createElement('div');
            secTitle.style.cssText = 'color:' + cat.color + ';font-size:10px;font-weight:bold;margin-bottom:3px;';
            secTitle.textContent = cat.icon + ' ' + cat.label;
            sec.appendChild(secTitle);
            items.forEach(function(item) {
              var li = document.createElement('div');
              li.style.cssText = 'color:#c6d4df;font-size:11px;line-height:1.5;padding-left:8px;';
              li.textContent = '• ' + item;
              sec.appendChild(li);
            });
            wrap.appendChild(sec);
          });
          updResult.appendChild(wrap);
        }

        updBtn.addEventListener('click', async function() {
          if (updResult.style.display !== 'none') {
            updResult.style.display = 'none';
            updBtn.textContent = '📋 更新履歴をまとめる';
            return;
          }

          // キャッシュチェック
          var cachedUpd = await new Promise(function(res) {
            chrome.storage.local.get([UPD_CACHE_KEY], function(r) { res(r[UPD_CACHE_KEY] || null); });
          });
          if (cachedUpd && cachedUpd.data && Date.now() - cachedUpd.ts < UPD_CACHE_TTL) {
            renderUpdateSummary(cachedUpd.data);
            updBtn.textContent = '📋 更新履歴（閉じる）';
            return;
          }

          updBtn.disabled = true;
          updBtn.textContent = '⏳ 取得中...';
          try {
            var newsRes = await fetch(
              'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=' + updAppId + '&count=20&maxlength=500&format=json',
              { signal: _timeoutSignal(8000) }
            );
            if (!newsRes.ok) throw new Error('news fetch failed');
            var newsData = await newsRes.json();
            var newsItems = newsData && newsData.appnews && newsData.appnews.newsitems;
            if (!newsItems || !newsItems.length) {
              updResult.style.display = 'block';
              var noNews = document.createElement('div');
              noNews.style.cssText = 'color:#8f98a0;font-size:11px;padding:6px;';
              noNews.textContent = '更新情報なし';
              updResult.appendChild(noNews);
              updBtn.textContent = '📋 更新履歴（閉じる）';
              updBtn.disabled = false;
              return;
            }

            var newsText = newsItems.map(function(item) {
              var d = item.date ? new Date(item.date * 1000).toISOString().slice(0, 10) : '';
              return '[' + d + '] ' + (item.title || '') + '\n' + (item.contents || '').replace(/<[^>]+>/g, '').slice(0, 200);
            }).join('\n\n---\n\n');

            var updPrompt = 'ゲーム「' + gameTitleUpd + '」の最近のアップデート・ニュース（以下）を日本語で箇条書きにまとめてください。\n'
              + '追加機能・バグ修正・バランス調整の3カテゴリに分類し、JSON形式で返してください:\n'
              + '{ "added": ["追加1","追加2"], "fixed": ["修正1","修正2"], "balanced": ["調整1"], "period": "対象期間（例: 2024年10月〜2025年3月）" }\n\n'
              + newsText.slice(0, 8000);
            var summary = await _aiJson(updPrompt);
            var cObj = {}; cObj[UPD_CACHE_KEY] = { data: summary, ts: Date.now() };
            chrome.storage.local.set(cObj);
            renderUpdateSummary(summary);
          } catch(e) {
            updResult.style.display = 'block';
            var errEl2 = document.createElement('div');
            errEl2.style.cssText = 'color:#8f98a0;font-size:11px;padding:6px;';
            errEl2.textContent = '更新履歴の取得に失敗しました: ' + e.message;
            updResult.appendChild(errEl2);
          }
          updBtn.textContent = '📋 更新履歴（閉じる）';
          updBtn.disabled = false;
        });
        body.appendChild(updBtn);
        body.appendChild(updResult);
      } catch(e) {}
    })();

    // ── 機能22: ジャンル入門ガイドボタン ──
    (function() {
      try {
        var titleElG = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
        var gameTitle22 = titleElG ? titleElG.textContent.trim() : '';
        var gameTags22 = getGameTags();
        if (!gameTitle22) return;
        var appId22 = getGameId();
        var GUIDE_CACHE_KEY = appId22 ? 'ja_trans_genre_guide_v1_' + appId22 : null;
        var guideBtn = document.createElement('button');
        guideBtn.id = 'ja-genre-guide-btn';
        guideBtn.textContent = '🎓 このジャンルの入門ガイドを生成';
        guideBtn.style.cssText = 'display:block;width:100%;margin:8px 0;padding:8px 14px;'
          + 'background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;border-radius:4px;'
          + 'cursor:pointer;font-size:12px;font-family:sans-serif;text-align:center;';
        var guideResult = document.createElement('div');
        guideResult.id = 'ja-genre-guide-result';
        guideResult.style.cssText = 'display:none;margin:8px 0;';

        function renderGuide(g) {
          guideResult.textContent = '';
          guideResult.style.display = 'block';
          var gWrap = document.createElement('div');
          gWrap.style.cssText = 'padding:12px 14px;background:rgba(102,192,244,0.06);border:1px solid #2a475e;border-radius:6px;font-size:12px;color:#c6d4df;font-family:sans-serif;';
          var gHeader = document.createElement('div');
          gHeader.style.cssText = 'color:#66c0f4;font-size:13px;font-weight:bold;margin-bottom:8px;';
          gHeader.textContent = '🎓 ' + (g.genre_name || 'ジャンル入門ガイド');
          gWrap.appendChild(gHeader);
          var makeSection = function(title, items, color) {
            if (!items || !items.length) return;
            var sec = document.createElement('div');
            sec.style.cssText = 'margin-bottom:8px;';
            var t = document.createElement('div');
            t.style.cssText = 'color:' + color + ';font-size:11px;font-weight:bold;margin-bottom:4px;';
            t.textContent = title;
            sec.appendChild(t);
            items.forEach(function(item) {
              var li = document.createElement('div');
              li.style.cssText = 'color:#c6d4df;font-size:11px;line-height:1.5;';
              li.textContent = '• ' + item;
              sec.appendChild(li);
            });
            gWrap.appendChild(sec);
          };
          makeSection('📌 基本', g.basics, '#8fcfa0');
          makeSection('💡 コツ', g.tips, '#66c0f4');
          makeSection('⚠ よくある失敗', g.common_mistakes, '#f6c744');
          if (g.time_to_get_good) {
            var ttg = document.createElement('div');
            ttg.style.cssText = 'color:#8f98a0;font-size:11px;margin-top:4px;';
            ttg.textContent = '⏱ 上達の目安: ' + g.time_to_get_good;
            gWrap.appendChild(ttg);
          }
          var collapseBtn = document.createElement('button');
          collapseBtn.style.cssText = 'display:block;margin-top:8px;padding:3px 10px;background:transparent;color:#4a5a6a;border:1px solid #2a475e;border-radius:3px;cursor:pointer;font-size:10px;font-family:sans-serif;';
          collapseBtn.textContent = '▲ 折りたたむ';
          var isOpen = true;
          collapseBtn.addEventListener('click', function() {
            isOpen = !isOpen;
            gWrap.style.display = isOpen ? '' : 'none';
            guideResult.style.display = 'block';
            collapseBtn.style.display = isOpen ? 'none' : 'block';
            collapseBtn.textContent = isOpen ? '▲ 折りたたむ' : '▼ ガイドを表示';
            if (isOpen) gWrap.parentNode.insertBefore(gWrap, collapseBtn);
          });
          guideResult.appendChild(gWrap);
          guideResult.appendChild(collapseBtn);
        }

        guideBtn.addEventListener('click', async function() {
          if (guideResult.style.display !== 'none') {
            guideResult.style.display = 'none';
            guideResult.textContent = '';
            guideBtn.textContent = '🎓 このジャンルの入門ガイドを生成';
            return;
          }
          if (!_geminiKeyCache && !_1minKeyCache) { toast('入門ガイドの生成にはAPIキーが必要です', '#f6c744'); return; }
          // キャッシュチェック（7日間）
          if (GUIDE_CACHE_KEY) {
            var cached22 = await new Promise(function(res) {
              chrome.storage.local.get([GUIDE_CACHE_KEY], function(r) { res(r[GUIDE_CACHE_KEY] || null); });
            });
            if (cached22 && cached22.data && Date.now() - cached22.ts < 7 * 86400000) {
              renderGuide(cached22.data); return;
            }
          }
          guideBtn.disabled = true; guideBtn.textContent = '⏳ 生成中...';
          try {
            var guidePrompt = 'ゲーム「' + gameTitle22 + '」(タグ: ' + gameTags22.slice(0,10).join(', ') + ') を初めてプレイする人向けの入門ガイドを日本語で生成してください。\nJSON形式のみ: { "genre_name": "ジャンル名", "basics": ["基本的なこと1", "2", "3"], "tips": ["コツ1", "2", "3"], "common_mistakes": ["よくある失敗1", "2"], "time_to_get_good": "上達までの目安時間" }';
            var guide = await _aiJson(guidePrompt, true);
            if (GUIDE_CACHE_KEY) {
              var cObj = {}; cObj[GUIDE_CACHE_KEY] = { data: guide, ts: Date.now() };
              chrome.storage.local.set(cObj);
            }
            renderGuide(guide);
          } catch(e) { toast('入門ガイド生成失敗: ' + e.message, '#e74c3c'); }
          guideBtn.disabled = false; guideBtn.textContent = '🎓 このジャンルの入門ガイドを生成';
        });
        body.appendChild(guideBtn);
        body.appendChild(guideResult);
      } catch(e) {}
    })();

    // ── QAチャット ──
    var qaSection = document.createElement('div');
    qaSection.style.cssText = 'border-top:1px solid #1e3828;padding:10px 16px;';

    var qaTitleRow = document.createElement('div');
    qaTitleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
    var qaTitle = document.createElement('div');
    qaTitle.style.cssText = 'color:#8fcfa0;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;';
    qaTitle.textContent = '💬 このゲームについて質問';
    qaTitleRow.appendChild(qaTitle);
    var qaExportBtn = document.createElement('button');
    qaExportBtn.textContent = '📋 会話をコピー';
    qaExportBtn.title = 'チャット履歴をMarkdown形式でコピー';
    qaExportBtn.style.cssText = 'padding:2px 8px;background:transparent;color:#5a8a65;border:1px solid #2d5a3d;'
      + 'border-radius:3px;cursor:pointer;font-size:10px;font-family:sans-serif;';
    qaExportBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!_qaConversation.length) { toast('まだ会話がありません', '#f6c744'); return; }
      var lines = ['## 💬 AIチャット履歴', ''];
      _qaConversation.forEach(function (turn) {
        lines.push('**' + (turn.role === 'user' ? 'Q' : 'A') + ':** ' + turn.text);
        lines.push('');
      });
      copyToClipboard(lines.join('\n'));
      qaExportBtn.textContent = '✓ コピー済';
      setTimeout(function () { qaExportBtn.textContent = '📋 会話をコピー'; }, 2000);
    });
    qaTitleRow.appendChild(qaExportBtn);
    qaSection.appendChild(qaTitleRow);

    var qaHistory = document.createElement('div');
    qaHistory.style.cssText = 'max-height:240px;overflow-y:auto;margin-bottom:8px;display:flex;flex-direction:column;gap:6px;';
    qaSection.appendChild(qaHistory);

    // ── 機能7: QAサジェストボタン ──
    var qaSuggestRow = document.createElement('div');
    qaSuggestRow.style.cssText = 'display:flex;gap:5px;overflow-x:auto;margin-bottom:7px;padding-bottom:3px;'
      + 'scrollbar-width:thin;scrollbar-color:#2d5a3d #0f1923;';
    var QA_PRESETS = (function() {
      var base = ['日本語対応？', 'バグ多い？', 'クリアまで何時間？', 'セール頻度は？'];
      var tagMap = {
        'Multiplayer': '対人プレイヤーまだいる？', 'PvP': '対人はまだ人いる？',
        'Co-op': '協力プレイ楽しい？', 'Online Co-Op': '協力プレイ楽しい？',
        'Horror': 'どのくらい怖い？', 'Survival Horror': 'どのくらい怖い？',
        'RPG': 'ストーリーは面白い？', 'JRPG': 'ストーリーは面白い？',
        'Strategy': '難易度は適切？', 'Turn-Based Strategy': '難易度は適切？',
        'Open World': '世界の作り込みは？', 'Exploration': '探索は楽しい？',
        'Early Access': '正式リリースはいつ頃？',
        'Roguelite': '繰り返し遊べる？', 'Roguelike': '繰り返し遊べる？',
        'Simulation': '操作難易度は？', 'Management': '覚えることが多い？',
        'Visual Novel': 'テキスト量はどのくらい？', 'Anime': 'テキスト量はどのくらい？',
        'Souls-like': '初心者でも楽しめる？', 'Difficult': '難易度は高すぎない？',
        'Puzzle': 'ヒントは充実してる？',
        'FPS': 'チーターいる？', 'Shooter': 'チーターいる？',
        'Racing': 'コントローラー必須？', 'Sports': 'コントローラー必須？',
      };
      var tags = getGameTags ? getGameTags() : [];
      tags.forEach(function(t) {
        if (tagMap[t] && base.indexOf(tagMap[t]) < 0 && base.length < 7) base.splice(1, 0, tagMap[t]);
      });
      if (base.length < 6) base.push('DLC必要？');
      return base;
    })();
    QA_PRESETS.forEach(function(preset) {
      var sb = document.createElement('button');
      sb.textContent = preset;
      sb.style.cssText = 'flex-shrink:0;font-size:10px;padding:3px 8px;background:#0d1a10;color:#8fcfa0;'
        + 'border:1px solid #2d5a3d;border-radius:10px;cursor:pointer;font-family:sans-serif;white-space:nowrap;';
      sb.addEventListener('mouseenter', function() { sb.style.borderColor = '#4caf50'; sb.style.color = '#4caf50'; });
      sb.addEventListener('mouseleave', function() { sb.style.borderColor = '#2d5a3d'; sb.style.color = '#8fcfa0'; });
      sb.addEventListener('click', function() {
        qaInput.value = preset;
        submitQa();
      });
      qaSuggestRow.appendChild(sb);
    });
    qaSection.appendChild(qaSuggestRow);

    var qaRow = document.createElement('div');
    qaRow.style.cssText = 'display:flex;gap:6px;';
    var qaInput = document.createElement('input');
    qaInput.type = 'text';
    qaInput.placeholder = '例: ソロプレイは楽しめる？日本語対応してる？';
    qaInput.style.cssText = 'flex:1;background:#0f1923;border:1px solid #2d5a3d;border-radius:3px;'
      + 'color:#c6d4df;padding:5px 8px;font-size:12px;font-family:sans-serif;outline:none;';
    qaInput.addEventListener('focus', function () { qaInput.style.borderColor = '#4caf50'; });
    qaInput.addEventListener('blur', function () { qaInput.style.borderColor = '#2d5a3d'; });
    var qaBtn = document.createElement('button');
    qaBtn.textContent = '聞く';
    qaBtn.style.cssText = 'padding:5px 12px;background:#0d1a10;color:#4caf50;border:1px solid #4caf50;'
      + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;white-space:nowrap;';
    qaRow.appendChild(qaInput); qaRow.appendChild(qaBtn);
    qaSection.appendChild(qaRow);

    var _qaConversation = []; // {role, text}

    function addQaBubble(text, isUser) {
      var bubble = document.createElement('div');
      bubble.style.cssText = 'padding:7px 10px;border-radius:4px;font-size:12px;line-height:1.5;font-family:sans-serif;max-width:92%;'
        + (isUser
          ? 'align-self:flex-end;background:rgba(76,175,80,0.12);color:#c6d4df;border:1px solid rgba(76,175,80,0.3);'
          : 'align-self:flex-start;background:#162520;color:#c6d4df;border:1px solid #1e3828;');
      bubble.textContent = text;
      qaHistory.appendChild(bubble);
      qaHistory.scrollTop = qaHistory.scrollHeight;
      return bubble;
    }

    async function submitQa() {
      var q = qaInput.value.trim();
      if (!q || qaBtn.disabled) return;
      qaInput.value = '';
      qaBtn.disabled = true;
      qaBtn.textContent = '…';

      addQaBubble(q, true);
      _qaConversation.push({ role: 'user', text: q });

      var loadingBubble = addQaBubble('考え中...', false);
      loadingBubble.style.color = '#5a8a65';

      try {
        var apiKey = await new Promise(function (resolve) {
          chrome.storage.local.get([GEMINI_KEY_STORAGE, ONE_MIN_KEY_STORAGE], function (r) {
            _1minKeyCache = r[ONE_MIN_KEY_STORAGE] || _1minKeyCache;
            resolve(r[GEMINI_KEY_STORAGE] || r[ONE_MIN_KEY_STORAGE] || null);
          });
        });
        if (!apiKey) {
          qaBtn.disabled = false;
          qaBtn.textContent = '聞く';
          loadingBubble.textContent = 'APIキー未設定。設定から登録してください。';
          loadingBubble.style.color = '#e74c3c';
          return;
        }

        var reviewContext = _lastReviewTexts.slice(0, 20).join('\n---\n').slice(0, 5000);
        // ゲーム説明文とタグも追加コンテキストとして渡す
        var titleElQa = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
        var gameTitleQa = titleElQa ? titleElQa.textContent.trim() : '';
        var descEl = document.querySelector('#game_area_description,.game_description_snippet,[class*="gameDescription"]');
        var descText = descEl ? descEl.innerText.trim().slice(0, 800) : '';
        var tags = getGameTags();
        var pageContext = '';
        if (gameTitleQa) pageContext += 'ゲームタイトル: ' + gameTitleQa + '\n';
        if (tags.length) pageContext += 'Steamタグ: ' + tags.join(', ') + '\n';
        if (descText) pageContext += 'ゲーム説明: ' + descText + '\n';
        // AI分析結果をコンテキストに追加
        var analysisContext = '';
        if (analysis) {
          if (analysis.playtime) analysisContext += 'プレイ時間目安: ' + analysis.playtime + '\n';
          if (analysis.playtime_analysis) {
            var pa = analysis.playtime_analysis;
            if (pa.insight) analysisContext += 'プレイ時間分析: ' + pa.insight + '\n';
          }
          if (analysis.achievement_analysis && analysis.achievement_analysis.completion_est_pct != null) {
            analysisContext += 'クリア率推定: ' + analysis.achievement_analysis.completion_est_pct + '% (' + (analysis.achievement_analysis.difficulty || '') + ')\n';
          }
          if (analysis.dlc_dependency) analysisContext += 'DLC依存度: ' + analysis.dlc_dependency.label + '（' + (analysis.dlc_dependency.detail || '') + '）\n';
          if (analysis.summary) analysisContext += 'AI総評: ' + analysis.summary + '\n';
          if (analysis.pros && analysis.pros.length) analysisContext += '良い点: ' + analysis.pros.join('、') + '\n';
          if (analysis.cons && analysis.cons.length) analysisContext += '悪い点: ' + analysis.cons.join('、') + '\n';
          if (analysis.recommendation) analysisContext += '推奨判定: ' + analysis.recommendation.verdict + '（' + (analysis.recommendation.reason || '') + '）\n';
          if (analysis.audience) {
            if (analysis.audience.for && analysis.audience.for.length) analysisContext += '向いてる人: ' + analysis.audience.for.join('、') + '\n';
            if (analysis.audience.against && analysis.audience.against.length) analysisContext += '向いてない人: ' + analysis.audience.against.join('、') + '\n';
          }
          if (analysis.sale_prediction && analysis.sale_prediction.candidates && analysis.sale_prediction.candidates.length) {
            analysisContext += 'セール予測: ' + analysis.sale_prediction.candidates.map(function(c){ return c.date + '(' + c.name + ')'; }).join('、') + '\n';
          }
          if (analysis.update_activity) analysisContext += '開発活動: ' + analysis.update_activity.score + '（' + (analysis.update_activity.insight || '') + '）\n';
          if (analysis.bug_score) analysisContext += 'バグ状況: ' + analysis.bug_score.severity + '（' + (analysis.bug_score.detail || '') + '）\n';
          if (analysis.story_vs_gameplay) analysisContext += 'ストーリー/ゲームプレイ比重: ' + analysis.story_vs_gameplay.balance + '\n';
          if (_extraMeta && _extraMeta.basicData && _extraMeta.basicData.dlc) analysisContext += 'Steam DLC数: ' + _extraMeta.basicData.dlc.length + '個\n';
        }
        pageContext += analysisContext;

        var newsContext = '';
        if (_lastNewsItems && _lastNewsItems.length) {
          newsContext = '最近のアップデート/ニュース（開発者投稿）:\n';
          _lastNewsItems.forEach(function(item) {
            var d = item.date ? new Date(item.date * 1000).toISOString().slice(0, 10) : '';
            var body = (item.contents || item.feedlabel || '').replace(/<[^>]+>/g, '').slice(0, 300);
            newsContext += '[' + d + '] ' + (item.title || '') + '\n' + body + '\n';
          });
          newsContext += '\n';
        }

        // ── 機能8: コミュニティアナウンス（forum feed）をQAコンテキストに追加 ──
        var forumContext = '';
        if (_lastForumPosts && _lastForumPosts.length) {
          forumContext = 'コミュニティアナウンス:\n';
          _lastForumPosts.forEach(function(item) {
            var d = item.date ? new Date(item.date * 1000).toISOString().slice(0, 10) : '';
            var body = (item.contents || '').replace(/<[^>]+>/g, '').slice(0, 200);
            forumContext += '[' + d + '] ' + (item.title || '') + '\n' + body + '\n';
          });
          forumContext += '\n';
        }

        var history = _qaConversation.slice(-6).map(function (m) {
          return (m.role === 'user' ? 'Q: ' : 'A: ') + m.text;
        }).join('\n');
        var prompt = '以下の情報をもとに質問に日本語で簡潔に答えてください。情報にない場合はその旨を伝えてください。'
          + '見出し(#)や箇条書き(-)、コードブロック(```)は使わず、普通の文章で回答してください。強調したい箇所のみ**太字**を使って構いません。\n\n'
          + (pageContext ? pageContext + '\n' : '')
          + (newsContext ? newsContext : '')
          + (forumContext ? forumContext : '')
          + 'ユーザーレビュー:\n' + reviewContext + '\n\n'
          + (history ? '会話履歴:\n' + history + '\n\n' : '')
          + '質問: ' + (gameTitleQa ? '「' + gameTitleQa + '」について、' : '') + q;

        var answer = await _aiText(prompt, true);
        renderLiteMarkdown(loadingBubble, answer || '回答を取得できませんでした');
        loadingBubble.style.color = '';
        if (_lastSearchSources && _lastSearchSources.length) {
          var srcEl = document.createElement('div');
          srcEl.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(76,175,80,0.2);font-size:10px;color:#5a8a65;';
          srcEl.textContent = '🔍 Web検索: ' + _lastSearchSources.length + '件参照 ('
            + _lastSearchSources.map(function (u) { try { return new URL(u).hostname; } catch (e2) { return u; } }).join(', ') + ')';
          loadingBubble.appendChild(srcEl);
        }
        _qaConversation.push({ role: 'assistant', text: answer });
      } catch (e) {
        loadingBubble.textContent = '失敗: ' + e.message;
        loadingBubble.style.color = '#e74c3c';
      }
      qaBtn.disabled = false;
      qaBtn.textContent = '聞く';
    }

    qaBtn.addEventListener('click', submitQa);
    qaInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitQa(); });

    div.appendChild(hdr);
    div.appendChild(body);
    div.appendChild(qaSection);

    // 機能3: ゲーム固有用語ホバー解説
    if (analysis.topics && analysis.topics.length) {
      setTimeout(function() {
        var results = document.querySelectorAll('.' + RESULT_CLASS);
        analysis.topics.forEach(function(t) {
          if (!t.name || t.name.length < 2) return;
          var sentLabel = t.sentiment === 'positive' ? 'ポジティブ' : t.sentiment === 'negative' ? 'ネガティブ' : 'ニュートラル';
          var titleText = '「' + t.name + '」' + (t.count ? t.count + '件で言及' : '') + (t.sentiment ? '（' + sentLabel + '）' : '');
          results.forEach(function(resEl) {
            var walker = document.createTreeWalker(resEl, NodeFilter.SHOW_TEXT, null);
            var nodes = [];
            var node;
            while ((node = walker.nextNode())) {
              if (node.parentElement && node.parentElement.tagName === 'SPAN' && node.parentElement.title) continue;
              if (node.textContent.indexOf(t.name) >= 0) nodes.push(node);
            }
            nodes.forEach(function(tn) {
              var idx = tn.textContent.indexOf(t.name);
              if (idx < 0) return;
              try {
                var before = tn.splitText(idx);
                var after = before.splitText(t.name.length);
                var span = document.createElement('span');
                span.style.cssText = 'border-bottom:1px dotted #f6c744;color:#f6c744;cursor:help;';
                span.title = titleText;
                span.textContent = t.name;
                before.parentNode.replaceChild(span, before);
              } catch(e) {}
            });
          });
        });
      }, 500);
    }

    anchor.parentNode.insertBefore(div, anchor.nextSibling);
  }

  // ── ゲームタイトル横ミニバッジ ──
  var VERDICT_MINI_STYLE = {
    '今すぐ買い': { color: '#4caf50', bg: 'rgba(76,175,80,0.15)',   border: '#4caf50' },
    '買い':       { color: '#66bb6a', bg: 'rgba(102,187,106,0.15)', border: '#66bb6a' },
    'セール待ち': { color: '#f6c744', bg: 'rgba(246,199,68,0.15)',  border: '#f6c744' },
    '人を選ぶ':   { color: '#ff9800', bg: 'rgba(255,152,0,0.15)',   border: '#ff9800' },
    '見送り':     { color: '#e74c3c', bg: 'rgba(231,76,60,0.15)',   border: '#e74c3c' },
  };

  function addMiniTitleBadge(analysis) {
    var existing = document.getElementById('ja-mini-badge');
    if (existing) existing.remove();
    var verdict = analysis.recommendation && analysis.recommendation.verdict;
    var pct = analysis.trend && analysis.trend.positive_pct;
    if (!verdict && pct == null) return;

    var titleEl = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
    if (!titleEl) return;

    var vs = VERDICT_MINI_STYLE[verdict] || VERDICT_MINI_STYLE['人を選ぶ'];
    var badge = document.createElement('span');
    badge.id = 'ja-mini-badge';
    badge.style.cssText = 'display:inline-block;margin-left:10px;padding:3px 12px;'
      + 'border-radius:12px;font-size:12px;font-weight:bold;vertical-align:middle;'
      + 'border:1px solid ' + vs.border + ';color:' + vs.color + ';background:' + vs.bg + ';'
      + 'font-family:sans-serif;cursor:pointer;transition:opacity 0.2s;';
    var parts = verdict ? [verdict] : [];
    if (pct != null) parts.push(pct + '%');
    badge.textContent = '🤖 ' + parts.join(' · ');
    badge.title = 'AI分析結果 — クリックでパネルへ';
    badge.addEventListener('mouseenter', function () { badge.style.opacity = '0.8'; });
    badge.addEventListener('mouseleave', function () { badge.style.opacity = '1'; });
    badge.addEventListener('click', function () {
      var panel = document.getElementById('ja-ai-page-result');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
  }

  // ── 機能26: ミニフローティングUI ──
  var FLOAT_POS_KEY = 'ja_trans_float_pos';
  function showMiniFloat(analysis) {
    try {
      var existing = document.getElementById('ja-mini-float');
      if (existing) existing.remove();

      var verdict = analysis.recommendation && analysis.recommendation.verdict;
      var pct = analysis.trend && analysis.trend.positive_pct;
      if (!verdict && pct == null) return;

      var VERDICT_ICON = { '今すぐ買い':'🟢', '買い':'✅', 'セール待ち':'⏳', '人を選ぶ':'⚠️', '見送り':'❌' };
      var VERDICT_COLOR = { '今すぐ買い':'#4caf50','買い':'#66bb6a','セール待ち':'#f6c744','人を選ぶ':'#ff9800','見送り':'#e74c3c' };
      var vIcon = VERDICT_ICON[verdict] || '🤖';
      var vColor = VERDICT_COLOR[verdict] || '#8f98a0';

      var titleEl26 = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
      var gameTitle26 = titleEl26 ? titleEl26.textContent.trim().slice(0, 20) : 'ゲーム';

      var float = document.createElement('div');
      float.id = 'ja-mini-float';
      float.style.cssText = 'position:fixed;z-index:2147483640;background:#0f1923;'
        + 'border:1px solid ' + vColor + ';border-radius:8px;padding:8px 12px;'
        + 'font-family:sans-serif;cursor:pointer;'
        + 'box-shadow:0 4px 16px rgba(0,0,0,0.6);user-select:none;min-width:160px;max-width:220px;'
        + 'transition:box-shadow 0.15s;';

      // 位置の復元
      chrome.storage.local.get([FLOAT_POS_KEY], function(r) {
        var pos = r[FLOAT_POS_KEY];
        if (pos && pos.right != null && pos.bottom != null) {
          float.style.right = pos.right + 'px';
          float.style.bottom = pos.bottom + 'px';
        } else {
          float.style.right = '70px';
          float.style.bottom = '110px';
        }
      });
      float.style.right = '70px';
      float.style.bottom = '110px';

      // 折りたたみ状態（タイトル + verdict + pctバー）
      var collapsedContent = document.createElement('div');

      var titleRow = document.createElement('div');
      titleRow.style.cssText = 'color:#8f98a0;font-size:10px;margin-bottom:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
      titleRow.textContent = '🤖 ' + gameTitle26;
      collapsedContent.appendChild(titleRow);

      var verdictRow = document.createElement('div');
      verdictRow.style.cssText = 'color:' + vColor + ';font-size:13px;font-weight:bold;margin-bottom:5px;';
      verdictRow.textContent = vIcon + ' ' + (verdict || '');
      collapsedContent.appendChild(verdictRow);

      if (pct != null) {
        var barOuter = document.createElement('div');
        barOuter.style.cssText = 'height:6px;background:#1e3828;border-radius:3px;overflow:hidden;';
        var barInner = document.createElement('div');
        var barPct = Math.max(0, Math.min(100, pct));
        var barColor = barPct >= 70 ? '#4caf50' : barPct >= 40 ? '#ff9800' : '#e74c3c';
        barInner.style.cssText = 'height:100%;width:' + barPct + '%;background:' + barColor + ';border-radius:3px;';
        barOuter.appendChild(barInner);
        var barLabel = document.createElement('div');
        barLabel.style.cssText = 'color:#8f98a0;font-size:9px;margin-top:2px;text-align:right;';
        barLabel.textContent = barPct + '% ポジティブ';
        collapsedContent.appendChild(barOuter);
        collapsedContent.appendChild(barLabel);
      }

      // 展開状態
      var expandedContent = document.createElement('div');
      expandedContent.style.cssText = 'display:none;margin-top:6px;border-top:1px solid #1e3828;padding-top:6px;';

      var priceAdviceExpand = analysis.price_advice || analysis.sale_advice;
      if (priceAdviceExpand) {
        var paEl = document.createElement('div');
        paEl.style.cssText = 'color:#c6d4df;font-size:10px;line-height:1.4;margin-bottom:4px;';
        paEl.textContent = '💴 ' + priceAdviceExpand;
        expandedContent.appendChild(paEl);
      }
      if (analysis.sale_prediction && analysis.sale_prediction.verdict) {
        var spEl = document.createElement('div');
        spEl.style.cssText = 'color:#f6c744;font-size:10px;margin-bottom:4px;';
        spEl.textContent = '🔖 ' + analysis.sale_prediction.verdict;
        expandedContent.appendChild(spEl);
      }
      if (analysis.summary) {
        var sumEl26 = document.createElement('div');
        sumEl26.style.cssText = 'color:#8f98a0;font-size:10px;font-style:italic;margin-bottom:4px;line-height:1.4;';
        sumEl26.textContent = '「' + analysis.summary + '」';
        expandedContent.appendChild(sumEl26);
      }
      var detailLink = document.createElement('div');
      detailLink.style.cssText = 'color:#66c0f4;font-size:10px;text-align:right;cursor:pointer;margin-top:2px;';
      detailLink.textContent = '→ 詳細パネルへ';
      detailLink.addEventListener('click', function(e) {
        e.stopPropagation();
        var panel = document.getElementById('ja-ai-page-result');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      expandedContent.appendChild(detailLink);

      float.appendChild(collapsedContent);
      float.appendChild(expandedContent);

      // クリックで展開/折りたたみ
      var isExpanded = false;
      float.addEventListener('click', function(e) {
        if (e.target === detailLink) return;
        isExpanded = !isExpanded;
        expandedContent.style.display = isExpanded ? 'block' : 'none';
        float.style.boxShadow = isExpanded ? '0 6px 24px rgba(0,0,0,0.8)' : '0 4px 16px rgba(0,0,0,0.6)';
      });

      // ドラッグ
      var isDragging = false, dragStartX, dragStartY, startRight, startBottom;
      float.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startRight = parseInt(float.style.right) || 70;
        startBottom = parseInt(float.style.bottom) || 110;
        e.preventDefault();
      });
      document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        var dx = dragStartX - e.clientX;
        var dy = dragStartY - e.clientY;
        var newRight = Math.max(4, Math.min(window.innerWidth - 180, startRight + dx));
        var newBottom = Math.max(4, Math.min(window.innerHeight - 80, startBottom + dy));
        float.style.right = newRight + 'px';
        float.style.bottom = newBottom + 'px';
      });
      document.addEventListener('mouseup', function() {
        if (!isDragging) return;
        isDragging = false;
        var saveObj = {}; saveObj[FLOAT_POS_KEY] = { right: parseInt(float.style.right), bottom: parseInt(float.style.bottom) };
        chrome.storage.local.set(saveObj);
      });

      // 分析パネルが開いている間は非表示
      var panelObserver = new MutationObserver(function() {
        var panel = document.getElementById('ja-ai-page-result');
        if (float) float.style.display = panel ? 'none' : 'block';
      });
      panelObserver.observe(document.body, { childList: true, subtree: false });

      document.body.appendChild(float);
    } catch(e) {}
  }

  // 最後に分析したレビューテキスト（QA用）
  var _lastReviewTexts = [];
  var _lastNewsItems = [];
  var _extraMeta = {};
  // 🔄再分析ボタン専用フラグ。再分析はキャッシュを無視して必ずAPIを叩き直したいが、
  // AI分析ボタンのクリックハンドラは通常キャッシュヒット時に即returnしてしまうため、
  // このフラグが立っている間だけそのキャッシュ参照を1回だけ迂回する。
  var _forceReanalyze = false;
  var _lastForumPosts = []; // 機能8: コミュニティアナウンス

  // ── 新レビュー検出 → 再分析通知 ──
  var _lastReviewCount = 0;
  function watchNewReviews() {
    _lastReviewCount = document.querySelectorAll('.' + BTN_CLASS).length;
    var notified = false;
    var watcher = new MutationObserver(function () {
      var cur = document.querySelectorAll('.' + BTN_CLASS).length;
      if (cur > _lastReviewCount + 2 && _lastReviewCount > 0 && !notified) {
        notified = true;
        var diff = cur - _lastReviewCount;
        _lastReviewCount = cur;
        toast('📋 ' + diff + '件の新しいレビューが読み込まれました', '#4caf50');
        var reBtn = document.getElementById('ja-reanalyze-btn');
        if (reBtn) {
          reBtn.style.display = 'inline-block';
          reBtn.textContent = '🔄 再分析（+' + diff + '件）';
          reBtn.style.color = '#4caf50';
          reBtn.style.borderColor = '#4caf50';
        }
        setTimeout(function () { notified = false; }, 10000);
      } else if (Math.abs(cur - _lastReviewCount) <= 2) {
        _lastReviewCount = cur;
      }
    });
    watcher.observe(document.body, { childList: true, subtree: true });
  }

  // ── Steamストア検索・一覧ページの評価強化 ──
  var STEAM_SCORE_MAP = {
    'Overwhelmingly Positive': { ja: '圧倒的好評', color: '#4caf50' },
    'Very Positive':           { ja: '非常に好評', color: '#66bb6a' },
    'Positive':                { ja: '好評',       color: '#8bc34a' },
    'Mostly Positive':         { ja: 'ほぼ好評',   color: '#8bc34a' },
    'Mixed':                   { ja: '賛否両論',   color: '#f6c744' },
    'Mostly Negative':         { ja: 'ほぼ不評',   color: '#ff9800' },
    'Negative':                { ja: '不評',       color: '#e74c3c' },
    'Very Negative':           { ja: '非常に不評', color: '#e74c3c' },
    'Overwhelmingly Negative': { ja: '圧倒的不評', color: '#c0392b' },
  };

  // ── ストアホバープレビュー ──
  var _hoverTooltip = null;
  var _hoverTimer = null;
  var _wishPickDismissed = false;
  // appid → Steamストア情報（スクリーンショット・発売日・レビュー評価・タグ）のプレビュー用キャッシュ
  var _steamPreviewCache = {};
  function _fetchSteamPreview(appid) {
    if (_steamPreviewCache[appid]) return _steamPreviewCache[appid];
    var p = (async function () {
      try {
        var results = await Promise.all([
          fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,screenshots&cc=jp', { signal: _timeoutSignal(8000) }),
          fetch('https://store.steampowered.com/appreviews/' + appid + '?json=1&num_per_page=0&language=japanese', { signal: _timeoutSignal(8000) })
        ]);
        var detData = results[0].ok ? await results[0].json() : null;
        var revData = results[1].ok ? await results[1].json() : null;
        var info = detData && detData[appid] && detData[appid].data;
        var qs = revData && revData.query_summary;
        return {
          name: info ? info.name : null,
          screenshots: info && info.screenshots ? info.screenshots.slice(0, 5).map(function (s) { return s.path_full; }) : [],
          releaseDate: info && info.release_date ? info.release_date.date : null,
          reviewDesc: qs ? qs.review_score_desc : null,
          reviewCount: qs ? qs.total_reviews : null,
          tags: info && info.genres ? info.genres.map(function (g) { return g.description; }).slice(0, 4) : []
        };
      } catch (e) { return null; }
    })();
    _steamPreviewCache[appid] = p;
    return p;
  }

  function showHoverPreview(el, gameId) {
    var entry = _aiCache[gameId];
    var a = entry && entry.analysis;
    var verdict = a && a.recommendation && a.recommendation.verdict;
    var VERDICT_COLOR = { '今すぐ買い':'#4caf50','買い':'#66bb6a','セール待ち':'#f6c744','人を選ぶ':'#ff9800','見送り':'#e74c3c' };
    var vColor = VERDICT_COLOR[verdict] || '#4a5a6a';
    var overall = a && a.categories && a.categories.find(function (c) { return c.name === '総合'; });
    var TIP_W = 320;

    if (_hoverTooltip) {
      if (_hoverTooltip._cycleTimer) clearInterval(_hoverTooltip._cycleTimer);
      _hoverTooltip.remove();
    }
    var tip = document.createElement('div');
    _hoverTooltip = tip;
    tip.style.cssText = 'position:fixed;z-index:2147483646;'
      + 'background:linear-gradient(180deg,#131f2b 0%,#0d1620 100%);border:1px solid #2d5a3d;border-left:3px solid ' + vColor + ';'
      + 'border-radius:8px;padding:0;width:' + TIP_W + 'px;max-height:min(75vh,560px);overflow-y:auto;font-family:sans-serif;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.03);pointer-events:none;'
      + 'opacity:0;transform:translateY(-4px) scale(0.98);transition:opacity .12s ease-out,transform .12s ease-out;';

    var rect = el.getBoundingClientRect();
    function reposition() {
      var left = rect.right + 10;
      if (left + TIP_W + 10 > window.innerWidth) left = rect.left - TIP_W - 10;
      left = Math.max(8, Math.min(left, window.innerWidth - TIP_W - 8));
      tip.style.left = left + 'px';
      tip.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - 8)) + 'px';
      var tipRect = tip.getBoundingClientRect();
      if (tipRect.bottom > window.innerHeight - 8) {
        tip.style.top = Math.max(8, window.innerHeight - tipRect.height - 8) + 'px';
      }
    }
    reposition();

    // ヘッダー: Steamのスクリーンショット + タイトル（非同期取得、届くまでは行内のサムネで代用）
    var thumbImg = el.querySelector('img');
    var titleLink = Array.from(el.querySelectorAll('a[href*="/app/"]')).find(function (a2) { return a2.textContent.trim(); });
    var gameTitle = titleLink ? titleLink.textContent.trim() : '';
    var head = document.createElement('div');
    head.style.cssText = 'background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);';
    var shotImg = document.createElement('img');
    shotImg.src = (thumbImg && thumbImg.src) || '';
    shotImg.style.cssText = 'display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#0a0f14;';
    shotImg.onerror = function () { shotImg.style.display = 'none'; };
    head.appendChild(shotImg);
    var titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'padding:10px 12px 8px;';
    var titleEl = document.createElement('div');
    titleEl.style.cssText = 'color:#e6f0f7;font-size:13px;font-weight:600;line-height:1.3;margin-bottom:3px;';
    titleEl.textContent = gameTitle;
    titleWrap.appendChild(titleEl);
    var metaLineEl = document.createElement('div');
    metaLineEl.style.cssText = 'color:#8f98a0;font-size:10px;line-height:1.5;';
    titleWrap.appendChild(metaLineEl);
    var tagsRowEl = document.createElement('div');
    tagsRowEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;';
    titleWrap.appendChild(tagsRowEl);
    head.appendChild(titleWrap);
    tip.appendChild(head);

    _fetchSteamPreview(gameId).then(function (sp) {
      if (_hoverTooltip !== tip || !sp) return;
      if (sp.screenshots && sp.screenshots.length) {
        shotImg.src = sp.screenshots[0];
        if (sp.screenshots.length > 1) {
          var shotIdx = 0;
          tip._cycleTimer = setInterval(function () {
            shotIdx = (shotIdx + 1) % sp.screenshots.length;
            shotImg.src = sp.screenshots[shotIdx];
          }, 1800);
        }
      }
      if (sp.name && !gameTitle) titleEl.textContent = sp.name;
      var metaParts = [];
      if (sp.releaseDate) metaParts.push('リリース日: ' + sp.releaseDate);
      if (sp.reviewDesc) metaParts.push('日本語レビュー: ' + sp.reviewDesc + (sp.reviewCount ? '（' + sp.reviewCount.toLocaleString() + '件）' : ''));
      metaLineEl.textContent = metaParts.join(' ・ ');
      (sp.tags || []).forEach(function (t) {
        var chip = document.createElement('span');
        chip.style.cssText = 'padding:1px 7px;border-radius:8px;font-size:9px;color:#8f98a0;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);';
        chip.textContent = t;
        tagsRowEl.appendChild(chip);
      });
      reposition();
    });

    var body = document.createElement('div');
    body.style.cssText = 'padding:12px 14px;';
    tip.appendChild(body);

    if (!a) {
      var noAiEl = document.createElement('div');
      noAiEl.style.cssText = 'color:#8f98a0;font-size:11px;';
      noAiEl.textContent = '📊 このゲームはまだAI分析されていません';
      body.appendChild(noAiEl);
    }

    if (a) {
      // 判定
      if (verdict) {
        var vRow = document.createElement('div');
        vRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
        var vBadge = document.createElement('span');
        vBadge.style.cssText = 'padding:3px 10px;border-radius:10px;font-size:12px;font-weight:bold;'
          + 'color:#0f1923;background:' + vColor + ';box-shadow:0 1px 4px rgba(0,0,0,0.3);';
        vBadge.textContent = verdict;
        vRow.appendChild(vBadge);
        if (overall && overall.stars !== null) {
          var stars = document.createElement('span');
          stars.style.cssText = 'color:#f6c744;font-size:13px;letter-spacing:1px;';
          stars.textContent = renderStars(overall.stars);
          vRow.appendChild(stars);
        }
        if (a.trend && a.trend.positive_pct != null) {
          var trendEl = document.createElement('span');
          trendEl.style.cssText = 'color:#8f98a0;font-size:11px;margin-left:auto;';
          trendEl.textContent = '👍 ' + a.trend.positive_pct + '%';
          vRow.appendChild(trendEl);
        }
        body.appendChild(vRow);
      }

      // キャッチコピー
      if (a.summary) {
        var sum = document.createElement('div');
        sum.style.cssText = 'color:#c6d4df;font-size:11px;font-style:italic;margin-bottom:8px;line-height:1.5;';
        sum.textContent = '「' + a.summary + '」';
        body.appendChild(sum);
      }

      // 良い点・悪い点（最大2つずつ）
      var hasProsCons = (a.pros && a.pros.length) || (a.cons && a.cons.length);
      if (hasProsCons) {
        var pcBox = document.createElement('div');
        pcBox.style.cssText = 'background:rgba(255,255,255,0.025);border-radius:5px;padding:8px 10px;margin-bottom:8px;';
        (a.pros || []).slice(0, 2).forEach(function (p) {
          var proEl = document.createElement('div');
          proEl.style.cssText = 'color:#7bcf8e;font-size:11px;margin-bottom:4px;line-height:1.45;';
          proEl.textContent = '✓ ' + p;
          pcBox.appendChild(proEl);
        });
        (a.cons || []).slice(0, 2).forEach(function (c) {
          var conEl = document.createElement('div');
          conEl.style.cssText = 'color:#ef7d6b;font-size:11px;margin-bottom:4px;line-height:1.45;';
          conEl.textContent = '✗ ' + c;
          pcBox.appendChild(conEl);
        });
        pcBox.lastChild.style.marginBottom = '0';
        body.appendChild(pcBox);
      }

      // おすすめプレイヤー像 / 価格アドバイス / 懸念事項
      var metaLines = [];
      if (a.audience && a.audience.for && a.audience.for[0]) metaLines.push({ icon: '🎯', color: '#66c0f4', text: a.audience.for[0] });
      var priceLine = a.price_advice || (a.sale_prediction && a.sale_prediction.advice);
      if (priceLine) metaLines.push({ icon: '💴', color: '#f6c744', text: priceLine });
      if (a.risk_flags && a.risk_flags.length) metaLines.push({ icon: '⚠', color: '#ff9800', text: a.risk_flags.slice(0, 2).join(' / ') });
      if (metaLines.length) {
        var metaBox = document.createElement('div');
        metaBox.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:2px;';
        metaLines.forEach(function (m) {
          var mEl = document.createElement('div');
          mEl.style.cssText = 'color:' + m.color + ';font-size:11px;line-height:1.45;';
          mEl.textContent = m.icon + ' ' + m.text;
          metaBox.appendChild(mEl);
        });
        body.appendChild(metaBox);
      }
    }

    // キャッシュ鮮度
    if (entry) {
      var ageEl = document.createElement('div');
      ageEl.style.cssText = 'color:#54687a;font-size:10px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;margin-top:8px;';
      ageEl.textContent = '📦 ' + getCacheAgeText(entry.timestamp) + 'のキャッシュ · ' + (entry.reviewCount || 0) + '件分析';
      body.appendChild(ageEl);
    }

    document.body.appendChild(tip);
    reposition();
    requestAnimationFrame(function () {
      if (_hoverTooltip === tip) { tip.style.opacity = '1'; tip.style.transform = 'translateY(0) scale(1)'; }
    });
  }

  function attachHoverPreview(el, gameId) {
    if (el.dataset.jaHover) return;
    el.dataset.jaHover = '1';
    el.addEventListener('mouseenter', function () {
      _hoverTimer = setTimeout(function () { showHoverPreview(el, gameId); }, 400);
    });
    el.addEventListener('mouseleave', function () {
      clearTimeout(_hoverTimer);
      if (_hoverTooltip) {
        if (_hoverTooltip._cycleTimer) clearInterval(_hoverTooltip._cycleTimer);
        _hoverTooltip.remove(); _hoverTooltip = null;
      }
    });
  }

  function _extractAppId(el) {
    var link = el.tagName === 'A' ? el : el.querySelector('a[href*="/app/"]');
    if (!link) return null;
    var m = link.href.match(/\/app\/(\d+)/);
    return m ? m[1] : null;
  }

  // 機能22: 検索ページのAIキャッシュバッジ追加
  function attachSearchAiBadge(el, appId) {
    if (!appId || el.querySelector('.ja-ai-search-badge')) return;
    var entry = _aiCache[appId];
    if (!entry || !entry.analysis) return;
    var a = entry.analysis;
    var verdict = a.recommendation && a.recommendation.verdict;
    var sentScore = a.trend && a.trend.positive_pct;
    if (!verdict && sentScore == null) return;
    var VERDICT_COLOR = { '今すぐ買い':'#4caf50','買い':'#66bb6a','セール待ち':'#f6c744','人を選ぶ':'#ff9800','見送り':'#e74c3c' };
    var color = VERDICT_COLOR[verdict] || '#8f98a0';
    var badge = document.createElement('div');
    badge.className = 'ja-ai-search-badge';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:bold;font-family:sans-serif;'
      + 'color:' + color + ';background:rgba(0,0,0,0.5);border:1px solid ' + color + ';margin-top:3px;';
    var parts = verdict ? [verdict] : [];
    if (sentScore != null) parts.push(sentScore + '%');
    badge.textContent = '🤖 ' + parts.join(' · ');
    var nameEl = el.querySelector('.search_name,.match_name,.title,.tab_item_name');
    if (nameEl) nameEl.appendChild(badge);
    else el.appendChild(badge);
  }

  function enhanceStoreSearch() {
    // 検索結果ページ (.search_result_row)
    document.querySelectorAll('.search_result_row:not([data-ja-enhanced])').forEach(function (row) {
      row.dataset.jaEnhanced = '1';
      var appId = _extractAppId(row);
      if (appId) { attachHoverPreview(row, appId); attachSearchAiBadge(row, appId); }
      var scoreEl = row.querySelector('.search_review_summary');
      if (!scoreEl) return;
      var tooltip = scoreEl.getAttribute('data-tooltip-html') || scoreEl.getAttribute('data-tooltip-text') || '';
      // 機能15: 隠れた名作ハイライト
      var reviewCountMatch = tooltip.match(/([\d,]+)\s*(user reviews|reviews)/i);
      if (reviewCountMatch) {
        var reviewNum = parseInt(reviewCountMatch[1].replace(/,/g, ''), 10);
        var isHiddenGem = reviewNum < 1000 && (
          tooltip.indexOf('Very Positive') >= 0 || tooltip.indexOf('Overwhelmingly Positive') >= 0
        );
        if (isHiddenGem && !row.querySelector('.ja-hidden-gem')) {
          var gemBadge = document.createElement('span');
          gemBadge.className = 'ja-hidden-gem';
          gemBadge.style.cssText = 'display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;'
            + 'background:rgba(76,175,80,0.15);color:#4caf50;border:1px solid #4caf50;'
            + 'font-family:sans-serif;margin-right:6px;';
          gemBadge.textContent = '💎 隠れた名作';
          var titleEl15 = row.querySelector('.search_name,.match_name,.title');
          if (titleEl15) titleEl15.insertBefore(gemBadge, titleEl15.firstChild);
          else row.insertBefore(gemBadge, row.firstChild);
        }
      }
      Object.keys(STEAM_SCORE_MAP).forEach(function (key) {
        if (tooltip.indexOf(key) >= 0 || scoreEl.className.indexOf(key.replace(/ /g, '_').toLowerCase()) >= 0) {
          var m = STEAM_SCORE_MAP[key];
          if (!row.querySelector('.ja-score-label')) {
            var label = document.createElement('div');
            label.className = 'ja-score-label';
            label.style.cssText = 'font-size:10px;color:' + m.color + ';font-family:sans-serif;'
              + 'font-weight:bold;margin-top:2px;';
            label.textContent = m.ja;
            scoreEl.appendChild(label);
          }
        }
      });
    });

    // タブアイテム形式 (.tab_item) や Discover キュー
    document.querySelectorAll('.tab_item:not([data-ja-enhanced]),.store_capsule:not([data-ja-enhanced])').forEach(function (el) {
      el.dataset.jaEnhanced = '1';
      var appId2 = _extractAppId(el);
      if (appId2) { attachHoverPreview(el, appId2); attachSearchAiBadge(el, appId2); }
      var scoreEl = el.querySelector('.tab_review_summary,.review_desc,.search_review_summary');
      if (!scoreEl) return;
      var text = scoreEl.textContent.trim();
      var m = STEAM_SCORE_MAP[text];
      if (m && !el.querySelector('.ja-score-label')) {
        var label = document.createElement('div');
        label.className = 'ja-score-label';
        label.style.cssText = 'font-size:10px;color:' + m.color + ';font-weight:bold;font-family:sans-serif;margin-top:1px;';
        label.textContent = m.ja;
        scoreEl.parentNode.appendChild(label);
      }
    });

    // 機能21: マルチゲーム一括分析（検索・ブラウズページ）
    initMultiAnalysis();

    // wishlistページ (.wishlistRow)
    document.querySelectorAll('.wishlistRow:not([data-ja-enhanced])').forEach(function (row) {
      row.dataset.jaEnhanced = '1';
      var appId3 = _extractAppId(row);
      if (appId3) attachHoverPreview(row, appId3);
      var reviewEl = row.querySelector('.review_capsule_subtitle,[class*="review_summary"]');
      if (!reviewEl) return;
      Object.keys(STEAM_SCORE_MAP).forEach(function (key) {
        if (reviewEl.textContent.indexOf(key) >= 0 && !row.querySelector('.ja-score-label')) {
          var m = STEAM_SCORE_MAP[key];
          var label = document.createElement('span');
          label.className = 'ja-score-label';
          label.style.cssText = 'color:' + m.color + ';font-size:11px;font-family:sans-serif;margin-left:6px;';
          label.textContent = '(' + m.ja + ')';
          reviewEl.appendChild(label);
        }
      });
    });
  }

  // ── 機能21: マルチゲーム一括分析 ──
  var _multiSelected = new Set();
  function initMultiAnalysis() {
    if (document.getElementById('ja-multi-analyze-btn')) return;
    var isStoreList = /\/search\/|\/genre\/|\/explore\/|\/tag\/|\/recommended\//i.test(location.pathname);
    if (!isStoreList) return;

    // フローティングボタン
    var floatBtn = document.createElement('button');
    floatBtn.id = 'ja-multi-analyze-btn';
    floatBtn.style.cssText = 'position:fixed;bottom:110px;right:16px;z-index:2147483641;'
      + 'background:#1b2838;color:#66c0f4;border:2px solid #66c0f4;border-radius:8px;'
      + 'padding:8px 14px;font-size:12px;font-family:sans-serif;cursor:pointer;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,0.5);display:none;';
    floatBtn.textContent = '🔍 選択中のゲームを一括分析 (0)';
    document.body.appendChild(floatBtn);

    // ゲームカードにチェックボックスを付与
    function attachCheckboxes() {
      document.querySelectorAll('.search_result_row:not([data-ja-cb]),.tab_item:not([data-ja-cb])').forEach(function(row) {
        row.dataset.jaCb = '1';
        var appId = _extractAppId(row);
        if (!appId) return;
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.style.cssText = 'position:absolute;top:6px;left:6px;z-index:10;width:16px;height:16px;cursor:pointer;accent-color:#66c0f4;';
        cb.title = '比較分析に追加（最大5件）';
        row.style.position = 'relative';
        cb.addEventListener('change', function() {
          if (cb.checked) {
            if (_multiSelected.size >= 5) { cb.checked = false; toast('最大5ゲームまで選択できます', '#f6c744'); return; }
            _multiSelected.add(appId);
          } else {
            _multiSelected.delete(appId);
          }
          floatBtn.textContent = '🔍 選択中のゲームを一括分析 (' + _multiSelected.size + ')';
          floatBtn.style.display = _multiSelected.size > 0 ? 'block' : 'none';
        });
        row.insertBefore(cb, row.firstChild);
      });
    }
    attachCheckboxes();

    // MutationObserverで動的追加されたカードにも適用
    var cbObserver = new MutationObserver(function() { attachCheckboxes(); });
    cbObserver.observe(document.body, { childList: true, subtree: true });

    floatBtn.addEventListener('click', function() {
      if (!_multiSelected.size) return;
      showMultiAnalysisModal(Array.from(_multiSelected));
    });
  }

  function showMultiAnalysisModal(appIds) {
    var existing = document.getElementById('ja-multi-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'ja-multi-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483645;'
      + 'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#0f1923;border:1px solid #2d5a3d;border-radius:8px;'
      + 'width:min(90vw,900px);max-height:80vh;overflow-y:auto;padding:20px;color:#c6d4df;';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#66c0f4;font-size:15px;font-weight:bold;';
    hdrTitle.textContent = '🔍 マルチゲーム比較分析';
    var closeBtn26 = document.createElement('button');
    closeBtn26.textContent = '✕';
    closeBtn26.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
    closeBtn26.addEventListener('click', function() { overlay.remove(); });
    hdr.appendChild(hdrTitle); hdr.appendChild(closeBtn26);
    panel.appendChild(hdr);

    var note = document.createElement('div');
    note.style.cssText = 'color:#f6c744;font-size:11px;margin-bottom:12px;padding:6px 10px;background:rgba(246,199,68,0.08);border:1px solid rgba(246,199,68,0.3);border-radius:4px;';
    note.textContent = '💡 各ゲームページで先にAI分析してください。キャッシュがないゲームは「未分析」と表示されます。';
    panel.appendChild(note);

    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;';

    var VERDICT_STYLE21 = {
      '今すぐ買い': { color:'#4caf50', icon:'🟢' }, '買い': { color:'#66bb6a', icon:'✅' },
      'セール待ち': { color:'#f6c744', icon:'⏳' }, '人を選ぶ': { color:'#ff9800', icon:'⚠️' }, '見送り': { color:'#e74c3c', icon:'❌' }
    };

    appIds.forEach(function(appId) {
      var entry = _aiCache[appId];
      var card = document.createElement('div');
      card.style.cssText = 'background:#162520;border:1px solid #1e3828;border-radius:6px;padding:12px;';

      if (!entry || !entry.analysis) {
        var unanalyzed = document.createElement('div');
        unanalyzed.style.cssText = 'color:#8f98a0;font-size:12px;';
        var link = document.createElement('a');
        link.href = 'https://store.steampowered.com/app/' + appId;
        link.target = '_blank';
        link.style.cssText = 'color:#66c0f4;font-size:11px;display:block;margin-bottom:6px;';
        link.textContent = '🔗 App #' + appId;
        unanalyzed.textContent = '📊 未分析';
        card.appendChild(link); card.appendChild(unanalyzed);
      } else {
        var a = entry.analysis;
        var verdict = a.recommendation && a.recommendation.verdict;
        var vs21 = VERDICT_STYLE21[verdict] || { color:'#8f98a0', icon:'🤖' };
        var pct21 = a.trend && a.trend.positive_pct;

        var gameLink = document.createElement('a');
        gameLink.href = 'https://store.steampowered.com/app/' + appId;
        gameLink.target = '_blank';
        gameLink.style.cssText = 'color:#66c0f4;font-size:11px;display:block;margin-bottom:6px;text-decoration:none;';
        gameLink.textContent = '🔗 ' + appId;
        if (entry.analysis.summary) {
          var nameEl21 = document.createElement('div');
          nameEl21.style.cssText = 'color:#c6d4df;font-size:11px;font-style:italic;margin-bottom:5px;line-height:1.3;';
          nameEl21.textContent = '「' + a.summary + '」';
          card.appendChild(gameLink); card.appendChild(nameEl21);
        } else {
          card.appendChild(gameLink);
        }

        if (verdict) {
          var vEl = document.createElement('div');
          vEl.style.cssText = 'color:' + vs21.color + ';font-size:13px;font-weight:bold;margin-bottom:5px;';
          vEl.textContent = vs21.icon + ' ' + verdict;
          card.appendChild(vEl);
        }

        if (pct21 != null) {
          var barOuter21 = document.createElement('div');
          barOuter21.style.cssText = 'height:6px;background:#1e3828;border-radius:3px;overflow:hidden;margin-bottom:3px;';
          var barInner21 = document.createElement('div');
          var bc21 = pct21 >= 70 ? '#4caf50' : pct21 >= 40 ? '#ff9800' : '#e74c3c';
          barInner21.style.cssText = 'height:100%;width:' + pct21 + '%;background:' + bc21 + ';border-radius:3px;';
          barOuter21.appendChild(barInner21);
          var barLbl21 = document.createElement('div');
          barLbl21.style.cssText = 'color:#8f98a0;font-size:9px;';
          barLbl21.textContent = pct21 + '% ポジティブ';
          card.appendChild(barOuter21); card.appendChild(barLbl21);
        }

        var priceAdv21 = a.price_advice;
        if (priceAdv21) {
          var paEl21 = document.createElement('div');
          paEl21.style.cssText = 'color:#c6d4df;font-size:10px;margin-top:5px;line-height:1.4;';
          paEl21.textContent = '💴 ' + priceAdv21;
          card.appendChild(paEl21);
        }
      }
      grid.appendChild(card);
    });

    panel.appendChild(grid);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ── ウィッシュリスト全件のappid一覧を取得 ──
  // Steamの仮想スクロールではDOMに一部の行しか存在しないため、
  // ページ本体(メインワールド)が保持するReact QueryのSSRキャッシュ(window.SSR.renderContext.queryData)から
  // "WishlistSortedFiltered" クエリの結果を読み取る。content scriptは分離ワールドで動くため
  // window.SSR に直接アクセスできず、background.js 経由でメインワールドに問い合わせて結果を非同期キャッシュする。
  // キャッシュがまだ無い間はDOM上に現在描画されている行だけにフォールバックする。
  var _wishSSRIdsCache = null;
  var _wishSSRRequested = false;
  var _wishDateAddedCache = {};
  // 「💰 価格別」タブ用の価格キャッシュ。Steamへの問い合わせを減らすため1時間はstorageに永続化して使い回す
  // （価格は1時間程度では通常変わらないため）。ウィッシュリスト自体が更新されて新しいappidが
  // 増えた場合はその分だけ追加取得し、1時間経過後は全体を再取得する。
  var WISH_GROUP_PRICE_KEY = 'ja_trans_wish_group_price_v1';
  var WISH_GROUP_PRICE_TTL = 3600000; // 1時間
  var _wishGroupPriceCache = {};
  var _wishGroupPriceFetchedAt = 0;
  chrome.storage.local.get([WISH_GROUP_PRICE_KEY], function (r) {
    var saved = r[WISH_GROUP_PRICE_KEY];
    if (saved && saved.prices) {
      _wishGroupPriceCache = saved.prices;
      _wishGroupPriceFetchedAt = saved.fetchedAt || 0;
    }
  });
  function _saveWishGroupPriceCache() {
    // chrome.storage.local.set は拡張機能のコンテキストが無効化された場合などに
    // 同期的に例外を投げることがある。ここで失敗しても、取得済みの価格データを
    // 描画すること自体は継続できるべきなので握りつぶす（次回はまた全件取得になるだけ）。
    try {
      var obj = {}; obj[WISH_GROUP_PRICE_KEY] = { prices: _wishGroupPriceCache, fetchedAt: _wishGroupPriceFetchedAt };
      chrome.storage.local.set(obj);
    } catch (e) { console.warn('[SteamJaTrans] 価格キャッシュの保存に失敗:', e && e.message); }
  }
  function _requestWishlistSSRIds() {
    if (_wishSSRRequested) return;
    _wishSSRRequested = true;
    chrome.runtime.sendMessage({ type: 'getWishlistSSR' }, function (resp) {
      if (resp && resp.ids && resp.ids.length) _wishSSRIdsCache = resp.ids;
      if (resp && resp.dateAdded) _wishDateAddedCache = resp.dateAdded;
      _refreshWishStaleBadges();
    });
  }
  // 長期放置バッジは_wishDateAddedCacheの非同期解決待ちになることがあるため、
  // 解決待ちの行に印を付けておき、SSRデータ到着後にこの関数で後埋めする。
  function _refreshWishStaleBadges() {
    document.querySelectorAll('[data-stale-check-appid]').forEach(function (badgeEl) {
      var appid = badgeEl.dataset.staleCheckAppid;
      delete badgeEl.dataset.staleCheckAppid;
      var wDateAdded = _wishDateAddedCache[appid];
      if (!wDateAdded) return;
      var wDaysSinceAdded = Math.floor((Date.now() / 1000 - wDateAdded) / 86400);
      if (wDaysSinceAdded < 365) return;
      var staleBadge = document.createElement('span');
      staleBadge.className = 'ja-wish-stale';
      staleBadge.style.cssText = 'display:inline-block;margin-left:6px;padding:2px 7px;border-radius:10px;'
        + 'font-size:10px;font-family:sans-serif;color:#8f98a0;background:rgba(143,152,160,0.1);border:1px solid #4a5a6a;';
      staleBadge.textContent = '🕸 興味を失ったかも';
      staleBadge.title = '追加から約' + Math.floor(wDaysSinceAdded / 365) + '年経過';
      badgeEl.appendChild(staleBadge);
    });
  }
  function _getWishlistAppIds() {
    _requestWishlistSSRIds();
    if (_wishSSRIdsCache && _wishSSRIdsCache.length) return { ids: _wishSSRIdsCache, complete: true };
    var domIds = Array.from(document.querySelectorAll('[data-rfd-draggable-id^="WishlistItem-"]')).map(function (row) {
      var m = (row.getAttribute('data-rfd-draggable-id') || '').match(/^WishlistItem-(\d+)-/);
      return m ? m[1] : null;
    }).filter(Boolean);
    return { ids: domIds, complete: false };
  }

  // ── 「2026年12月18日頃」形式の日本語日付文字列から残り日数を計算 ──
  function _daysUntilJaDate(str) {
    if (!str) return null;
    var m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!m) return null;
    var target = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    var days = Math.ceil((target.getTime() - Date.now()) / (24 * 3600 * 1000));
    return days >= 0 ? days : null;
  }

  // ── ウィッシュリストの1ゲームをSteam公開APIでレビュー取得しAI分析する ──
  async function _fetchAndAnalyzeGameById(appid) {
    if (!_geminiKeyCache && !_1minKeyCache) return null;
    try {
      // filtersにdlc/demosを含めないとSteamがそのフィールドを省略するため、
      // このバッチ分析経路でもDLC有無の判定根拠(_sanitizeDlcRiskFlags等)が効くように明示指定する。
      var detRes = await fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,dlc,demos,steam_deck_compatibility,price_overview,release_date,categories&cc=jp', { signal: _timeoutSignal(8000) });
      var detData = detRes.ok ? await detRes.json() : null;
      var info = detData && detData[appid] && detData[appid].data;
      if (info && info.release_date && info.release_date.coming_soon) {
        // 未発売ゲームはレビューが存在しないため分析不可能。毎回レビュー取得を試みて
        // 失敗する無駄を避けるとともに、以後「未分析」件数から除外できるよう記録する。
        _unreleasedSet[appid] = Date.now();
        _saveUnreleasedSet();
        return '__UNRELEASED__';
      }
      var priceInfo = null;
      if (info && info.price_overview) {
        priceInfo = {
          current: Math.floor(info.price_overview.final / 100),
          original: Math.floor(info.price_overview.initial / 100),
          discountPct: info.price_overview.discount_percent || null
        };
      }
      var gameTags = info && info.genres ? info.genres.map(function (g) { return g.description; }) : [];

      var revRes = await fetch('https://store.steampowered.com/appreviews/' + appid + '?json=1&num_per_page=60&filter=recent&language=all&review_type=all&purchase_type=all', { signal: _timeoutSignal(10000) });
      var revData = revRes.ok ? await revRes.json() : null;
      var texts = ((revData && revData.reviews) || []).map(function (r) { return r.review; }).filter(function (t) { return t && t.length >= 10; });
      if (!texts.length) return null;

      var langDist = computeLangDist(texts);
      var extraMeta = info ? { basicData: info } : null;
      var result = await analyzeWithGemini(texts, _geminiKeyCache, priceInfo, gameTags, 0, null, extraMeta);
      if (!result || result === '__RETRY__') return null;
      setAnalysisCache(appid, result, texts.length, langDist, null, priceInfo, gameTags, info || null);
      _incrementDailyCount();
      return result;
    } catch (e) {
      return null;
    }
  }

  // ── Steam Web APIキー + 自分のSteamIDを取得（積みゲー実績進捗などで使用） ──
  var _steamCredsCache = null;
  async function _getSteamCreds() {
    if (_steamCredsCache !== null) return _steamCredsCache || null;
    var apiKey = await new Promise(function (res) {
      chrome.storage.local.get(['ja_trans_steam_api_key'], function (r) { res(r['ja_trans_steam_api_key']); });
    });
    if (!apiKey) { _steamCredsCache = false; return null; }
    try {
      var meRes = await fetch('https://steamcommunity.com/my/', { credentials: 'include' });
      var idMatch = meRes.url.match(/\/profiles\/(\d+)/);
      var steamid = idMatch ? idMatch[1] : null;
      if (!steamid) {
        var vanityMatch = meRes.url.match(/\/id\/([^\/]+)/);
        if (vanityMatch) {
          var rr = await fetch('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=' + encodeURIComponent(apiKey) + '&vanityurl=' + encodeURIComponent(vanityMatch[1]));
          var rd = await rr.json();
          if (rd.response && rd.response.success === 1) steamid = rd.response.steamid;
        }
      }
      if (!steamid) { _steamCredsCache = false; return null; }
      _steamCredsCache = { steamid: steamid, apiKey: apiKey };
      return _steamCredsCache;
    } catch (e) { _steamCredsCache = false; return null; }
  }

  // appid → { unlocked, total } の実績解除進捗（取得不可・実績なしの場合はnull）
  async function _fetchAchievementProgress(appid) {
    var creds = await _getSteamCreds();
    if (!creds) return null;
    try {
      var r = await fetch('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?appid=' + appid
        + '&key=' + encodeURIComponent(creds.apiKey) + '&steamid=' + creds.steamid + '&format=json', { signal: _timeoutSignal(6000) });
      if (!r.ok) return null;
      var d = await r.json();
      var ach = d.playerstats && d.playerstats.success && d.playerstats.achievements;
      if (!ach || !ach.length) return null;
      var unlocked = ach.filter(function (a) { return a.achieved === 1; }).length;
      return { unlocked: unlocked, total: ach.length };
    } catch (e) { return null; }
  }

  // appidに直近60日以内のニュース/アップデート投稿があるか（積みゲー発掘の「最近アップデートあり」バッジ用）
  async function _fetchHasRecentUpdate(appid) {
    try {
      var r = await fetch('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=' + appid + '&count=5&maxlength=100&format=json', { signal: _timeoutSignal(6000) });
      if (!r.ok) return false;
      var d = await r.json();
      var items = (d.appnews && d.appnews.newsitems) || [];
      if (!items.length) return false;
      var cutoff = Date.now() / 1000 - 60 * 24 * 3600;
      return items.some(function (it) { return it.date && it.date > cutoff; });
    } catch (e) { return false; }
  }

  // 所持ゲーム上位（プレイ時間順）のジャンルをプレイ時間加重で集計し、上位5ジャンルを返す
  var _topGenresCache = null;
  async function _computeTopGenres() {
    if (_topGenresCache !== null) return _topGenresCache;
    var games = await new Promise(function (res) {
      chrome.storage.local.get(['ja_trans_owned_games_detail_v1'], function (r) { res(r['ja_trans_owned_games_detail_v1'] || []); });
    });
    if (!games.length) { _topGenresCache = []; return []; }
    var top = games.slice().sort(function (a, b) { return (b.playtime_forever || 0) - (a.playtime_forever || 0); }).slice(0, 30);
    var genreScore = {};
    await Promise.all(top.map(async function (g) {
      try {
        var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + g.appid + '&filters=genres', { signal: _timeoutSignal(6000) });
        var d = r.ok ? await r.json() : null;
        var genres = d && d[g.appid] && d[g.appid].data && d[g.appid].data.genres;
        if (!genres) return;
        genres.forEach(function (gn) {
          genreScore[gn.description] = (genreScore[gn.description] || 0) + (g.playtime_forever || 1);
        });
      } catch (e) { /* この1件はスキップ */ }
    }));
    var top5 = Object.keys(genreScore).sort(function (a, b) { return genreScore[b] - genreScore[a]; }).slice(0, 5);
    _topGenresCache = top5;
    return top5;
  }

  // 未発売ゲームの発売日情報を取得（appdetailsのrelease_date）
  async function _fetchReleaseInfo(appid) {
    try {
      var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,release_date&cc=jp', { signal: _timeoutSignal(6000) });
      if (!r.ok) return null;
      var d = await r.json();
      var info = d && d[appid] && d[appid].data;
      var rd = info && info.release_date;
      if (!rd || !rd.coming_soon || !rd.date) return null;
      return rd.date;
    } catch (e) { return null; }
  }
  function _appendReleaseBadge(container, dateStr) {
    if (!container || container.querySelector('.ja-wish-release')) return;
    var days = _daysUntilJaDate(dateStr);
    var badge = document.createElement('span');
    badge.className = 'ja-wish-release';
    badge.style.cssText = 'display:inline-block;margin-left:6px;padding:2px 7px;border-radius:10px;'
      + 'font-size:10px;font-family:sans-serif;color:#66c0f4;background:rgba(102,192,244,0.1);border:1px solid rgba(102,192,244,0.4);';
    badge.textContent = days != null ? ('🗓 発売まであと' + days + '日') : ('🗓 発売予定: ' + dateStr);
    container.appendChild(badge);
  }

  // ── 機能: ウィッシュリスト合計金額計算 ──
  async function _computeWishlistTotal(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    var origText = btn.textContent;
    var existing = document.getElementById('ja-wish-total-result');
    if (existing) existing.remove();

    var ids = _getWishlistAppIds().ids;
    var currentTotal = 0, saleTotal = 0, analyzedCount = 0, fetchedCount = 0;
    // ウィッシュリスト全件(100件超もあり得る)を一気に叩くとAkamaiのbot判定に引っかかるため、
    // 同時実行数を絞りチャンク間隔を広めに取る。
    var CHUNK = 4;
    for (var i = 0; i < ids.length; i += CHUNK) {
      var chunk = ids.slice(i, i + CHUNK);
      btn.textContent = '⏳ 計算中... (' + Math.min(i + CHUNK, ids.length) + '/' + ids.length + ')';
      await Promise.all(chunk.map(async function (id) {
        try {
          var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + id + '&filters=price_overview&cc=jp', { signal: _timeoutSignal(6000) });
          var d = r.ok ? await r.json() : null;
          var info = d && d[id] && d[id].data;
          var price = info && info.price_overview ? Math.floor(info.price_overview.final / 100) : 0;
          currentTotal += price;
          var salePrice = price;
          var entry = _aiCache[id];
          var cand = entry && entry.analysis && entry.analysis.sale_prediction && entry.analysis.sale_prediction.candidates && entry.analysis.sale_prediction.candidates[0];
          if (cand && cand.discount_pct) {
            salePrice = Math.round(price * (1 - cand.discount_pct / 100));
            analyzedCount++;
          }
          saleTotal += salePrice;
          fetchedCount++;
        } catch (e) { /* この1件はスキップ */ }
      }));
      if (i + CHUNK < ids.length) await new Promise(function (res) { setTimeout(res, 800); });
    }

    btn.disabled = false;
    btn.textContent = origText;

    var resultEl = document.createElement('div');
    resultEl.id = 'ja-wish-total-result';
    resultEl.style.cssText = 'max-width:560px;margin:8px auto;padding:10px 14px;'
      + 'background:#0f1923;border:1px solid #2d5a3d;border-radius:6px;font-family:sans-serif;font-size:12px;color:#c6d4df;text-align:center;';
    var line1 = document.createElement('div');
    line1.textContent = '💰 現在の合計金額（' + fetchedCount + '/' + ids.length + '件）: ¥' + currentTotal.toLocaleString();
    resultEl.appendChild(line1);
    if (analyzedCount > 0) {
      var line2 = document.createElement('div');
      line2.style.cssText = 'color:#f6c744;margin-top:4px;';
      line2.textContent = '🔖 セール予測後の概算合計: 約¥' + saleTotal.toLocaleString() + '（AI分析済み' + analyzedCount + '件のみ割引反映、他は現在価格のまま）';
      resultEl.appendChild(line2);
    }
    var anchor = document.getElementById('ja-wish-sort-btn');
    if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(resultEl, anchor.nextSibling);
  }

  // 現在DOMにある「📊 未分析」バッジのうち、_aiCacheに分析結果が入ったものを最新表示に更新する
  function _refreshWishBadges() {
    document.querySelectorAll('.ja-wish-badge[data-verdict-rank="99"]').forEach(function (badge) {
      var id = badge.dataset.appid;
      var entry = id && _aiCache[id];
      if (!entry || !entry.analysis || !entry.analysis.recommendation) return;
      var verdict = entry.analysis.recommendation.verdict;
      var style = VERDICT_MINI_STYLE[verdict] || VERDICT_MINI_STYLE['人を選ぶ'];
      badge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;'
        + 'font-size:11px;font-family:sans-serif;font-weight:bold;vertical-align:middle;'
        + 'color:' + style.color + ';background:' + style.bg + ';border:1px solid ' + style.border + ';';
      badge.textContent = '🤖 ' + verdict;
      badge.dataset.verdictRank = String(['今すぐ買い','買い','セール待ち','人を選ぶ','見送り'].indexOf(verdict));

      var candidate = entry.analysis.sale_prediction && entry.analysis.sale_prediction.candidates && entry.analysis.sale_prediction.candidates[0];
      var days = candidate ? _daysUntilJaDate(candidate.date) : null;
      if (days != null && badge.parentElement && !badge.parentElement.querySelector('.ja-wish-countdown')) {
        var countdownBadge = document.createElement('span');
        countdownBadge.className = 'ja-wish-countdown';
        countdownBadge.style.cssText = 'display:inline-block;margin-left:6px;padding:2px 7px;border-radius:10px;'
          + 'font-size:10px;font-family:sans-serif;color:#f6c744;background:rgba(246,199,68,0.1);border:1px solid rgba(246,199,68,0.4);';
        countdownBadge.textContent = '⏳あと' + days + '日';
        countdownBadge.title = candidate.name ? (candidate.name + '（予測）') : 'セール予測';
        badge.parentElement.appendChild(countdownBadge);
      }
    });
  }

  // ── 機能: ウィッシュリスト未分析ゲームの全件分析 ──
  var _wishAnalyzeAllRunning = false;
  var _wishAnalyzeAllCancel = false;
  async function _analyzeAllUnanalyzedWishlist(btn) {
    if (_wishAnalyzeAllRunning) {
      _wishAnalyzeAllCancel = true;
      btn.textContent = '⏹ 停止中...';
      return;
    }
    var w = _getWishlistAppIds();
    var targets = w.ids.filter(function (id) {
      if (_isKnownUnreleased(id)) return false;
      var e = _aiCache[id];
      return !(e && e.analysis && e.analysis.recommendation);
    });
    if (!targets.length) { toast('未分析のゲームはありません', '#8f98a0'); return; }

    _wishAnalyzeAllRunning = true;
    _wishAnalyzeAllCancel = false;
    var origText = btn.textContent;
    btn.style.color = '#e74c3c'; btn.style.borderColor = '#e74c3c';
    var done = 0, failed = 0, unreleased = 0;
    for (var i = 0; i < targets.length; i++) {
      if (_wishAnalyzeAllCancel) break;
      btn.textContent = '⏹ 分析中... (' + (i + 1) + '/' + targets.length + ')（クリックで停止）';
      var result = await _fetchAndAnalyzeGameById(targets[i]);
      if (result === '__UNRELEASED__') { unreleased++; }
      else if (result) { done++; _refreshWishBadges(); }
      else { failed++; }
      if (_wishAnalyzeAllCancel) break;
      if (i < targets.length - 1) await new Promise(function (res) { setTimeout(res, _opts.bulkDelay || 1000); });
    }
    _wishAnalyzeAllRunning = false;
    var cancelled = _wishAnalyzeAllCancel;
    _wishAnalyzeAllCancel = false;
    btn.style.color = '#8fcfa0'; btn.style.borderColor = '#4caf50';
    btn.textContent = origText;
    toast((cancelled ? '⏹ 停止しました。' : '✓ 完了しました。') + done + '件成功'
      + (failed ? '・' + failed + '件失敗' : '')
      + (unreleased ? '・' + unreleased + '件は未発売のためスキップ' : ''), cancelled ? '#f6c744' : '#4caf50');
  }

  // ── 機能: ウィッシュリストAI判定順一覧パネル ──
  var WISH_RANK_BATCH = 10;
  // ── バグ報告抽出リスト（既存のバグ系キーワード辞書を再利用、AI呼び出しなし） ──
  function showBugReportPanel() {
    var existing = document.getElementById('ja-bug-report-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'ja-bug-report-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483645;'
      + 'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#0f1923;border:1px solid #2d5a3d;border-radius:8px;'
      + 'width:min(90vw,700px);max-height:80vh;overflow-y:auto;padding:20px;color:#c6d4df;';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#e74c3c;font-size:15px;font-weight:bold;';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });

    var set = _getKwSet();
    var badWords = Object.keys(set.bad);
    var matches = [];
    document.querySelectorAll('[data-ja-trans="1"]').forEach(function (textEl) {
      // _jaRawTextはattachButton実行時点のスナップショットで、ページによっては
      // レビュー本文がその後非同期に描画されて空文字のまま取り残ることがあるため、
      // ここでは翻訳ボタンと同じ方式でその場のinnerTextを読み直す。
      var clone = textEl.cloneNode(true);
      clone.querySelectorAll('.' + BTN_CLASS + ',.' + RESULT_CLASS + ',.ja-rebtn,.ja-rep-btn,.' + AI_RESULT_CLASS + ',.ja-lang-badge')
        .forEach(function (el) { el.remove(); });
      var rawText = clone.innerText.trim();
      if (!rawText) rawText = textEl._jaRawText || '';
      var hits = badWords.filter(function (w) { return rawText.indexOf(w) >= 0; });
      if (hits.length) matches.push({ textEl: textEl, rawText: rawText, hits: hits });
    });

    hdrTitle.textContent = '🐛 バグ報告の可能性があるレビュー（' + matches.length + '件）';
    hdr.appendChild(hdrTitle); hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    var note = document.createElement('div');
    note.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:12px;';
    note.textContent = '💡 現在ページに読み込まれているレビューの中から、バグ・不具合系キーワードを含むものを抽出しています。クリックで該当レビューへ移動します。';
    panel.appendChild(note);

    if (!matches.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'color:#8f98a0;font-size:12px;padding:20px 0;text-align:center;';
      empty.textContent = 'バグ・不具合に言及するレビューは見つかりませんでした。';
      panel.appendChild(empty);
    } else {
      matches.forEach(function (m) {
        var card = document.createElement('div');
        card.style.cssText = 'padding:10px;margin-bottom:8px;background:rgba(231,76,60,0.06);'
          + 'border:1px solid rgba(231,76,60,0.3);border-radius:4px;cursor:pointer;';
        var kwRow = document.createElement('div');
        kwRow.style.cssText = 'margin-bottom:5px;';
        m.hits.slice(0, 6).forEach(function (w) {
          var chip = document.createElement('span');
          chip.textContent = w;
          chip.style.cssText = 'display:inline-block;margin-right:4px;padding:1px 6px;border-radius:8px;'
            + 'font-size:10px;color:#e74c3c;background:rgba(231,76,60,0.15);border:1px solid #e74c3c;';
          kwRow.appendChild(chip);
        });
        var snippet = document.createElement('div');
        snippet.style.cssText = 'font-size:12px;line-height:1.5;color:#c6d4df;';
        snippet.textContent = m.rawText.length > 200 ? m.rawText.slice(0, 200) + '…' : m.rawText;
        card.appendChild(kwRow); card.appendChild(snippet);
        card.addEventListener('click', function () {
          overlay.remove();
          m.textEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          var prevOutline = m.textEl.style.outline;
          m.textEl.style.outline = '2px solid #e74c3c';
          setTimeout(function () { m.textEl.style.outline = prevOutline; }, 1200);
        });
        panel.appendChild(card);
      });
    }

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  // buckets = [{label, ids}] の配列を、セクション見出し + カプセル画像グリッドとしてcontainerに描画する。
  // 「追加時期別」「価格別」タブ共通で使う。
  function _renderWishBucketSections(container, buckets) {
    buckets.forEach(function (bucket) {
      if (!bucket.ids.length) return;
      var section = document.createElement('div');
      section.style.cssText = 'margin-bottom:14px;';
      var secTitle = document.createElement('div');
      secTitle.style.cssText = 'color:#8fcfa0;font-size:11px;font-weight:bold;margin-bottom:6px;';
      secTitle.textContent = bucket.label + '（' + bucket.ids.length + '件）';
      section.appendChild(secTitle);
      var bGrid = document.createElement('div');
      bGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;';
      bucket.ids.forEach(function (id) {
        var bA = document.createElement('a');
        bA.href = 'https://store.steampowered.com/app/' + id + '/';
        bA.target = '_blank'; bA.rel = 'noopener';
        bA.title = 'App ' + id;
        var bImg = document.createElement('img');
        // capsule_184x69は新しめのappidだと未生成のことが多く欠けが目立つため、
        // より生成率の高いheader.jpgを使う（実機テストで確認: 184x69は0/5、headerは2/5がヒット）。
        bImg.src = 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/header.jpg';
        bImg.style.cssText = 'width:100%;border-radius:3px;display:block;';
        bImg.onerror = function () { bA.style.display = 'none'; };
        bA.appendChild(bImg);
        attachHoverPreview(bA, id);
        bGrid.appendChild(bA);
      });
      section.appendChild(bGrid);
      container.appendChild(section);
    });
  }

  function showWishlistRankPanel() {
    var existing = document.getElementById('ja-wish-rank-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'ja-wish-rank-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483645;'
      + 'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#0f1923;border:1px solid #2d5a3d;border-radius:8px;'
      + 'width:min(90vw,900px);max-height:80vh;overflow-y:auto;padding:20px;color:#c6d4df;';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#66c0f4;font-size:15px;font-weight:bold;';
    hdrTitle.textContent = '🎯 ウィッシュリスト AI判定順一覧';
    var closeBtnW = document.createElement('button');
    closeBtnW.textContent = '✕';
    closeBtnW.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
    closeBtnW.addEventListener('click', function () { overlay.remove(); });
    hdr.appendChild(hdrTitle); hdr.appendChild(closeBtnW);
    panel.appendChild(hdr);

    var note = document.createElement('div');
    note.style.cssText = 'color:#f6c744;font-size:11px;margin-bottom:12px;padding:6px 10px;'
      + 'background:rgba(246,199,68,0.08);border:1px solid rgba(246,199,68,0.3);border-radius:4px;';
    note.textContent = '💡 Steamの仮想スクロール仕様上、実際のウィッシュリストの並び順は変更できません。ここでは一覧表示のみ行います。';
    panel.appendChild(note);

    var sortMode = 'verdict'; // 'verdict' | 'sale'
    var tabRowW = document.createElement('div');
    tabRowW.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;';
    var tabVerdict = document.createElement('button');
    var tabSale = document.createElement('button');
    var tabGroup = document.createElement('button');
    var tabPrice = document.createElement('button');
    var tabCospa = document.createElement('button');
    function wTabStyle(active) {
      return 'padding:6px 12px;border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;'
        + (active ? 'background:#1b2838;color:#f6c744;border:1px solid #f6c744;' : 'background:none;color:#8f98a0;border:1px solid #2a475e;');
    }
    tabVerdict.textContent = '🎯 判定順';
    tabSale.textContent = '📅 セール予定順';
    tabGroup.textContent = '🗂 追加時期別';
    tabPrice.textContent = '💰 価格別';
    tabCospa.textContent = '💎 コスパ順';
    tabVerdict.addEventListener('click', function () { sortMode = 'verdict'; render(); });
    tabSale.addEventListener('click', function () { sortMode = 'sale'; render(); });
    tabGroup.addEventListener('click', function () { sortMode = 'group'; render(); });
    tabPrice.addEventListener('click', function () { sortMode = 'price'; render(); });
    tabCospa.addEventListener('click', function () { sortMode = 'cospa'; render(); });
    tabRowW.appendChild(tabVerdict); tabRowW.appendChild(tabSale); tabRowW.appendChild(tabGroup); tabRowW.appendChild(tabPrice); tabRowW.appendChild(tabCospa);
    panel.appendChild(tabRowW);

    var listWrap = document.createElement('div');
    panel.appendChild(listWrap);

    var VERDICT_ORDER = ['今すぐ買い', '買い', 'セール待ち', '人を選ぶ', '見送り'];

    function render() {
      tabVerdict.style.cssText = wTabStyle(sortMode === 'verdict');
      tabSale.style.cssText = wTabStyle(sortMode === 'sale');
      tabGroup.style.cssText = wTabStyle(sortMode === 'group');
      tabPrice.style.cssText = wTabStyle(sortMode === 'price');
      tabCospa.style.cssText = wTabStyle(sortMode === 'cospa');
      listWrap.textContent = '';
      var w = _getWishlistAppIds();
      if (!w.complete) {
        var incompleteNote = document.createElement('div');
        incompleteNote.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:10px;';
        incompleteNote.textContent = '⚠ 全件一覧を取得できなかったため、現在画面に表示されている ' + w.ids.length + ' 件のみ対象です。';
        listWrap.appendChild(incompleteNote);
      }

      if (sortMode === 'group') {
        if (!Object.keys(_wishDateAddedCache).length) {
          var noDateNote = document.createElement('div');
          noDateNote.style.cssText = 'color:#8f98a0;font-size:11px;padding:12px 0;';
          noDateNote.textContent = '追加日データをまだ取得できていません。少し待ってから開き直してください。';
          listWrap.appendChild(noDateNote);
          return;
        }
        var nowSec = Date.now() / 1000;
        var buckets = [
          { label: '🆕 1ヶ月以内に追加', max: 30 * 86400, ids: [] },
          { label: '📅 1〜3ヶ月前に追加', max: 90 * 86400, ids: [] },
          { label: '📅 3〜6ヶ月前に追加', max: 180 * 86400, ids: [] },
          { label: '📅 半年〜1年前に追加', max: 365 * 86400, ids: [] },
          { label: '🕸 1年以上前に追加', max: Infinity, ids: [] },
          { label: '❔ 追加日不明', max: null, ids: [] }
        ];
        w.ids.forEach(function (id) {
          var added = _wishDateAddedCache[id];
          if (!added) { buckets[5].ids.push(id); return; }
          var age = nowSec - added;
          for (var bi = 0; bi < buckets.length - 1; bi++) {
            if (age <= buckets[bi].max) { buckets[bi].ids.push(id); return; }
          }
        });
        _renderWishBucketSections(listWrap, buckets);
        return;
      }

      if (sortMode === 'price') {
        renderPriceGroups(w);
        return;
      }

      var analyzed = [], unanalyzed = [], unreleasedIds = [];
      w.ids.forEach(function (id) {
        var entry = _aiCache[id];
        if (entry && entry.analysis && entry.analysis.recommendation) analyzed.push(id);
        else if (_isKnownUnreleased(id)) unreleasedIds.push(id);
        else unanalyzed.push(id);
      });

      if (sortMode === 'sale') {
        var withDate = [], withoutDate = [];
        analyzed.forEach(function (id) {
          var a = _aiCache[id].analysis;
          var cand = a.sale_prediction && a.sale_prediction.candidates && a.sale_prediction.candidates[0];
          var days = cand ? _daysUntilJaDate(cand.date) : null;
          if (days != null) withDate.push(id); else withoutDate.push(id);
        });
        withDate.sort(function (a, b) {
          var da = _daysUntilJaDate(_aiCache[a].analysis.sale_prediction.candidates[0].date);
          var db = _daysUntilJaDate(_aiCache[b].analysis.sale_prediction.candidates[0].date);
          return da - db;
        });
        analyzed = withDate.concat(withoutDate);
        if (!withDate.length) {
          var noSaleNote = document.createElement('div');
          noSaleNote.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:10px;';
          noSaleNote.textContent = 'セール予測日が判明しているゲームがありません。';
          listWrap.appendChild(noSaleNote);
        }
      } else if (sortMode === 'cospa') {
        var withHours = [], withoutHours = [];
        analyzed.forEach(function (id) {
          var entry = _aiCache[id];
          var hours = entry.analysis.estimated_hours;
          var price = entry.priceInfo && entry.priceInfo.current;
          if (hours > 0 && price != null) withHours.push(id); else withoutHours.push(id);
        });
        withHours.sort(function (a, b) {
          var ca = _aiCache[a].priceInfo.current / _aiCache[a].analysis.estimated_hours;
          var cb = _aiCache[b].priceInfo.current / _aiCache[b].analysis.estimated_hours;
          return ca - cb;
        });
        analyzed = withHours.concat(withoutHours);
        if (!withHours.length) {
          var noCospaNote = document.createElement('div');
          noCospaNote.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:10px;';
          noCospaNote.textContent = '推定プレイ時間が判明しているゲームがありません。';
          listWrap.appendChild(noCospaNote);
        }
      } else {
        analyzed.sort(function (a, b) {
          var ra = VERDICT_ORDER.indexOf(_aiCache[a].analysis.recommendation.verdict);
          var rb = VERDICT_ORDER.indexOf(_aiCache[b].analysis.recommendation.verdict);
          if (ra < 0) ra = 99; if (rb < 0) rb = 99;
          return ra - rb;
        });
      }

      var countLine = document.createElement('div');
      countLine.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:10px;';
      countLine.textContent = '分析済み ' + analyzed.length + ' 件 / 未分析 ' + unanalyzed.length + ' 件'
        + (unreleasedIds.length ? ' / 発売前 ' + unreleasedIds.length + ' 件' : '') + '（全 ' + w.ids.length + ' 件）';
      listWrap.appendChild(countLine);

      analyzed.forEach(function (id) {
        var entry = _aiCache[id];
        var a = entry.analysis;
        var verdict = a.recommendation.verdict;
        var style = VERDICT_MINI_STYLE[verdict] || VERDICT_MINI_STYLE['人を選ぶ'];
        var row = document.createElement('a');
        row.href = 'https://store.steampowered.com/app/' + id + '/';
        row.target = '_blank';
        row.rel = 'noopener';
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;'
          + 'background:#162520;border:1px solid #1e3828;border-left:3px solid ' + style.color + ';'
          + 'border-radius:5px;text-decoration:none;color:inherit;';
        var thumb = document.createElement('img');
        thumb.src = 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/capsule_sm_120.jpg';
        thumb.style.cssText = 'width:64px;height:30px;object-fit:cover;border-radius:2px;flex-shrink:0;';
        thumb.onerror = function () { thumb.style.display = 'none'; };
        var info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        var nm = document.createElement('div');
        nm.style.cssText = 'color:#e6f0f7;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nm.textContent = a.summary || ('App ' + id);
        var sub = document.createElement('div');
        sub.style.cssText = 'color:#8f98a0;font-size:10px;margin-top:2px;';
        var subParts = [];
        var days = a.sale_prediction && a.sale_prediction.candidates && a.sale_prediction.candidates[0]
          ? _daysUntilJaDate(a.sale_prediction.candidates[0].date) : null;
        if (days != null) subParts.push('⏳あと' + days + '日でセール予測');
        if (sortMode === 'cospa' && a.estimated_hours > 0 && entry.priceInfo && entry.priceInfo.current != null) {
          subParts.push('💎 ¥' + Math.round(entry.priceInfo.current / a.estimated_hours) + '/時間（目安' + a.estimated_hours + '時間）');
        } else if (a.price_advice) {
          subParts.push(a.price_advice);
        }
        sub.textContent = subParts.join(' · ');
        info.appendChild(nm); info.appendChild(sub);
        var vBadge = document.createElement('span');
        vBadge.style.cssText = 'flex-shrink:0;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;'
          + 'color:' + style.color + ';background:' + style.bg + ';border:1px solid ' + style.border + ';';
        vBadge.textContent = verdict;
        row.appendChild(thumb); row.appendChild(info); row.appendChild(vBadge);
        attachHoverPreview(row, id);
        listWrap.appendChild(row);
      });

      if (unanalyzed.length) {
        var unBox = document.createElement('div');
        unBox.style.cssText = 'margin-top:10px;padding:10px;background:rgba(143,152,160,0.06);border-radius:5px;';
        var unLabel = document.createElement('div');
        unLabel.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:8px;';
        unLabel.textContent = '📊 未分析 ' + unanalyzed.length + ' 件';
        unBox.appendChild(unLabel);
        var batchBtn = document.createElement('button');
        batchBtn.textContent = '🤖 次の' + Math.min(WISH_RANK_BATCH, unanalyzed.length) + '件を分析';
        batchBtn.style.cssText = 'padding:7px 14px;background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;'
          + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;';
        batchBtn.addEventListener('click', async function () {
          batchBtn.disabled = true;
          var target = unanalyzed.slice(0, WISH_RANK_BATCH);
          for (var i = 0; i < target.length; i++) {
            batchBtn.textContent = '⏳ 分析中... (' + (i + 1) + '/' + target.length + ')';
            await _fetchAndAnalyzeGameById(target[i]);
            if (i < target.length - 1) await new Promise(function (res) { setTimeout(res, _opts.bulkDelay || 1000); });
          }
          render();
        });
        unBox.appendChild(batchBtn);
        listWrap.appendChild(unBox);
      }

      if (unreleasedIds.length) {
        var relBox = document.createElement('div');
        relBox.style.cssText = 'margin-top:10px;padding:10px;background:rgba(143,152,160,0.06);border-radius:5px;';
        var relLabel = document.createElement('div');
        relLabel.style.cssText = 'color:#8f98a0;font-size:11px;';
        relLabel.textContent = '🕒 発売前 ' + unreleasedIds.length + ' 件（レビューが無いため分析不可）';
        relBox.appendChild(relLabel);
        listWrap.appendChild(relBox);
      }
    }

    var PRICE_BANDS = [
      { label: '🆓 無料', test: function (p) { return p === 0; } },
      { label: '💴 〜999円', test: function (p) { return p > 0 && p < 1000; } },
      { label: '💴 1,000〜1,999円', test: function (p) { return p >= 1000 && p < 2000; } },
      { label: '💴 2,000〜2,999円', test: function (p) { return p >= 2000 && p < 3000; } },
      { label: '💴 3,000〜4,999円', test: function (p) { return p >= 3000 && p < 5000; } },
      { label: '💴 5,000円〜', test: function (p) { return p >= 5000; } },
      { label: '❔ 価格情報なし（未リリース・地域制限等）', test: function (p) { return p == null; } }
    ];
    async function renderPriceGroups(w, forceRefresh) {
      // 価格は1時間程度ではまず変わらないため、前回取得から1時間以内ならSteamに問い合わせず
      // 保存済みキャッシュをそのまま使う。新しくウィッシュリストに追加された分だけ取得すればよい。
      var isStale = !_wishGroupPriceFetchedAt || (Date.now() - _wishGroupPriceFetchedAt > WISH_GROUP_PRICE_TTL);
      var needsFullRefetch = forceRefresh || isStale;
      var missingIds = needsFullRefetch ? w.ids.slice() : w.ids.filter(function (id) { return !(id in _wishGroupPriceCache); });
      if (missingIds.length) {
        listWrap.textContent = '';
        var loadingNote = document.createElement('div');
        loadingNote.style.cssText = 'color:#8f98a0;font-size:11px;padding:12px 0;';
        listWrap.appendChild(loadingNote);
        // ウィッシュリスト全件(100件超もあり得る)を一気に叩くとAkamaiのbot判定に引っかかるため、
        // 同時実行数を絞りチャンク間隔を広めに取る。
        var CHUNK = 4;
        for (var i = 0; i < missingIds.length; i += CHUNK) {
          if (sortMode !== 'price') return; // 取得中にタブを切り替えられたら中断
          var chunk = missingIds.slice(i, i + CHUNK);
          loadingNote.textContent = '⏳ 価格を取得中... (' + Math.min(i + CHUNK, missingIds.length) + '/' + missingIds.length + ')';
          await Promise.all(chunk.map(async function (id) {
            try {
              var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + id + '&filters=price_overview&cc=jp', { signal: _timeoutSignal(6000) });
              var d = r.ok ? await r.json() : null;
              var info = d && d[id] && d[id].data;
              _wishGroupPriceCache[id] = info && info.price_overview ? Math.floor(info.price_overview.final / 100) : (info && info.is_free ? 0 : null);
            } catch (e) { _wishGroupPriceCache[id] = null; }
          }));
          if (i + CHUNK < missingIds.length) await new Promise(function (res) { setTimeout(res, 800); });
        }
        if (sortMode !== 'price') return;
        _wishGroupPriceFetchedAt = Date.now();
        _saveWishGroupPriceCache();
      }

      listWrap.textContent = '';
      var freshRow = document.createElement('div');
      freshRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;color:#8f98a0;font-size:11px;margin-bottom:10px;';
      var freshText = document.createElement('span');
      freshText.textContent = _wishGroupPriceFetchedAt ? ('💰 価格取得: ' + getCacheAgeText(_wishGroupPriceFetchedAt) + '（1時間はキャッシュを再利用します）') : '';
      var refreshBtn = document.createElement('button');
      refreshBtn.textContent = '🔄 最新価格を再取得';
      refreshBtn.style.cssText = 'padding:2px 8px;background:transparent;color:#5a8a65;border:1px solid #2d5a3d;border-radius:3px;cursor:pointer;font-size:10px;';
      refreshBtn.addEventListener('click', function () { renderPriceGroups(w, true); });
      freshRow.appendChild(freshText); freshRow.appendChild(refreshBtn);
      listWrap.appendChild(freshRow);

      var bands = PRICE_BANDS.map(function (b) { return { label: b.label, test: b.test, ids: [] }; });
      w.ids.forEach(function (id) {
        var p = _wishGroupPriceCache[id];
        var band = bands.filter(function (b) { return b.test(p == null ? null : p); })[0];
        (band || bands[bands.length - 1]).ids.push(id);
      });
      _renderWishBucketSections(listWrap, bands);
    }
    render();

    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ── 機能: あなた向けおすすめゲームパネル ──
  // Steamがログインユーザー用に計算済みの好みタグ・レコメンド候補
  // (store.steampowered.com/dynamicstore/userdata/ の rgRecommendedTags / rgRecommendedApps) を利用。
  // APIキー不要・Cookie認証のみで取得できる、ログイン中の自分専用データ。
  var REC_PAGE_SIZE = 8;
  // 候補カード1枚分のDOMを構築。d = {id, name, subtitleText, subtitleColor}
  // 戻り値のcardはグリッドに追加、isUnanalyzedは一括分析対象の判定に使う
  function _buildRecCard(d) {
    var entry = _aiCache[d.id];
    var card = document.createElement('a');
    card.href = 'https://store.steampowered.com/app/' + d.id + '/';
    card.target = '_blank'; card.rel = 'noopener';
    card.dataset.recId = d.id;
    card.style.cssText = 'display:block;background:#162520;border:1px solid #1e3828;border-radius:6px;'
      + 'padding:10px;text-decoration:none;color:inherit;';
    var thumb = document.createElement('img');
    thumb.src = 'https://cdn.akamai.steamstatic.com/steam/apps/' + d.id + '/header.jpg';
    thumb.style.cssText = 'width:100%;border-radius:4px;margin-bottom:6px;';
    thumb.onerror = function () { thumb.style.display = 'none'; };
    var nm = document.createElement('div');
    nm.style.cssText = 'color:#e6f0f7;font-size:12px;font-weight:600;margin-bottom:4px;';
    nm.textContent = d.name;
    card.appendChild(thumb); card.appendChild(nm);

    var isUnanalyzed = !(entry && entry.analysis && entry.analysis.recommendation);
    if (!isUnanalyzed) {
      var verdict = entry.analysis.recommendation.verdict;
      var style = VERDICT_MINI_STYLE[verdict] || VERDICT_MINI_STYLE['人を選ぶ'];
      var vBadge = document.createElement('span');
      vBadge.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;'
        + 'color:' + style.color + ';background:' + style.bg + ';border:1px solid ' + style.border + ';margin-bottom:4px;';
      vBadge.textContent = '🤖 ' + verdict;
      card.appendChild(vBadge);
      if (entry.analysis.summary) {
        var sumR = document.createElement('div');
        sumR.style.cssText = 'color:#8f98a0;font-size:10px;line-height:1.4;';
        sumR.textContent = entry.analysis.summary;
        card.appendChild(sumR);
      }
    } else {
      var unBadge = document.createElement('span');
      unBadge.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;'
        + 'color:#8f98a0;background:rgba(143,152,160,0.1);border:1px solid #4a5a6a;margin-bottom:4px;';
      unBadge.textContent = '📊 未分析';
      card.appendChild(unBadge);
    }
    if (d.subtitleText) {
      var subR = document.createElement('div');
      subR.style.cssText = 'color:' + (d.subtitleColor || '#66c0f4') + ';font-size:11px;margin-top:4px;';
      subR.textContent = d.subtitleText;
      card.appendChild(subR);
    }
    attachHoverPreview(card, d.id);
    return { card: card, isUnanalyzed: isUnanalyzed };
  }

  // 一括分析ボタン + 次へボタンの共通フッター描画
  function _renderRecFooter(footerEl, listWrapEl, unanalyzedIds, hasMore, moreLabel, onMore, onRerender) {
    if (unanalyzedIds.length) {
      var batchBtnR = document.createElement('button');
      batchBtnR.textContent = '🤖 この' + unanalyzedIds.length + '件を一括分析';
      batchBtnR.style.cssText = 'padding:7px 14px;background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;'
        + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;margin-top:10px;';
      batchBtnR.addEventListener('click', async function () {
        batchBtnR.disabled = true;
        for (var i = 0; i < unanalyzedIds.length; i++) {
          batchBtnR.textContent = '⏳ 分析中... (' + (i + 1) + '/' + unanalyzedIds.length + ')';
          await _fetchAndAnalyzeGameById(unanalyzedIds[i]);
          if (i < unanalyzedIds.length - 1) await new Promise(function (res) { setTimeout(res, _opts.bulkDelay || 1000); });
        }
        onRerender();
      });
      listWrapEl.appendChild(batchBtnR);
    }
    if (hasMore) {
      var nextBtnR = document.createElement('button');
      nextBtnR.textContent = moreLabel;
      nextBtnR.style.cssText = 'padding:7px 14px;background:#1b2838;color:#f6c744;border:1px solid #f6c744;'
        + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;';
      nextBtnR.addEventListener('click', onMore);
      footerEl.appendChild(nextBtnR);
    }
  }

  function showRecommendationPanel() {
    var existing = document.getElementById('ja-rec-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'ja-rec-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483645;'
      + 'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#0f1923;border:1px solid #2d5a3d;border-radius:8px;'
      + 'width:min(90vw,900px);max-height:80vh;overflow-y:auto;padding:20px;color:#c6d4df;';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#66c0f4;font-size:15px;font-weight:bold;';
    hdrTitle.textContent = '🎯 あなた向けおすすめゲーム';
    var closeBtnR = document.createElement('button');
    closeBtnR.textContent = '✕';
    closeBtnR.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
    closeBtnR.addEventListener('click', function () { overlay.remove(); });
    hdr.appendChild(hdrTitle); hdr.appendChild(closeBtnR);
    panel.appendChild(hdr);

    var tabRow = document.createElement('div');
    tabRow.style.cssText = 'display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #1e3828;';
    var tabNew = document.createElement('button');
    var tabBacklog = document.createElement('button');
    function tabStyle(active) {
      return 'padding:8px 14px;background:none;border:none;border-bottom:2px solid ' + (active ? '#66c0f4' : 'transparent') + ';'
        + 'color:' + (active ? '#66c0f4' : '#8f98a0') + ';font-size:12px;font-weight:bold;cursor:pointer;font-family:sans-serif;';
    }
    tabNew.textContent = '🎯 新しいおすすめ';
    tabBacklog.textContent = '📦 積みゲー発掘';
    tabRow.appendChild(tabNew); tabRow.appendChild(tabBacklog);
    panel.appendChild(tabRow);

    var body = document.createElement('div');
    body.style.cssText = 'color:#8f98a0;font-size:12px;';
    panel.appendChild(body);

    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    function setActiveTab(tab) {
      tabNew.style.cssText = tabStyle(tab === 'new');
      tabBacklog.style.cssText = tabStyle(tab === 'backlog');
      body.textContent = '';
      if (tab === 'new') renderNewTab(); else renderBacklogTab();
    }
    tabNew.addEventListener('click', function () { setActiveTab('new'); });
    tabBacklog.addEventListener('click', function () { setActiveTab('backlog'); });

    function renderNewTab() {
      body.textContent = '⏳ Steamのおすすめデータを取得中...';
      (async function () {
        var pool = [], tags = [];
        try {
          var r = await fetch('https://store.steampowered.com/dynamicstore/userdata/');
          var j = await r.json();
          var ownedSet = new Set((j.rgOwnedApps || []).map(String));
          var wishSet = new Set((j.rgWishlist || []).map(String));
          pool = (j.rgRecommendedApps || []).map(String).filter(function (id) { return !ownedSet.has(id) && !wishSet.has(id); });
          tags = (j.rgRecommendedTags || []).slice(0, 8).map(function (t) { return t.name; });
        } catch (e) {
          body.textContent = '⚠ Steamのおすすめデータを取得できませんでした（ログイン状態を確認してください）';
          return;
        }
        if (!pool.length) { body.textContent = 'おすすめ候補が見つかりませんでした。'; return; }

        var offset = 0;
        body.textContent = '';

        // 積みゲー vs 新規購入バナー（AI呼び出しなし、所持データのみで判定）
        var ownedGamesForBanner = await new Promise(function (resolve) {
          chrome.storage.local.get(['ja_trans_owned_games_detail_v1'], function (r) { resolve(r['ja_trans_owned_games_detail_v1'] || []); });
        });
        var backlogCountForBanner = ownedGamesForBanner.filter(function (g) { return (g.playtime_forever || 0) < 120; }).length;
        if (backlogCountForBanner >= 10) {
          var banner = document.createElement('div');
          banner.style.cssText = 'margin-bottom:12px;padding:8px 12px;border-radius:4px;'
            + 'background:rgba(246,199,68,0.08);border:1px solid rgba(246,199,68,0.4);'
            + 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;';
          var bannerText = document.createElement('span');
          bannerText.style.cssText = 'color:#f6c744;font-size:11px;';
          bannerText.textContent = '📦 未プレイ・積みゲームが' + backlogCountForBanner + '本あります。新しく買う前に発掘してみませんか？';
          var bannerBtn = document.createElement('button');
          bannerBtn.textContent = '積みゲーを見る →';
          bannerBtn.style.cssText = 'padding:3px 10px;background:#1b2838;color:#f6c744;border:1px solid #f6c744;border-radius:3px;cursor:pointer;font-size:11px;white-space:nowrap;';
          bannerBtn.addEventListener('click', function () { setActiveTab('backlog'); });
          banner.appendChild(bannerText); banner.appendChild(bannerBtn);
          body.appendChild(banner);
        }

        if (tags.length) {
          var tagRow = document.createElement('div');
          tagRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;';
          tags.forEach(function (t) {
            var chip = document.createElement('span');
            chip.style.cssText = 'padding:2px 9px;border-radius:10px;font-size:10px;'
              + 'color:#66c0f4;background:rgba(102,192,244,0.1);border:1px solid rgba(102,192,244,0.3);';
            chip.textContent = t;
            tagRow.appendChild(chip);
          });
          body.appendChild(tagRow);
        }
        var genreRow = document.createElement('div');
        genreRow.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:12px;';
        body.appendChild(genreRow);
        _computeTopGenres().then(function (top5) {
          if (top5.length) genreRow.textContent = '🎮 あなたのジャンル傾向（プレイ時間ベース）: ' + top5.join(' / ');
        });
        var listWrapR = document.createElement('div');
        body.appendChild(listWrapR);
        var footerR = document.createElement('div');
        footerR.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;';
        body.appendChild(footerR);

        async function renderPage() {
          listWrapR.textContent = ''; footerR.textContent = '';
          var pageIds = pool.slice(offset, offset + REC_PAGE_SIZE);
          if (!pageIds.length) { listWrapR.textContent = 'これ以上の候補はありません。'; return; }
          var loadingR = document.createElement('div');
          loadingR.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:8px;';
          loadingR.textContent = '⏳ ゲーム情報を取得中...';
          listWrapR.appendChild(loadingR);

          var details = await Promise.all(pageIds.map(async function (id) {
            try {
              var dr = await fetch('https://store.steampowered.com/api/appdetails?appids=' + id + '&filters=basic,price_overview&cc=jp', { signal: _timeoutSignal(8000) });
              var dd = dr.ok ? await dr.json() : null;
              var info = dd && dd[id] && dd[id].data;
              return { id: id, name: info ? info.name : ('App ' + id), price: info && info.price_overview ? Math.floor(info.price_overview.final / 100) : null, isFree: info && info.is_free };
            } catch (e) { return { id: id, name: 'App ' + id, price: null, isFree: false }; }
          }));

          listWrapR.textContent = '';
          var grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;';
          var unanalyzedIds = [];
          details.forEach(function (d) {
            var built = _buildRecCard({ id: d.id, name: d.name, subtitleText: d.isFree ? '無料プレイ' : (d.price != null ? ('¥' + d.price.toLocaleString()) : ''), subtitleColor: '#66c0f4' });
            if (built.isUnanalyzed) unanalyzedIds.push(d.id);
            grid.appendChild(built.card);
          });
          listWrapR.appendChild(grid);
          _renderRecFooter(footerR, listWrapR, unanalyzedIds, offset + REC_PAGE_SIZE < pool.length,
            '次の' + Math.min(REC_PAGE_SIZE, pool.length - offset - REC_PAGE_SIZE) + '件へ →',
            function () { offset += REC_PAGE_SIZE; renderPage(); }, renderPage);
        }
        renderPage();
      })();
    }

    function renderBacklogTab() {
      body.textContent = '⏳ 所持ゲームデータを読み込み中...';
      chrome.storage.local.get(['ja_trans_owned_games_detail_v1'], function (r) {
        var games = r['ja_trans_owned_games_detail_v1'] || [];
        if (!games.length) {
          body.textContent = '⚠ 所持ゲームデータがありません。「所持ゲーム」ページで「🔄 ライブラリから自動取得」を先に実行してください。';
          return;
        }
        var BACKLOG_THRESHOLD_MIN = 120;
        var pool = games.filter(function (g) { return (g.playtime_forever || 0) < BACKLOG_THRESHOLD_MIN; })
          .sort(function (a, b) { return (a.playtime_forever || 0) - (b.playtime_forever || 0); });
        if (!pool.length) { body.textContent = 'プレイ時間2時間未満の積みゲームは見つかりませんでした。'; return; }

        body.textContent = '';
        var noteEl = document.createElement('div');
        noteEl.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:12px;';
        noteEl.textContent = '💡 所持ゲームのうちプレイ時間2時間未満のもの（' + pool.length + '件）を発掘しました。';
        body.appendChild(noteEl);

        // 気分で1本選ぶルーレット
        var rouletteRow = document.createElement('div');
        rouletteRow.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;align-items:center;flex-wrap:wrap;';
        var moodInput = document.createElement('input');
        moodInput.type = 'text';
        moodInput.placeholder = '今の気分（例: サクッと遊べる、頭を使いたい、まったりしたい）';
        moodInput.style.cssText = 'flex:1;min-width:200px;padding:6px 10px;background:#1b2838;'
          + 'border:1px solid #4a6a8a;border-radius:3px;color:#c6d4df;font-size:12px;';
        var rouletteBtn = document.createElement('button');
        rouletteBtn.textContent = '🎲 気分で1本選ぶ';
        rouletteBtn.style.cssText = 'padding:6px 12px;background:#1b2838;color:#f6c744;border:1px solid #f6c744;'
          + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;white-space:nowrap;';
        rouletteRow.appendChild(moodInput); rouletteRow.appendChild(rouletteBtn);
        body.appendChild(rouletteRow);
        var rouletteResult = document.createElement('div');
        rouletteResult.style.cssText = 'margin-bottom:14px;max-width:320px;';
        body.appendChild(rouletteResult);
        rouletteBtn.addEventListener('click', async function () {
          if (!_geminiKeyCache && !_1minKeyCache) { toast('APIキーが必要です', '#f6c744'); return; }
          rouletteBtn.disabled = true;
          rouletteResult.textContent = '⏳ AIが積みゲーから選んでいます...';
          rouletteResult.style.color = '#8f98a0';
          rouletteResult.style.fontSize = '11px';
          try {
            var mood = moodInput.value.trim() || 'とくに指定なし、おまかせ';
            // プロンプトが長くなりすぎないよう候補数を絞る（poolは既にプレイ時間の少ない順）
            var candidates = pool.slice(0, 80);
            var listText = candidates.map(function (g, i) { return (i + 1) + '. ' + g.name; }).join('\n');
            var prompt = 'あなたはゲーム選びのアドバイザーです。以下は積みゲー（未プレイ・低プレイ時間）のリストです。'
              + '今の気分「' + mood + '」に一番合う1本を選び、日本語で理由（40字以内）とともに教えてください。'
              + 'JSON形式のみで返答すること: {"name":"リスト内のゲーム名をそのまま","reason":"選んだ理由"}\n\n' + listText;
            var pick = await _aiJson(prompt);
            var matched = candidates.filter(function (g) { return g.name === pick.name; })[0]
              || candidates.filter(function (g) { return pick.name && g.name.indexOf(pick.name) >= 0; })[0];
            rouletteResult.textContent = '';
            rouletteResult.style.fontSize = '';
            if (!matched) { rouletteResult.textContent = '⚠ 候補と一致するゲームが見つかりませんでした。もう一度試してください。'; rouletteResult.style.color = '#8f98a0'; rouletteResult.style.fontSize = '11px'; return; }
            var built = _buildRecCard({ id: String(matched.appid), name: matched.name, subtitleText: '🎲 ' + (pick.reason || ''), subtitleColor: '#f6c744' });
            rouletteResult.appendChild(built.card);
          } catch (e) {
            rouletteResult.textContent = '⚠ 選出に失敗しました: ' + (e && e.message);
            rouletteResult.style.color = '#e74c3c';
            rouletteResult.style.fontSize = '11px';
          } finally {
            rouletteBtn.disabled = false;
          }
        });

        var offset = 0;
        var listWrapB = document.createElement('div');
        body.appendChild(listWrapB);
        var footerB = document.createElement('div');
        footerB.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;';
        body.appendChild(footerB);

        function renderPage() {
          listWrapB.textContent = ''; footerB.textContent = '';
          var pageGames = pool.slice(offset, offset + REC_PAGE_SIZE);
          var grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;';
          var unanalyzedIds = [];
          pageGames.forEach(function (g) {
            var mins = g.playtime_forever || 0;
            var subtitle = mins === 0 ? '🕐 未プレイ' : ('🕐 ' + mins + '分プレイ');
            var built = _buildRecCard({ id: String(g.appid), name: g.name, subtitleText: subtitle, subtitleColor: '#f6c744' });
            if (built.isUnanalyzed) unanalyzedIds.push(String(g.appid));
            _fetchAchievementProgress(g.appid).then(function (prog) {
              if (!prog) return;
              var achBadge = document.createElement('span');
              achBadge.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;'
                + 'color:#c6a84a;background:rgba(198,168,74,0.12);border:1px solid #c6a84a;margin-top:4px;';
              achBadge.textContent = '🏆 ' + prog.unlocked + '/' + prog.total + ' (' + Math.round(prog.unlocked / prog.total * 100) + '%)';
              built.card.appendChild(achBadge);
            });
            _fetchHasRecentUpdate(g.appid).then(function (hasUpdate) {
              if (!hasUpdate) return;
              var updBadge = document.createElement('span');
              updBadge.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;'
                + 'color:#4caf50;background:rgba(76,175,80,0.12);border:1px solid #4caf50;margin-top:4px;margin-left:4px;';
              updBadge.textContent = '🆕 最近アップデートあり';
              built.card.appendChild(updBadge);
            });
            grid.appendChild(built.card);
          });
          listWrapB.appendChild(grid);
          _renderRecFooter(footerB, listWrapB, unanalyzedIds, offset + REC_PAGE_SIZE < pool.length,
            '次の' + Math.min(REC_PAGE_SIZE, pool.length - offset - REC_PAGE_SIZE) + '件へ →',
            function () { offset += REC_PAGE_SIZE; renderPage(); }, renderPage);
        }
        renderPage();
      });
    }

    setActiveTab('new');
  }

  // ── ゲームページ本体のレビュースコアを日本語化 ──
  var _pageScoreDone = false;
  function localizePageReviewScore() {
    if (_pageScoreDone) return;
    // ゲーム詳細ページ: #userReviews や .user_reviews_summary_row のスコアテキスト
    var scoreContainers = document.querySelectorAll(
      '.user_reviews_summary_bar .user_reviews_header_label,'
      + '#userReviews .summary_section,'
      + '.user_reviews_filter_score,'
      + '.responsive_reviewtab_ctn .user_review_filter_block'
    );
    scoreContainers.forEach(function (el) {
      if (el.querySelector('.ja-score-badge')) return;
      var scoreEl = el.querySelector('.game_review_summary,[class*="reviewSummary"],[class*="review_summary"]');
      if (!scoreEl) return;
      var text = scoreEl.textContent.trim();
      var m = STEAM_SCORE_MAP[text];
      if (!m) return;
      var badge = document.createElement('span');
      badge.className = 'ja-score-badge';
      badge.style.cssText = 'display:inline-block;margin-left:8px;padding:1px 8px;border-radius:10px;'
        + 'font-size:11px;font-weight:bold;font-family:sans-serif;vertical-align:middle;'
        + 'background:rgba(0,0,0,0.3);color:' + m.color + ';border:1px solid ' + m.color + ';';
      badge.textContent = m.ja;
      scoreEl.parentNode.insertBefore(badge, scoreEl.nextSibling);
      _pageScoreDone = true;
    });

    // overall review header (`.summary_column` style older Steam UI)
    document.querySelectorAll('.summary_column:not([data-ja-score])').forEach(function (col) {
      col.dataset.jaScore = '1';
      var scoreEl = col.querySelector('.game_review_summary');
      if (!scoreEl) return;
      var text = scoreEl.textContent.trim();
      var m = STEAM_SCORE_MAP[text];
      if (!m || col.querySelector('.ja-score-badge')) return;
      var badge = document.createElement('div');
      badge.className = 'ja-score-badge';
      badge.style.cssText = 'margin-top:2px;font-size:12px;font-weight:bold;font-family:sans-serif;color:' + m.color + ';';
      badge.textContent = m.ja;
      scoreEl.parentNode.insertBefore(badge, scoreEl.nextSibling);
      _pageScoreDone = true;
    });
  }

  // ── 親要素のクリップ解除 ──
  function fixParentOverflow(el) {
    var cur = el.parentElement;
    for (var i = 0; i < 8; i++) {
      if (!cur || cur === document.body) break;
      var cs = window.getComputedStyle(cur);
      if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') cur.style.overflow = 'visible';
      if (cs.maxHeight && cs.maxHeight !== 'none' && cs.maxHeight !== '0px') cur.style.maxHeight = 'none';
      cur = cur.parentElement;
    }
  }

  // ── テキスト選択ツールチップ翻訳 ──
  function initSelectionTooltip() {
    var tooltip = null;
    document.addEventListener('mouseup', async function (e) {
      if (tooltip && tooltip.contains(e.target)) return;
      if (tooltip) { tooltip.remove(); tooltip = null; }
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (!text || text.length < 3 || text.length > 600) return;
      if (e.target.closest && e.target.closest('.ja-tooltip,.' + BTN_CLASS + ',.' + RESULT_CLASS + ',#ja-settings-overlay,#ja-history-panel')) return;

      tooltip = document.createElement('div');
      tooltip.className = 'ja-tooltip';
      tooltip.style.cssText = 'position:fixed;z-index:2147483646;'
        + 'background:#1b2838;border:1px solid #66c0f4;border-radius:4px;'
        + 'padding:8px 10px;max-width:320px;min-width:140px;font-size:12px;font-family:sans-serif;'
        + 'color:#c6d4df;box-shadow:0 4px 12px rgba(0,0,0,0.5);pointer-events:auto;';

      var range = sel.getRangeAt(0).getBoundingClientRect();
      var tipTop = range.top - 72;
      if (tipTop < 8) tipTop = range.bottom + 8;
      tooltip.style.left = Math.max(8, Math.min(range.left, window.innerWidth - 340)) + 'px';
      tooltip.style.top = tipTop + 'px';

      var hdrRow = document.createElement('div');
      hdrRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
      var hdrLabel = document.createElement('span');
      hdrLabel.style.cssText = 'color:#66c0f4;font-size:10px;';
      hdrLabel.textContent = '選択テキスト翻訳';
      var closeX = document.createElement('button');
      closeX.textContent = '✕';
      closeX.style.cssText = 'background:none;border:none;color:#8f98a0;cursor:pointer;font-size:11px;padding:0;margin-left:8px;';
      closeX.addEventListener('click', function () { if (tooltip) { tooltip.remove(); tooltip = null; } });
      hdrRow.appendChild(hdrLabel); hdrRow.appendChild(closeX);
      tooltip.appendChild(hdrRow);

      var body = document.createElement('div');
      body.style.cssText = 'color:#8f98a0;font-size:11px;';
      body.textContent = '翻訳中...';
      tooltip.appendChild(body);
      document.body.appendChild(tooltip);

      var result = await translate(text);
      if (!tooltip || !tooltip.parentNode) return;
      body.textContent = '';
      if (result) {
        renderWithHighlight(body, result);
        body.style.color = '#c6d4df';
        body.style.lineHeight = '1.5';
        // コピーボタン
        var cpRow = document.createElement('div');
        cpRow.style.cssText = 'margin-top:6px;text-align:right;';
        var cpBtn = document.createElement('button');
        cpBtn.textContent = '📋';
        cpBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;color:#8f98a0;padding:0;';
        cpBtn.addEventListener('click', function () { copyToClipboard(result); });
        cpRow.appendChild(cpBtn);
        tooltip.appendChild(cpRow);
      } else {
        body.textContent = '翻訳失敗';
        setTimeout(function () { if (tooltip) { tooltip.remove(); tooltip = null; } }, 2000);
      }
    });
    document.addEventListener('mousedown', function (e) {
      if (tooltip && !tooltip.contains(e.target)) { tooltip.remove(); tooltip = null; }
    });
  }

  // ── レビューバッジの日本語化 ──
  var BADGE_MAP = {
    'Recommended':     { ja: 'おすすめ ✓',      color: '#66c0f4' },
    'Not Recommended': { ja: 'おすすめしない ✗', color: '#e74c3c' },
    'Informational':   { ja: '情報提供',          color: '#f6c744' },
  };
  function localizeReviewBadges() {
    // Steamのレビューカード内タイトル (.title) を対象
    document.querySelectorAll('.title:not([data-ja-badge])').forEach(function (el) {
      var t = el.textContent.trim();
      var mapped = BADGE_MAP[t];
      if (mapped) {
        el.dataset.jaBadge = '1';
        el.textContent = mapped.ja;
        el.style.color = mapped.color;
      }
    });
    // apphub_ReviewScore 内のテキストも対象
    document.querySelectorAll('.apphub_ReviewScore .thumbsup:not([data-ja-badge]),.apphub_ReviewScore .thumbsdown:not([data-ja-badge])').forEach(function (el) {
      el.dataset.jaBadge = '1';
      if (el.classList.contains('thumbsup'))   { el.title = 'おすすめ'; }
      if (el.classList.contains('thumbsdown')) { el.title = 'おすすめしない'; }
    });
  }

  // ── ゲームタグ翻訳 ──
  var _tagTransDone = false;
  function translateGameTags() {
    if (_tagTransDone) return;
    var tags = Array.from(document.querySelectorAll('.app_tag:not([data-ja-tag]),.glance_tag:not([data-ja-tag])'));
    if (!tags.length) return;
    var texts = tags.map(function (t) { return t.textContent.trim(); }).filter(function (t) { return t && t !== '+'; });
    if (!texts.length) return;
    _tagTransDone = true;
    translate(texts.join(' | ')).then(function (result) {
      if (!result) return;
      var parts = result.split(/\s*\|\s*/);
      var i = 0;
      tags.forEach(function (el) {
        var orig = el.textContent.trim();
        if (!orig || orig === '+') return;
        el.dataset.jaTag = '1';
        if (parts[i]) {
          el.dataset.origTag = orig;
          el.title = orig;
          el.textContent = parts[i];
        }
        i++;
      });
    });
  }

  // ── 翻訳履歴パネル ──
  function showHistoryPanel() {
    var existing = document.getElementById('ja-history-panel');
    if (existing) { existing.remove(); return; }

    var panel = document.createElement('div');
    panel.id = 'ja-history-panel';
    panel.style.cssText = 'position:fixed;right:60px;bottom:60px;width:380px;max-height:480px;'
      + 'background:#1b2838;border:1px solid #66c0f4;border-radius:6px;'
      + 'z-index:2147483643;font-family:sans-serif;overflow:hidden;display:flex;flex-direction:column;'
      + 'box-shadow:0 4px 20px rgba(0,0,0,0.6);';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#171d25;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2a475e;flex-shrink:0;';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#66c0f4;font-size:13px;font-weight:bold;';
    hdrTitle.textContent = '📜 翻訳履歴';
    var hdrBtns = document.createElement('div');
    hdrBtns.style.cssText = 'display:flex;align-items:center;gap:8px;';
    var clearBtn = document.createElement('button');
    clearBtn.textContent = '🗑 クリア';
    clearBtn.style.cssText = 'background:none;border:none;color:#e74c3c;cursor:pointer;font-size:11px;';
    clearBtn.addEventListener('click', function () { _history = []; panel.remove(); });
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#8f98a0;cursor:pointer;font-size:14px;';
    closeBtn.addEventListener('click', function () { panel.remove(); });
    hdrBtns.appendChild(clearBtn); hdrBtns.appendChild(closeBtn);
    hdr.appendChild(hdrTitle); hdr.appendChild(hdrBtns);

    var list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;flex:1;';

    if (!_history.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'color:#8f98a0;font-size:12px;text-align:center;padding:24px;';
      empty.textContent = '翻訳履歴はまだありません';
      list.appendChild(empty);
    } else {
      _history.forEach(function (item) {
        var row = document.createElement('div');
        row.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(42,71,94,0.5);cursor:pointer;';
        row.addEventListener('mouseenter', function () { row.style.background = 'rgba(102,192,244,0.05)'; });
        row.addEventListener('mouseleave', function () { row.style.background = ''; });

        var origEl = document.createElement('div');
        origEl.style.cssText = 'color:#8f98a0;font-size:10px;margin-bottom:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
        var info = LANG_INFO[item.lang] || { flag: '🌐' };
        origEl.textContent = info.flag + ' ' + item.text;
        var resultEl = document.createElement('div');
        resultEl.style.cssText = 'color:#c6d4df;font-size:12px;line-height:1.4;';
        resultEl.textContent = item.result;
        var footRow = document.createElement('div');
        footRow.style.cssText = 'display:flex;justify-content:space-between;margin-top:4px;';
        var timeEl = document.createElement('span');
        timeEl.style.cssText = 'color:#4a5a6a;font-size:10px;';
        var diff = Math.floor((Date.now() - item.time) / 60000);
        timeEl.textContent = diff < 1 ? 'たった今' : diff + '分前';
        var cpBtn = document.createElement('button');
        cpBtn.textContent = '📋';
        cpBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;color:#8f98a0;padding:0;';
        cpBtn.addEventListener('click', function (e) { e.stopPropagation(); copyToClipboard(item.result); });
        footRow.appendChild(timeEl); footRow.appendChild(cpBtn);

        row.appendChild(origEl); row.appendChild(resultEl); row.appendChild(footRow);
        list.appendChild(row);
      });
    }

    panel.appendChild(hdr); panel.appendChild(list);
    document.body.appendChild(panel);
  }

  // ── プレイ時間パース ──
  function parsePlaytime(card) {
    var txt = card.innerText || '';
    var m = txt.match(/([\d,]+(?:\.\d+)?)\s*hrs?\s*on\s*record/i)
           || txt.match(/([\d,]+(?:\.\d+)?)\s*時間/) ;
    if (!m) return null;
    return parseFloat(m[1].replace(/,/g, ''));
  }

  // ── ボタン追加 ──
  function attachButton(textEl) {
    if (textEl.dataset.jaTrans) return;
    textEl.dataset.jaTrans = '1';

    fixParentOverflow(textEl);

    var rawText = textEl.innerText || '';
    textEl._jaRawText = rawText;
    var lang = detectLang(rawText);
    textEl.dataset.jaLang = lang;

    // 推薦/非推薦バッジ（レビューカードのみ）
    var card = textEl.closest('[class*="apphub_Card"],[class*="review_card"],[class*="ReviewCard"]');
    if (card && !card.querySelector('.ja-rec-badge')) {
      var thumbUp = card.querySelector('.thumbsUpIcon,.thumbsup,[class*="thumbsUp"],[class*="ThumbsUp"]');
      var thumbDn = card.querySelector('.thumbsDownIcon,.thumbsdown,[class*="thumbsDown"],[class*="ThumbsDown"]');
      var recText = card.querySelector('.title');
      var isPos = thumbUp && !thumbDn ? true : thumbDn && !thumbUp ? false : null;
      if (isPos === null && recText) {
        var rt = recText.textContent.trim();
        if (rt === 'Recommended' || rt === 'おすすめ ✓') isPos = true;
        else if (rt === 'Not Recommended' || rt === 'おすすめしない ✗') isPos = false;
      }
      if (isPos !== null) {
        var recBadge = document.createElement('span');
        recBadge.className = 'ja-rec-badge';
        recBadge.style.cssText = 'display:inline-block;margin-top:6px;margin-right:6px;padding:2px 8px;'
          + 'border-radius:10px;font-size:11px;font-family:sans-serif;vertical-align:middle;font-weight:bold;'
          + (isPos
            ? 'background:rgba(76,175,80,0.15);color:#4caf50;border:1px solid #4caf50;'
            : 'background:rgba(231,76,60,0.15);color:#e74c3c;border:1px solid #e74c3c;');
        recBadge.textContent = isPos ? '👍 おすすめ' : '👎 非推薦';
        textEl.appendChild(recBadge);
      }
    }

    // プレイ時間バッジ
    if (card && !card.querySelector('.ja-hours-badge')) {
      var hrs = parsePlaytime(card);
      if (hrs > 0) {
        var hrsBadge = document.createElement('span');
        hrsBadge.className = 'ja-hours-badge';
        hrsBadge.style.cssText = 'display:inline-block;margin-top:6px;margin-right:6px;padding:2px 7px;'
          + 'border-radius:10px;font-size:11px;font-family:sans-serif;vertical-align:middle;'
          + 'background:rgba(102,192,244,0.12);color:#66c0f4;border:1px solid #2a475e;';
        hrsBadge.textContent = '⏱ ' + (hrs >= 1000 ? Math.round(hrs / 100) / 10 + 'k' : hrs) + 'h';
        hrsBadge.title = hrs + '時間プレイ済み';
        textEl.appendChild(hrsBadge);
      }
    }

    // 機能27: 感情スコアバー
    (function() {
      var score = calcSentimentScore(rawText);
      if (score === null || score === 0) return;
      var posW = score > 0 ? Math.abs(score) : 0;
      var negW = score < 0 ? Math.abs(score) : 0;
      var barWrap = document.createElement('span');
      barWrap.style.cssText = 'display:inline-block;width:56px;height:4px;background:#2a475e;border-radius:2px;vertical-align:middle;margin-top:6px;margin-right:4px;overflow:hidden;';
      barWrap.title = '感情スコア: +' + (score > 0 ? score : 0) + ' / -' + (score < 0 ? Math.abs(score) : 0);
      if (score > 0) {
        var fill = document.createElement('div');
        fill.style.cssText = 'height:100%;background:#4caf50;width:' + Math.min(posW, 100) + '%;border-radius:2px;';
        barWrap.appendChild(fill);
      } else {
        var fill = document.createElement('div');
        fill.style.cssText = 'height:100%;background:#e74c3c;width:' + Math.min(negW, 100) + '%;border-radius:2px;margin-left:auto;';
        barWrap.appendChild(fill);
      }
      textEl.appendChild(barWrap);
    })();

    // 言語バッジ
    if (_opts.langBadge && lang !== 'JA') {
      var info = LANG_INFO[lang] || LANG_INFO.EN;
      var badge = document.createElement('span');
      badge.className = 'ja-lang-badge';
      badge.dataset.lang = lang;
      badge.style.cssText = 'display:inline-block;margin-top:6px;padding:2px 6px;'
        + 'background:rgba(0,0,0,0.35);color:' + info.color + ';'
        + 'border:1px solid ' + info.color + ';border-radius:10px;'
        + 'font-size:11px;font-family:sans-serif;vertical-align:middle;margin-right:6px;';
      badge.textContent = info.flag + ' ' + lang;
      textEl.appendChild(badge);
    }

    // スポイラー警告
    var SPOILER_KW = ['ラスボス','ラスト','エンディング','結末','真相','黒幕','真犯人','ネタバレ',
      'last boss','ending','final boss','true ending','spoiler','plot twist','死ぬ','死んだ',
      '裏切','正体','the killer','who did it'];
    var rawLower = rawText.toLowerCase();
    var hasSpoiler = SPOILER_KW.some(function (kw) { return rawLower.indexOf(kw) >= 0; });
    if (hasSpoiler && !textEl.querySelector('.ja-spoiler-wrap')) {
      var spoilerNodes = [];
      textEl.childNodes.forEach(function (n) {
        if (n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && !n.classList.contains('ja-rec-badge') && !n.classList.contains('ja-hours-badge') && !n.classList.contains('ja-lang-badge'))) {
          spoilerNodes.push(n);
        }
      });
      if (spoilerNodes.length) {
        var spWrap = document.createElement('div');
        spWrap.className = 'ja-spoiler-wrap';
        spWrap.style.cssText = 'position:relative;';
        var spOverlay = document.createElement('div');
        spOverlay.style.cssText = 'position:absolute;inset:0;background:rgba(15,25,35,0.92);'
          + 'display:flex;align-items:center;justify-content:center;border-radius:3px;cursor:pointer;z-index:1;';
        var spLabel = document.createElement('span');
        spLabel.style.cssText = 'color:#f6c744;font-size:12px;font-weight:bold;font-family:sans-serif;'
          + 'background:rgba(0,0,0,0.5);padding:4px 12px;border-radius:10px;border:1px solid #f6c744;';
        spLabel.textContent = '⚠ ネタバレを含む可能性 — クリックして表示';
        spOverlay.appendChild(spLabel);
        spOverlay.addEventListener('click', function () { spOverlay.remove(); });
        spoilerNodes.forEach(function (n) { spWrap.appendChild(n); });
        spWrap.appendChild(spOverlay);
        textEl.insertBefore(spWrap, textEl.firstChild);
      }
    }

    // 翻訳ボタン
    var btn = document.createElement('button');
    btn.className = BTN_CLASS;
    btn.textContent = '日本語に翻訳';
    btn.style.cssText = 'display:inline-block;margin-top:8px;padding:4px 12px;'
      + 'background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;'
      + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;';

    var reBtn = document.createElement('button');
    reBtn.className = 'ja-rebtn';
    reBtn.textContent = '再翻訳';
    reBtn.style.cssText = 'display:none;margin-top:8px;margin-left:6px;padding:4px 10px;'
      + 'background:#1b2838;color:#c6d4df;border:1px solid #4a5a6a;'
      + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;';

    async function doTranslate() {
      textEl.querySelector('.' + RESULT_CLASS) && textEl.querySelector('.' + RESULT_CLASS).remove();
      btn.textContent = '翻訳中...';
      btn.disabled = true;
      reBtn.disabled = true;

      var clone = textEl.cloneNode(true);
      clone.querySelectorAll('.' + BTN_CLASS + ',.' + RESULT_CLASS + ',.ja-rebtn,.ja-rep-btn,.' + AI_RESULT_CLASS + ',.ja-lang-badge')
        .forEach(function (el) { el.remove(); });
      var text = clone.innerText.trim();

      // 機能12: 最小文字数フィルター
      var minLen = _opts.minReviewLength || 0;
      if (minLen > 0 && text.length < minLen) {
        var skipDiv = document.createElement('div');
        skipDiv.className = RESULT_CLASS;
        skipDiv.style.cssText = 'margin-top:8px;padding:6px 10px;background:rgba(143,152,160,0.08);'
          + 'border-left:3px solid #4a5a6a;color:#8f98a0;font-size:11px;font-family:sans-serif;';
        skipDiv.textContent = '⏭ 短すぎてスキップ（' + text.length + '字 < 設定' + minLen + '字）';
        textEl.appendChild(skipDiv);
        btn.textContent = '翻訳を閉じる';
        btn.disabled = false;
        reBtn.style.display = 'inline-block';
        reBtn.disabled = false;
        return;
      }

      var rawResult = await translate(text);
      var result = rawResult;
      if (rawResult) {
        // 機能17: 用語辞書適用
        await new Promise(function(resolve) {
          applyGlossary(rawResult, function(applied) { result = applied; resolve(); });
        });
      }
      if (result) {
        addToHistory(text, result, lang);
        // 未知単語を抽出してAI分類キューに追加
        extractCandidates(result).forEach(function (w) { _pendingKw.add(w); });
        scheduleClassify();

        var div = document.createElement('div');
        div.className = RESULT_CLASS;
        div.style.cssText = 'margin-top:8px;padding:8px;'
          + 'background:rgba(102,192,244,0.07);border-left:3px solid #66c0f4;'
          + 'color:#c6d4df;font-size:0.88em;line-height:1.6;font-family:sans-serif;'
          + 'word-wrap:break-word;overflow-wrap:break-word;'
          + 'max-width:100%;box-sizing:border-box;';

        // ラベル + コピーボタン行
        var labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
        var label = document.createElement('span');
        label.style.cssText = 'color:#66c0f4;font-size:0.78em;';
        label.textContent = _opts.transEngine === 'gemini' ? '🤖 Gemini翻訳（文脈）' : _opts.transEngine === '1min' ? '🤖 1min.ai翻訳' : _opts.geminiTranslate ? '🤖 Gemini翻訳' : '日本語訳';
        var copyBtn2 = document.createElement('button');
        copyBtn2.textContent = '📋';
        copyBtn2.title = 'コピー';
        copyBtn2.style.cssText = 'background:none;border:none;cursor:pointer;font-size:13px;padding:0 2px;opacity:0.7;';
        copyBtn2.addEventListener('click', function () { copyToClipboard(result); });
        // 機能: 読み上げボタン（対応環境のみ表示）
        var speakBtn = null;
        if (_ttsAvailable()) {
          speakBtn = document.createElement('button');
          speakBtn.textContent = '🔊';
          speakBtn.title = '読み上げ';
          speakBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:13px;padding:0 2px;opacity:0.7;';
          speakBtn.addEventListener('click', function () { _speak(result); });
        }
        // 機能1: 翻訳精度フィードバックボタン
        var fbKey = text.slice(0, 60);
        var thumbsUp = document.createElement('button');
        thumbsUp.textContent = '👍';
        thumbsUp.title = '翻訳は良い';
        thumbsUp.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px;opacity:0.6;';
        var thumbsDown = document.createElement('button');
        thumbsDown.textContent = '👎';
        thumbsDown.title = '翻訳を改善';
        thumbsDown.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px;opacity:0.6;';
        thumbsUp.addEventListener('click', function() {
          _transFeedback[fbKey] = 'good';
          thumbsUp.style.opacity = '1'; thumbsDown.style.opacity = '0.6';
          toast('フィードバックありがとうございます', '#4caf50');
        });
        thumbsDown.addEventListener('click', async function() {
          _transFeedback[fbKey] = 'bad';
          thumbsDown.style.opacity = '1'; thumbsUp.style.opacity = '0.6';
          if (_geminiKeyCache || _1minKeyCache) {
            thumbsDown.disabled = true;
            thumbsDown.textContent = '⏳';
            try {
              var improvePrompt = '以下の翻訳を改善してください。より自然な日本語にしてください。\n\n原文: ' + text + '\n\n改善前の翻訳: ' + result;
              var improved = await _aiText(improvePrompt);
              if (improved) {
                textWrap.textContent = '';
                if (_opts.highlight) renderWithHighlight(textWrap, improved);
                else renderPlain(textWrap, improved);
                toast('翻訳を改善しました', '#4caf50');
              }
            } catch(e) { toast('改善翻訳失敗: ' + e.message, '#e74c3c'); }
            thumbsDown.textContent = '👎';
            thumbsDown.disabled = false;
          } else {
            toast('改善翻訳にはAPIキーが必要です', '#f6c744');
          }
        });
        // 機能17: 翻訳信頼度バッジ
        var confScore = calcTranslationConfidence(text, result);
        var confBadge = document.createElement('span');
        var confLabel = confScore >= 80 ? '✓ 高精度' : confScore >= 50 ? '△ 要確認' : '⚠ 不確実';
        var confColor = confScore >= 80 ? '#4caf50' : confScore >= 50 ? '#f6c744' : '#e74c3c';
        confBadge.style.cssText = 'font-size:10px;padding:1px 6px;border-radius:8px;'
          + 'color:' + confColor + ';border:1px solid ' + confColor + ';background:rgba(0,0,0,0.2);'
          + 'margin-left:4px;vertical-align:middle;';
        confBadge.title = '翻訳信頼度スコア: ' + confScore + '/100';
        confBadge.textContent = confLabel;
        labelRow.appendChild(label);
        labelRow.appendChild(confBadge);
        labelRow.appendChild(thumbsUp);
        labelRow.appendChild(thumbsDown);
        if (speakBtn) labelRow.appendChild(speakBtn);
        labelRow.appendChild(copyBtn2);
        div.appendChild(labelRow);

        // 翻訳テキスト（アコーディオン）
        var textWrap = document.createElement('div');
        if (_opts.highlight) renderWithHighlight(textWrap, result);
        else renderPlain(textWrap, result);
        div.appendChild(textWrap);

        // アコーディオン（行数が多い場合）
        var lineCount = result.split('\n').length + Math.floor(result.length / 80);
        if (lineCount > (_opts.accordionLines || 6)) {
          var lineH = 1.6 * 12;
          var maxH = ((_opts.accordionLines || 6) * lineH) + 'px';
          textWrap.style.cssText = 'max-height:' + maxH + ';overflow:hidden;';
          var togRow = document.createElement('div');
          togRow.style.cssText = 'text-align:center;cursor:pointer;color:#66c0f4;font-size:11px;padding:3px;margin-top:2px;border-top:1px solid rgba(102,192,244,0.2);';
          togRow.textContent = '▼ もっと見る';
          var expanded = false;
          togRow.addEventListener('click', function () {
            expanded = !expanded;
            textWrap.style.maxHeight = expanded ? 'none' : maxH;
            textWrap.style.overflow = expanded ? '' : 'hidden';
            togRow.textContent = expanded ? '▲ 折りたたむ' : '▼ もっと見る';
          });
          div.appendChild(togRow);
        }

        textEl.appendChild(div);
        btn.textContent = '翻訳を閉じる';
        btn.disabled = false;
        reBtn.style.display = 'inline-block';
        reBtn.disabled = false;
      } else {
        btn.textContent = '翻訳失敗（再試行）';
        btn.disabled = false;
        toast('翻訳失敗。しばらく待ってから再試行してください。', '#e74c3c');
      }
    }

    btn.addEventListener('click', function () {
      if (textEl.querySelector('.' + RESULT_CLASS)) {
        textEl.querySelector('.' + RESULT_CLASS).remove();
        btn.textContent = '日本語に翻訳';
        reBtn.style.display = 'none';
        return;
      }
      doTranslate();
    });
    reBtn.addEventListener('click', function () { doTranslate(); });

    // 置き換え翻訳ボタン
    var repBtn = document.createElement('button');
    repBtn.className = 'ja-rep-btn';
    repBtn.textContent = '🔄 置き換え';
    repBtn.style.cssText = 'display:inline-block;margin-top:8px;margin-left:6px;padding:4px 10px;'
      + 'background:#1b2838;color:#c6a84a;border:1px solid #c6a84a;'
      + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;';

    repBtn.addEventListener('click', async function () {
      if (textEl.dataset.jaReplaced) {
        textEl.innerHTML = textEl.dataset.jaOrigHtml;
        delete textEl.dataset.jaReplaced;
        delete textEl.dataset.jaOrigHtml;
        delete textEl.dataset.jaTrans;
        attachButton(textEl);
        return;
      }

      var OWN_SEL = '.' + BTN_CLASS + ',.ja-rebtn,.ja-rep-btn,.ja-lang-badge,.' + RESULT_CLASS + ',.' + AI_RESULT_CLASS;
      var SKIP_TAGS = { BUTTON:1, IMG:1, VIDEO:1, AUDIO:1, SCRIPT:1, STYLE:1, SVG:1, CANVAS:1 };
      var OWN_CLS = [BTN_CLASS, RESULT_CLASS, AI_RESULT_CLASS, 'ja-rebtn', 'ja-rep-btn', 'ja-lang-badge'];

      var cleanClone = textEl.cloneNode(true);
      cleanClone.querySelectorAll(OWN_SEL).forEach(function (el) { el.remove(); });
      textEl.dataset.jaOrigHtml = cleanClone.innerHTML;

      var nodes = [];
      var walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.textContent.trim()) return NodeFilter.FILTER_REJECT;
          var p = n.parentElement;
          while (p && p !== textEl) {
            if (SKIP_TAGS[p.tagName]) return NodeFilter.FILTER_REJECT;
            if (OWN_CLS.some(function (c) { return p.classList.contains(c); })) return NodeFilter.FILTER_REJECT;
            p = p.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) nodes.push(walker.currentNode);
      if (!nodes.length) { delete textEl.dataset.jaOrigHtml; return; }

      repBtn.textContent = '置き換え中...';
      repBtn.disabled = true;

      var combined = nodes.map(function (n, i) {
        var t = n.textContent.replace(/\n/g, ' ⧗⧗ ');
        return i === 0 ? t : ('[' + (i - 1) + '] ' + t);
      }).join(' ');

      var translated = null;
      try {
        var r = await _bgFetch(
          'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t&q='
          + encodeURIComponent(combined.slice(0, 5000))
        );
        if (r.ok) {
          var d = await r.json();
          translated = d[0].map(function (s) { return s[0]; }).join('');
          translated = translated.replace(new RegExp('\\s*⧗⧗\\s*', 'g'), '\n');
        }
      } catch (e) {}

      if (!translated) {
        delete textEl.dataset.jaOrigHtml;
        repBtn.textContent = '🔄 置き換え';
        repBtn.disabled = false;
        toast('置き換え翻訳失敗', '#e74c3c');
        return;
      }

      var markerRe = /\s*\[(\d+)\]\s*/g;
      var parts = [], lastEnd = 0, m;
      while ((m = markerRe.exec(translated)) !== null) {
        parts.push(translated.slice(lastEnd, m.index).trim());
        lastEnd = m.index + m[0].length;
      }
      parts.push(translated.slice(lastEnd).trim());

      if (parts.length === nodes.length) {
        nodes.forEach(function (n, i) { setNodeText(n, parts[i]); });
      } else {
        for (var fi = 0; fi < nodes.length; fi++) {
          var orig = nodes[fi].textContent.trim();
          if (!orig) continue;
          var res = await translate(orig);
          if (res) setNodeText(nodes[fi], res);
        }
      }

      textEl.dataset.jaReplaced = '1';
      repBtn.textContent = '🔄 元に戻す';
      repBtn.disabled = false;
    });

    textEl.appendChild(btn);
    textEl.appendChild(reBtn);
    textEl.appendChild(repBtn);

    // 機能: レビューブックマーク
    var bmBtn = document.createElement('button');
    bmBtn.className = 'ja-review-bm-btn';
    bmBtn.textContent = '🔖';
    bmBtn.title = 'このレビューをブックマーク';
    bmBtn.style.cssText = 'display:inline-block;margin-top:8px;margin-left:6px;padding:4px 8px;'
      + 'background:#1b2838;color:#c6a84a;border:1px solid #c6a84a;'
      + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;';
    bmBtn.addEventListener('click', function () {
      var resultEl = textEl.querySelector('.' + RESULT_CLASS);
      var translatedText = resultEl ? resultEl.textContent.trim() : '';
      var titleElBm = document.querySelector('.apphub_AppName,#appHubAppName,.game_title_area .title,[class*="GameTitle"]');
      var gameNameBm = titleElBm ? titleElBm.textContent.trim() : document.title;
      chrome.storage.local.get([REVIEW_BM_KEY], function (r) {
        var list = r[REVIEW_BM_KEY] || [];
        list.unshift({ gameName: gameNameBm, gameId: getGameId(), original: rawText, translated: translatedText, url: location.href, timestamp: Date.now() });
        if (list.length > 5000) list = list.slice(0, 5000);
        var obj = {}; obj[REVIEW_BM_KEY] = list;
        chrome.storage.local.set(obj, function () {
          bmBtn.textContent = '✓';
          toast('🔖 レビューをブックマークしました', '#c6a84a');
          setTimeout(function () { bmBtn.textContent = '🔖'; }, 1500);
        });
      });
    });
    textEl.appendChild(bmBtn);

    // 機能24: コミュニティ投稿AI要約ボタン
    var COMMUNITY_SELS = '.apphub_HomePostBody,.apphub_PostBody,.apphub_CardTextContent,.forum_op .content,.forum_reply .content,.apphub_CardTextContent';
    var isCommunityPost = false;
    try { isCommunityPost = textEl.matches('.apphub_HomePostBody,.apphub_PostBody,.forum_op .content,.forum_reply .content,.apphub_CardTextContent'); } catch(e) {}
    if (isCommunityPost) {
      var sumBtn = document.createElement('button');
      sumBtn.className = 'ja-sum-btn';
      sumBtn.textContent = '🤖 要約';
      sumBtn.style.cssText = 'display:inline-block;margin-top:8px;margin-left:6px;padding:4px 10px;'
        + 'background:#1b2838;color:#8fcfa0;border:1px solid #4caf50;'
        + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;';
      sumBtn.addEventListener('click', async function() {
        if (!_geminiKeyCache && !_1minKeyCache) { toast('要約にはAPIキーが必要です', '#f6c744'); return; }
        var existingSum = textEl.querySelector('.ja-summary-result');
        if (existingSum) { existingSum.remove(); return; }
        sumBtn.disabled = true; sumBtn.textContent = '⏳';
        var clone2 = textEl.cloneNode(true);
        clone2.querySelectorAll('.' + BTN_CLASS + ',.' + RESULT_CLASS + ',.ja-rebtn,.ja-rep-btn,.ja-sum-btn').forEach(function(e){ e.remove(); });
        var text2 = clone2.innerText.trim();
        try {
          var sumPrompt = '以下のSteamコミュニティ投稿を2〜3行で日本語要約してください。\n\n' + text2.slice(0, 3000);
          var sumText = await _aiText(sumPrompt);
          if (sumText) {
            var sumDiv = document.createElement('div');
            sumDiv.className = 'ja-summary-result';
            sumDiv.style.cssText = 'margin-top:6px;padding:6px 10px;background:rgba(76,175,80,0.08);'
              + 'border-left:3px solid #4caf50;color:#c6d4df;font-size:11px;line-height:1.5;font-family:sans-serif;';
            renderLiteMarkdown(sumDiv, '🤖 ' + sumText);
            var firstResult = textEl.querySelector('.' + RESULT_CLASS);
            if (firstResult) textEl.insertBefore(sumDiv, firstResult);
            else textEl.insertBefore(sumDiv, btn);
          }
        } catch(e) { toast('要約失敗: ' + e.message, '#e74c3c'); }
        sumBtn.disabled = false; sumBtn.textContent = '🤖 要約';
      });
      repBtn.parentNode.insertBefore(sumBtn, repBtn.nextSibling);
    }

    if (_opts.autoTranslate && lang !== 'JA') {
      setTimeout(doTranslate, 300);
    }
  }

  var TEXT_SEL = '.uxZHwbCMxnLnMBo894hNi ._1zbKizfCRpoX2D_zOLQes0';
  var FALLBACK_SELS = [
    '.apphub_CardTextContent',
    '.userReviewCardContent',
    '.announcement_body',
    '.postcontent',
    '.update_blurb',
    '.A_A2B6fTn_MPLlGCmsLtd',
    '#game_area_description',
    '.game_description_snippet',
    // 開発者返信
    '.developer_response',
    // ニュース・アップデート・コミュニティ
    '.apphub_HomePostBody',
    '.apphub_PostBody',
    '.workshopItemDescription',
    '.changelog_content',
    '.forum_op .content',
    '.forum_reply .content',
    '.commentthread_comment_text',
  ];

  // ── 言語フィルター ──
  var _langFilter = 'ALL';
  var _playFilter = 0; // hours

  function applyFilters() {
    document.querySelectorAll('[data-ja-trans]').forEach(function (el) {
      var card = el.closest('.apphub_Card,.apphub_UserReviewCardContent,div[class*="Card"]') || el;
      var showLang = (_langFilter === 'ALL') || (el.dataset.jaLang === _langFilter);
      var hrs = parsePlaytime(card);
      var showPlay = (_playFilter === 0) || (hrs !== null && hrs >= _playFilter);
      card.style.display = (showLang && showPlay) ? '' : 'none';
    });
  }

  // ── 機能16: レビュアー信頼性スコア ──
  function calcReviewerTrust(card) {
    var score = 0;

    // プレイ時間（parsePlaytime活用）
    var hrs = parsePlaytime(card) || 0;
    var hrsBadge = card.querySelector('.ja-hours-badge');
    if (hrsBadge) {
      var hm = hrsBadge.textContent.match(/([\d.]+)(k?)h/);
      if (hm) hrs = parseFloat(hm[1]) * (hm[2] ? 1000 : 1);
    }
    if (hrs >= 100)     score += 40;
    else if (hrs >= 10) score += 25;
    else                score += 10;

    // 所持ゲーム数
    var numGames = 0;
    var gamesSelectors = [
      '[class*="numGames"]',
      '[class*="num_games"]',
      '.apphub_CardContentAuthorBlock [class*="games"]',
      '.apphub_CardContentAuthorBlock',
      '.userReviewCardContent [class*="games"]',
    ];
    for (var gi = 0; gi < gamesSelectors.length; gi++) {
      var el = card.querySelector(gamesSelectors[gi]);
      if (el) {
        var m = el.textContent.match(/(\d[\d,]*)\s*(games?|ゲーム)/i);
        if (m) { numGames = parseInt(m[1].replace(/,/g, ''), 10) || 0; break; }
      }
    }
    // フォールバック: authorBlock全体テキストから抽出
    if (!numGames) {
      var authorBlock = card.querySelector('.apphub_CardContentAuthorBlock,[class*="authorBlock"],[class*="AuthorBlock"]');
      if (authorBlock) {
        var am = authorBlock.textContent.match(/(\d[\d,]*)\s*(games?|ゲーム)/i);
        if (am) numGames = parseInt(am[1].replace(/,/g, ''), 10) || 0;
      }
    }
    if (numGames >= 100)     score += 30;
    else if (numGames >= 50) score += 20;
    else                     score += 10;

    // レビュー数
    var numReviews = 0;
    var revSelectors = [
      '[class*="numReviews"]',
      '[class*="num_reviews"]',
      '[class*="reviews_count"]',
    ];
    for (var ri = 0; ri < revSelectors.length; ri++) {
      var rel = card.querySelector(revSelectors[ri]);
      if (rel) {
        var rm = rel.textContent.match(/(\d[\d,]*)/);
        if (rm) { numReviews = parseInt(rm[1].replace(/,/g, ''), 10) || 0; break; }
      }
    }
    // フォールバック: authorBlock内で "reviews" に続く数字
    if (!numReviews) {
      var authorBlock2 = card.querySelector('.apphub_CardContentAuthorBlock,[class*="authorBlock"],[class*="AuthorBlock"]');
      if (authorBlock2) {
        var rvm = authorBlock2.textContent.match(/(\d[\d,]*)\s*(reviews?|レビュー)/i);
        if (rvm) numReviews = parseInt(rvm[1].replace(/,/g, ''), 10) || 0;
      }
    }
    if (numReviews >= 20)     score += 30;
    else if (numReviews >= 5) score += 20;
    else                      score += 10;

    return Math.min(100, score);
  }

  function attachReviewerTrustBadges() {
    document.querySelectorAll('[class*="apphub_Card"],[class*="review_card"],[class*="ReviewCard"]').forEach(function(card) {
      if (card.querySelector('.ja-trust-badge')) return;
      var score = calcReviewerTrust(card);

      var color, label;
      if (score >= 80)      { color = '#4caf50'; label = '⭐ 信頼度 ' + score; }
      else if (score >= 60) { color = '#f6c744'; label = '⭐ 信頼度 ' + score; }
      else                  { color = '#8f98a0'; label = '⭐ 信頼度 ' + score; }

      var badge = document.createElement('span');
      badge.className = 'ja-trust-badge';
      badge.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;'
        + 'font-size:10px;font-family:sans-serif;vertical-align:middle;font-weight:bold;'
        + 'color:' + color + ';background:rgba(0,0,0,0.3);border:1px solid ' + color + ';';
      badge.title = 'プレイ時間・所持ゲーム数・レビュー数から算出した信頼性スコア（0-100）';
      badge.textContent = label;

      // レビュアー名の隣に挿入
      var nameEl = card.querySelector('.persona_name,.playerName,[class*="authorName"],[class*="reviewerName"],[class*="persona_name"]');
      if (nameEl) {
        nameEl.appendChild(badge);
      } else {
        var authorBlock = card.querySelector('.apphub_CardContentAuthorBlock,[class*="authorBlock"],[class*="AuthorBlock"]');
        if (authorBlock) authorBlock.appendChild(badge);
      }
    });
  }

  function scan() {
    var found = 0;
    var langsOnPage = {};

    document.querySelectorAll(TEXT_SEL).forEach(function (el) {
      attachButton(el); found++;
      if (el.dataset.jaLang) langsOnPage[el.dataset.jaLang] = true;
    });
    FALLBACK_SELS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        attachButton(el); found++;
        if (el.dataset.jaLang) langsOnPage[el.dataset.jaLang] = true;
      });
    });

    _scheduleReviewEnrich();
    _updateBugFabVisibility();

    localizeReviewBadges();
    translateGameTags();
    enhanceStoreSearch();
    localizePageReviewScore();
    attachSortControl();
    attachReviewerTrustBadges();

    // 機能22: 開発者返信サマリーボタン
    var devResponses = document.querySelectorAll('.developer_response');
    if (!document.getElementById('ja-dev-summary-btn') && devResponses.length > 0) {
      var devBtn = document.createElement('button');
      devBtn.id = 'ja-dev-summary-btn';
      devBtn.textContent = '🛠 開発者返信を要約';
      devBtn.style.cssText = 'display:inline-block;margin:8px 0;padding:6px 14px;'
        + 'background:#1b2838;color:#8fcfa0;border:1px solid #4caf50;'
        + 'border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;';
      devBtn.addEventListener('click', async function() {
        if (!_geminiKeyCache && !_1minKeyCache) { toast('要約にはAPIキーが必要です', '#f6c744'); return; }
        var existingDevSum = document.getElementById('ja-dev-summary-result');
        if (existingDevSum) { existingDevSum.remove(); return; }
        devBtn.disabled = true; devBtn.textContent = '⏳ 要約中...';
        var devTexts = [];
        devResponses.forEach(function(dr) { devTexts.push(dr.innerText.trim()); });
        try {
          var devPrompt = '以下は開発者のユーザーへの返信です。主な対応内容・修正した問題・開発方針を日本語で箇条書き3〜5個に要約してください。\n\n' + devTexts.join('\n---\n').slice(0, 4000);
          var devSumText = await _aiText(devPrompt);
          if (devSumText) {
            var devSumDiv = document.createElement('div');
            devSumDiv.id = 'ja-dev-summary-result';
            devSumDiv.style.cssText = 'margin:8px 0;padding:10px 14px;background:rgba(76,175,80,0.08);'
              + 'border:1px solid #4caf50;border-radius:4px;color:#c6d4df;font-size:12px;'
              + 'line-height:1.6;font-family:sans-serif;white-space:pre-wrap;';
            renderLiteMarkdown(devSumDiv, devSumText);
            devBtn.parentNode.insertBefore(devSumDiv, devBtn.nextSibling);
          }
        } catch(e) { toast('開発者返信要約失敗: ' + e.message, '#e74c3c'); }
        devBtn.disabled = false; devBtn.textContent = '🛠 開発者返信を要約';
      });
      var firstDev = devResponses[0];
      var devParent = firstDev.parentElement;
      if (devParent) devParent.insertBefore(devBtn, firstDev);
    }

    // 機能13: ウィッシュリスト優先度
    // 2026年現在のSteamウィッシュリストは仮想スクロール方式のReact実装で、
    // data-rfd-draggable-id="WishlistItem-{appid}-{index}" が唯一の安定したフック。
    // クラス名(例: S2Q8eqrNOA4-)はビルド毎に変わるハッシュ値なので使用しない。
    if (location.pathname.includes('/wishlist/')) {
      _requestWishlistSSRIds(); // date_added等をできるだけ早く非同期取得しておく
      var wishRows = Array.from(document.querySelectorAll('[data-rfd-draggable-id^="WishlistItem-"]:not([data-ja-wish]), .wishlistRow:not([data-ja-wish])'));

      wishRows.forEach(function(row) {
        row.dataset.jaWish = '1';
        var appIdWish = null;
        var draggableId = row.getAttribute('data-rfd-draggable-id') || '';
        var idMatch = draggableId.match(/^WishlistItem-(\d+)-/);
        appIdWish = idMatch ? idMatch[1] : _extractAppId(row);
        if (!appIdWish) return;
        attachHoverPreview(row, appIdWish);
        var cacheEntry = _aiCache[appIdWish];

        // タイトルリンク（画像用アンカーではなくテキストを持つ方）を探す
        var wishBadgeEl = null;
        row.querySelectorAll('a[href*="/app/"]').forEach(function(a) {
          if (!wishBadgeEl && a.textContent.trim()) wishBadgeEl = a.parentElement;
        });
        if (!wishBadgeEl) wishBadgeEl = row.querySelector('.wishlist_item_name,.gameName') || row;

        if (!row.querySelector('.ja-wish-badge')) {
          var wishBadge = document.createElement('span');
          wishBadge.className = 'ja-wish-badge';
          wishBadge.dataset.appid = appIdWish;
          if (cacheEntry && cacheEntry.analysis && cacheEntry.analysis.recommendation) {
            var wVerdict = cacheEntry.analysis.recommendation.verdict;
            var wStyle = VERDICT_MINI_STYLE[wVerdict] || VERDICT_MINI_STYLE['人を選ぶ'];
            wishBadge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;'
              + 'font-size:11px;font-family:sans-serif;font-weight:bold;vertical-align:middle;'
              + 'color:' + wStyle.color + ';background:' + wStyle.bg + ';border:1px solid ' + wStyle.border + ';';
            wishBadge.textContent = '🤖 ' + wVerdict;
            wishBadge.dataset.verdictRank = String(['今すぐ買い','買い','セール待ち','人を選ぶ','見送り'].indexOf(wVerdict));
          } else {
            wishBadge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;'
              + 'font-size:11px;font-family:sans-serif;color:#8f98a0;background:rgba(143,152,160,0.1);border:1px solid #4a5a6a;';
            wishBadge.textContent = '📊 未分析';
            wishBadge.dataset.verdictRank = '99';
          }
          wishBadgeEl.appendChild(wishBadge);

          // メモボタン
          var wNoteBtn = document.createElement('span');
          wNoteBtn.className = 'ja-wish-note-btn';
          var wHasNote = _gameNotes[appIdWish] && _gameNotes[appIdWish].text;
          wNoteBtn.textContent = wHasNote ? '📝●' : '📝';
          wNoteBtn.title = wHasNote ? _gameNotes[appIdWish].text.slice(0, 80) : 'メモを追加';
          wNoteBtn.style.cssText = 'display:inline-block;margin-left:6px;cursor:pointer;font-size:12px;vertical-align:middle;opacity:' + (wHasNote ? '1' : '0.5') + ';';
          wNoteBtn.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            var wGameName = wishBadgeEl.textContent ? wishBadgeEl.textContent.replace(/[🤖📝📊⏳▼¥🕸].*$/, '').trim() : '';
            _openNoteEditor(appIdWish, wGameName, wNoteBtn, function (text) {
              wNoteBtn.textContent = text ? '📝●' : '📝';
              wNoteBtn.style.opacity = text ? '1' : '0.5';
              wNoteBtn.title = text ? text.slice(0, 80) : 'メモを追加';
            });
          });
          wishBadgeEl.appendChild(wNoteBtn);

          // セール予測カウントダウン（分析済み・予測日ありの場合のみ）
          var wSalePred = cacheEntry && cacheEntry.analysis && cacheEntry.analysis.sale_prediction;
          var wCandidate = wSalePred && wSalePred.candidates && wSalePred.candidates[0];
          var wDays = wCandidate ? _daysUntilJaDate(wCandidate.date) : null;
          if (wDays != null) {
            var countdownBadge = document.createElement('span');
            countdownBadge.className = 'ja-wish-countdown';
            countdownBadge.style.cssText = 'display:inline-block;margin-left:6px;padding:2px 7px;border-radius:10px;'
              + 'font-size:10px;font-family:sans-serif;color:#f6c744;background:rgba(246,199,68,0.1);border:1px solid rgba(246,199,68,0.4);';
            countdownBadge.textContent = '⏳あと' + wDays + '日';
            countdownBadge.title = wCandidate.name ? (wCandidate.name + '（予測）') : 'セール予測';
            wishBadgeEl.appendChild(countdownBadge);
          }

          // 価格下落バッジ（前回訪問時との比較）
          if (_wishPriceHistoryLoaded) {
            var wPrice = _extractWishRowPrice(row);
            if (wPrice != null) {
              var wPrevPrice = _wishPriceHistory[appIdWish];
              if (wPrevPrice != null && wPrice < wPrevPrice) {
                var dropBadge = document.createElement('span');
                dropBadge.className = 'ja-wish-pricedrop';
                dropBadge.style.cssText = 'display:inline-block;margin-left:6px;padding:2px 7px;border-radius:10px;'
                  + 'font-size:10px;font-family:sans-serif;font-weight:bold;color:#4caf50;background:rgba(76,175,80,0.12);border:1px solid #4caf50;';
                dropBadge.textContent = '▼¥' + (wPrevPrice - wPrice).toLocaleString();
                dropBadge.title = '前回訪問時: ¥' + wPrevPrice.toLocaleString();
                wishBadgeEl.appendChild(dropBadge);
              }
              if (wPrevPrice !== wPrice) {
                _wishPriceHistory[appIdWish] = wPrice;
                _wishPriceHistoryDirty = true;
              }
            }
          }

          // 長期放置バッジ（追加から1年以上経過）
          var wDateAdded = _wishDateAddedCache[appIdWish];
          if (wDateAdded) {
            var wDaysSinceAdded = Math.floor((Date.now() / 1000 - wDateAdded) / 86400);
            if (wDaysSinceAdded >= 365) {
              var staleBadge = document.createElement('span');
              staleBadge.className = 'ja-wish-stale';
              staleBadge.style.cssText = 'display:inline-block;margin-left:6px;padding:2px 7px;border-radius:10px;'
                + 'font-size:10px;font-family:sans-serif;color:#8f98a0;background:rgba(143,152,160,0.1);border:1px solid #4a5a6a;';
              staleBadge.textContent = '🕸 興味を失ったかも';
              staleBadge.title = '追加から約' + Math.floor(wDaysSinceAdded / 365) + '年経過';
              wishBadgeEl.appendChild(staleBadge);
            }
          } else if (!Object.keys(_wishDateAddedCache).length) {
            // date_addedがまだ非同期取得中（SSRレスポンス未到着）→ 到着後に_refreshWishStaleBadgesで後埋め。
            // レスポンスが既に到着済みでこのappidが無い場合は対象外(取得失敗等)なので待たない。
            wishBadgeEl.dataset.staleCheckAppid = appIdWish;
          }

          // 発売日カウントダウン（未発売ゲームのみ）
          var cachedRelease = cacheEntry && cacheEntry.basicData && cacheEntry.basicData.release_date;
          if (cachedRelease && cachedRelease.coming_soon && cachedRelease.date) {
            _appendReleaseBadge(wishBadgeEl, cachedRelease.date);
          } else if (!cacheEntry) {
            (function (badgeEl, appidForRelease) {
              _fetchReleaseInfo(appidForRelease).then(function (dateStr) {
                if (dateStr) _appendReleaseBadge(badgeEl, dateStr);
              });
            })(wishBadgeEl, appIdWish);
          }
        }
      });
      _saveWishPriceHistory();

      // 並び替えボタン → AI判定順一覧パネルを開く / 合計金額計算ボタン
      // 現行のSteamウィッシュリストは仮想スクロール（画面内の数十件だけがDOMに存在）のため、
      // DOM操作による並び替えは不可能。代わりに別パネルでAI判定順の一覧を表示する。
      if (wishRows.length && !document.getElementById('ja-wish-sort-btn')) {
        var wBtnRow = document.createElement('div');
        wBtnRow.id = 'ja-wish-sort-btn';
        wBtnRow.style.cssText = 'display:flex;gap:8px;justify-content:center;margin:10px auto;flex-wrap:wrap;';

        var wSortBtn = document.createElement('button');
        wSortBtn.textContent = '🎯 AI判定順一覧を見る';
        wSortBtn.style.cssText = 'padding:8px 18px;'
          + 'background:#1b2838;color:#f6c744;border:1px solid #f6c744;'
          + 'border-radius:3px;cursor:pointer;font-size:13px;font-family:sans-serif;';
        wSortBtn.addEventListener('click', function() { showWishlistRankPanel(); });
        wBtnRow.appendChild(wSortBtn);

        var wTotalBtn = document.createElement('button');
        wTotalBtn.textContent = '💰 合計金額を計算';
        wTotalBtn.style.cssText = 'padding:8px 18px;'
          + 'background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;'
          + 'border-radius:3px;cursor:pointer;font-size:13px;font-family:sans-serif;';
        wTotalBtn.addEventListener('click', function() { _computeWishlistTotal(wTotalBtn); });
        wBtnRow.appendChild(wTotalBtn);

        var wAnalyzeAllBtn = document.createElement('button');
        wAnalyzeAllBtn.textContent = '🤖 未分析ゲームを全て分析';
        wAnalyzeAllBtn.style.cssText = 'padding:8px 18px;'
          + 'background:#1b2838;color:#8fcfa0;border:1px solid #4caf50;'
          + 'border-radius:3px;cursor:pointer;font-size:13px;font-family:sans-serif;';
        wAnalyzeAllBtn.addEventListener('click', function() { _analyzeAllUnanalyzedWishlist(wAnalyzeAllBtn); });
        wBtnRow.appendChild(wAnalyzeAllBtn);

        var wDroppable = document.querySelector('[data-rfd-droppable-id]');
        var wAnchor = wDroppable ? (wDroppable.closest('.Panel') || wDroppable) : wishRows[0];
        if (wAnchor && wAnchor.parentElement) wAnchor.parentElement.insertBefore(wBtnRow, wAnchor);
      }

      // 「今買うべき1本」常時表示カード
      if (!document.getElementById('ja-wish-pick-card') && !_wishPickDismissed) {
        var wAll = _getWishlistAppIds();
        var wCandidates = wAll.ids
          .map(function (id) { return { id: id, entry: _aiCache[id] }; })
          .filter(function (c) { return c.entry && c.entry.analysis && c.entry.analysis.recommendation; });
        if (wCandidates.length) {
          var WISH_VERDICT_ORDER = ['今すぐ買い', '買い', 'セール待ち', '人を選ぶ', '見送り'];
          wCandidates.sort(function (a, b) {
            var ra = WISH_VERDICT_ORDER.indexOf(a.entry.analysis.recommendation.verdict);
            var rb = WISH_VERDICT_ORDER.indexOf(b.entry.analysis.recommendation.verdict);
            if (ra < 0) ra = 99; if (rb < 0) rb = 99;
            if (ra !== rb) return ra - rb;
            var aDays = a.entry.analysis.sale_prediction && a.entry.analysis.sale_prediction.candidates && a.entry.analysis.sale_prediction.candidates[0]
              ? _daysUntilJaDate(a.entry.analysis.sale_prediction.candidates[0].date) : 999;
            var bDays = b.entry.analysis.sale_prediction && b.entry.analysis.sale_prediction.candidates && b.entry.analysis.sale_prediction.candidates[0]
              ? _daysUntilJaDate(b.entry.analysis.sale_prediction.candidates[0].date) : 999;
            return (aDays == null ? 999 : aDays) - (bDays == null ? 999 : bDays);
          });
          var pick = wCandidates[0];
          var pickStyle = VERDICT_MINI_STYLE[pick.entry.analysis.recommendation.verdict] || VERDICT_MINI_STYLE['人を選ぶ'];
          var pickCard = document.createElement('div');
          pickCard.id = 'ja-wish-pick-card';
          pickCard.style.cssText = 'display:flex;align-items:center;gap:10px;max-width:560px;margin:10px auto;padding:10px 12px;'
            + 'background:#0f1923;border:1px solid ' + pickStyle.border + ';border-radius:6px;font-family:sans-serif;';
          var pickThumb = document.createElement('img');
          pickThumb.src = 'https://cdn.akamai.steamstatic.com/steam/apps/' + pick.id + '/capsule_sm_120.jpg';
          pickThumb.style.cssText = 'width:72px;height:34px;object-fit:cover;border-radius:3px;flex-shrink:0;';
          pickThumb.onerror = function () { pickThumb.style.display = 'none'; };
          var pickInfo = document.createElement('a');
          pickInfo.href = 'https://store.steampowered.com/app/' + pick.id + '/';
          pickInfo.style.cssText = 'flex:1;min-width:0;text-decoration:none;color:inherit;';
          var pickLabel = document.createElement('div');
          pickLabel.style.cssText = 'color:#f6c744;font-size:10px;font-weight:bold;margin-bottom:2px;';
          pickLabel.textContent = '🎯 今買うべき1本';
          var pickName = document.createElement('div');
          pickName.style.cssText = 'color:#e6f0f7;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          pickName.textContent = pick.entry.analysis.summary || ('App ' + pick.id);
          var pickReason = document.createElement('div');
          pickReason.style.cssText = 'color:' + pickStyle.color + ';font-size:10px;margin-top:2px;';
          pickReason.textContent = pick.entry.analysis.recommendation.verdict + (pick.entry.analysis.recommendation.reason ? (' · ' + pick.entry.analysis.recommendation.reason) : '');
          pickInfo.appendChild(pickLabel); pickInfo.appendChild(pickName); pickInfo.appendChild(pickReason);
          var pickClose = document.createElement('button');
          pickClose.textContent = '✕';
          pickClose.style.cssText = 'flex-shrink:0;background:none;border:none;color:#8f98a0;font-size:14px;cursor:pointer;';
          pickClose.addEventListener('click', function () { _wishPickDismissed = true; pickCard.remove(); });
          pickCard.appendChild(pickThumb); pickCard.appendChild(pickInfo); pickCard.appendChild(pickClose);
          var pickAnchor = document.getElementById('ja-wish-sort-btn');
          if (pickAnchor && pickAnchor.parentElement) pickAnchor.parentElement.insertBefore(pickCard, pickAnchor.nextSibling);
        }
      }
    }

    if (found > 0 && !document.querySelector('.' + BULK_CLASS)) {
      var container = document.querySelector('[role="list"]');
      if (container) {
        var toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;margin:10px 0;flex-wrap:wrap;font-family:sans-serif;';

        // バルク翻訳
        var bulk = document.createElement('button');
        bulk.className = BULK_CLASS;
        bulk.textContent = '▼ 全レビューを翻訳';
        bulk.style.cssText = 'padding:7px 18px;background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;border-radius:3px;cursor:pointer;font-size:13px;';
        var progress = document.createElement('span');
        progress.style.cssText = 'color:#8f98a0;font-size:12px;';

        bulk.addEventListener('click', function () {
          var targets = Array.from(document.querySelectorAll('.' + BTN_CLASS))
            .filter(function (b) { return b.textContent === '日本語に翻訳'; });
          var total = targets.length;
          if (!total) return;
          progress.textContent = '0 / ' + total + ' 件';
          var delay = 0;
          targets.forEach(function (b) {
            setTimeout(function () { b.click(); }, delay);
            delay += (_opts.bulkDelay || 1000);
          });
          var checker = setInterval(function () {
            var remaining = Array.from(document.querySelectorAll('.' + BTN_CLASS))
              .filter(function (b) { return b.textContent === '日本語に翻訳'; }).length;
            var done = total - remaining;
            progress.textContent = done + ' / ' + total + ' 件';
            if (done >= total) {
              clearInterval(checker);
              setTimeout(function () { progress.textContent = ''; }, 3000);
            }
          }, 600);
        });

        // 履歴ボタン
        var histBtn = document.createElement('button');
        histBtn.textContent = '📜 履歴';
        histBtn.style.cssText = 'padding:7px 12px;background:#1b2838;color:#c6a84a;border:1px solid #c6a84a;border-radius:3px;cursor:pointer;font-size:13px;';
        histBtn.addEventListener('click', showHistoryPanel);

        // AIキー設定
        var keyBtn = document.createElement('button');
        keyBtn.textContent = '🔑 AIキー';
        keyBtn.style.cssText = 'padding:7px 12px;background:#1b2838;color:#f6c744;border:1px solid #f6c744;border-radius:3px;cursor:pointer;font-size:13px;';
        keyBtn.addEventListener('click', function () {
          promptApiKey(function () { toast('APIキーを更新しました', '#f6c744'); });
        });

        // 翻訳済み一括コピー
        var exportBtn = document.createElement('button');
        exportBtn.textContent = '📄 翻訳をコピー';
        exportBtn.style.cssText = 'padding:7px 12px;background:#1b2838;color:#8fcfa0;border:1px solid #4caf50;border-radius:3px;cursor:pointer;font-size:13px;';
        exportBtn.addEventListener('click', function () {
          var lines = [];
          document.querySelectorAll('.' + RESULT_CLASS).forEach(function (el, i) {
            var t = el.textContent.trim();
            if (t) lines.push((i + 1) + '. ' + t);
          });
          if (!lines.length) { toast('翻訳済みレビューがありません', '#8f98a0'); return; }
          copyToClipboard(lines.join('\n\n'));
          toast('📄 ' + lines.length + '件の翻訳をコピーしました', '#4caf50');
        });

        toolbar.appendChild(bulk);
        toolbar.appendChild(progress);
        toolbar.appendChild(exportBtn);
        toolbar.appendChild(histBtn);
        toolbar.appendChild(keyBtn);

        var sep = function () {
          var s = document.createElement('span');
          s.style.cssText = 'color:#2a475e;font-size:18px;margin:0 2px;';
          s.textContent = '|';
          return s;
        };

        // 言語フィルター
        var nonJaLangs = Object.keys(langsOnPage).filter(function (l) { return l !== 'JA'; });
        if (nonJaLangs.length > 1) {
          toolbar.appendChild(sep());
          var filterLabel = document.createElement('span');
          filterLabel.style.cssText = 'color:#8f98a0;font-size:12px;';
          filterLabel.textContent = '言語:';
          toolbar.appendChild(filterLabel);

          var makeFilterBtn = function (lang, label) {
            var fb = document.createElement('button');
            fb.dataset.filterLang = lang;
            fb.textContent = label;
            var isActive = lang === _langFilter;
            fb.style.cssText = 'padding:4px 10px;border-radius:3px;cursor:pointer;font-size:12px;'
              + (isActive ? 'color:#1b2838;background:#66c0f4;border:1px solid #66c0f4;' : 'color:#8f98a0;background:#1b2838;border:1px solid #2a475e;');
            fb.addEventListener('click', function () {
              _langFilter = lang;
              document.querySelectorAll('[data-filter-lang]').forEach(function (b) {
                var active = b.dataset.filterLang === _langFilter;
                b.style.color = active ? '#1b2838' : '#8f98a0';
                b.style.background = active ? '#66c0f4' : '#1b2838';
                b.style.borderColor = active ? '#66c0f4' : '#2a475e';
              });
              applyFilters();
            });
            return fb;
          };
          toolbar.appendChild(makeFilterBtn('ALL', 'すべて'));
          nonJaLangs.forEach(function (l) {
            var info = LANG_INFO[l] || { flag: '🌐' };
            toolbar.appendChild(makeFilterBtn(l, info.flag + ' ' + l));
          });
        }

        // プレイ時間フィルター
        toolbar.appendChild(sep());
        var playLabel = document.createElement('span');
        playLabel.style.cssText = 'color:#8f98a0;font-size:12px;';
        playLabel.textContent = '時間:';
        toolbar.appendChild(playLabel);

        [0, 10, 50, 100].forEach(function (h) {
          var pb = document.createElement('button');
          pb.dataset.playFilter = h;
          pb.textContent = h === 0 ? 'すべて' : h + 'h+';
          var isActive = h === _playFilter;
          pb.style.cssText = 'padding:4px 10px;border-radius:3px;cursor:pointer;font-size:12px;'
            + (isActive ? 'color:#1b2838;background:#c6a84a;border:1px solid #c6a84a;' : 'color:#8f98a0;background:#1b2838;border:1px solid #2a475e;');
          pb.addEventListener('click', function () {
            _playFilter = h;
            document.querySelectorAll('[data-play-filter]').forEach(function (b) {
              var active = parseInt(b.dataset.playFilter) === _playFilter;
              b.style.color = active ? '#1b2838' : '#8f98a0';
              b.style.background = active ? '#c6a84a' : '#1b2838';
              b.style.borderColor = active ? '#c6a84a' : '#2a475e';
            });
            applyFilters();
          });
          toolbar.appendChild(pb);
        });

        // レビュー検索バー
        toolbar.appendChild(sep());
        var searchWrap = document.createElement('div');
        searchWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
        var searchIcon = document.createElement('span');
        searchIcon.style.cssText = 'color:#8f98a0;font-size:13px;';
        searchIcon.textContent = '🔍';
        var searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'レビュー検索...';
        searchInput.style.cssText = 'background:#0f1923;border:1px solid #2a475e;border-radius:3px;color:#c6d4df;'
          + 'padding:4px 8px;font-size:12px;width:140px;outline:none;';
        searchInput.addEventListener('focus', function () { searchInput.style.borderColor = '#66c0f4'; });
        searchInput.addEventListener('blur', function () { searchInput.style.borderColor = '#2a475e'; });
        var _searchTimer = null;
        searchInput.addEventListener('input', function () {
          clearTimeout(_searchTimer);
          _searchTimer = setTimeout(function () {
            var q = searchInput.value.trim().toLowerCase();
            var allReviewEls = document.querySelectorAll('.apphub_CardTextContent,.userReviewCardContent,._1zbKizfCRpoX2D_zOLQes0');
            var matched = 0;
            allReviewEls.forEach(function (el) {
              var card = el.closest('[class*="Card"],[class*="card"],[class*="apphub_Card"]') || el.parentElement;
              if (!q) {
                card.style.display = '';
                el.style.outline = '';
                matched++;
                return;
              }
              var text = el.textContent.toLowerCase();
              if (text.indexOf(q) >= 0) {
                card.style.display = '';
                el.style.outline = '2px solid #66c0f4';
                el.style.outlineOffset = '2px';
                matched++;
              } else {
                card.style.display = 'none';
                el.style.outline = '';
              }
            });
            if (q) {
              var clearBtn2 = document.getElementById('ja-search-clear');
              if (clearBtn2) clearBtn2.style.display = 'inline';
            } else {
              var clearBtn2 = document.getElementById('ja-search-clear');
              if (clearBtn2) clearBtn2.style.display = 'none';
            }
          }, 250);
        });
        var clearSearchBtn = document.createElement('button');
        clearSearchBtn.id = 'ja-search-clear';
        clearSearchBtn.textContent = '✕';
        clearSearchBtn.style.cssText = 'display:none;padding:3px 7px;background:transparent;color:#8f98a0;border:1px solid #2a475e;border-radius:3px;cursor:pointer;font-size:11px;';
        clearSearchBtn.addEventListener('click', function () {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));
        });
        searchWrap.appendChild(searchIcon);
        searchWrap.appendChild(searchInput);
        searchWrap.appendChild(clearSearchBtn);
        toolbar.appendChild(searchWrap);

        container.insertBefore(toolbar, container.firstChild);
      }
    }
  }

  // ── 機能11: レビュー有用度フィルター（ソート） ──
  function attachSortControl() {
    if (document.getElementById('ja-review-sort-select')) return;
    var container = document.querySelector('[role="list"]');
    if (!container) return;
    var cards = container.querySelectorAll('[class*="apphub_Card"],[class*="review_card"],[class*="ReviewCard"]');
    if (cards.length < 2) return;

    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:8px;';
    var label = document.createElement('span');
    label.style.cssText = 'color:#8f98a0;font-size:12px;';
    label.textContent = '並び替え:';
    var sel = document.createElement('select');
    sel.id = 'ja-review-sort-select';
    sel.style.cssText = 'background:#1b2838;border:1px solid #2a475e;color:#c6d4df;padding:3px 7px;'
      + 'border-radius:3px;font-size:12px;cursor:pointer;';
    var options = [
      { value: 'default', label: 'デフォルト（Steam順）' },
      { value: 'helpful',  label: '有用度順（高い順）' },
      { value: 'length',   label: '文字数順（長い順）' },
      { value: 'playtime', label: 'プレイ時間順（長い順）' }
    ];
    options.forEach(function(opt) {
      var o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.label;
      sel.appendChild(o);
    });

    // 元の順序を保存
    var originalOrder = Array.from(cards);

    sel.addEventListener('change', function() {
      var mode = sel.value;
      var parent = cards[0] ? cards[0].parentElement : container;
      if (!parent) return;
      var currentCards = Array.from(parent.querySelectorAll('[class*="apphub_Card"],[class*="review_card"],[class*="ReviewCard"]'));
      if (!currentCards.length) return;

      if (mode === 'default') {
        originalOrder.forEach(function(card) {
          if (card.parentElement === parent) parent.appendChild(card);
        });
        return;
      }

      var scored = currentCards.map(function(card) {
        var score = 0;
        if (mode === 'helpful') {
          // data-helpfulvotes 属性 or テキスト内の helpful votes を探す
          var hv = card.getAttribute('data-helpfulvotes') || card.getAttribute('data-helpful-votes');
          if (hv) { score = parseInt(hv, 10) || 0; }
          else {
            var helpfulEl = card.querySelector('[class*="helpful"],[class*="Helpful"]');
            if (helpfulEl) {
              var hm = helpfulEl.textContent.match(/(\d[\d,]*)/);
              if (hm) score = parseInt(hm[1].replace(/,/g,''), 10) || 0;
            }
            // クラス名からの検出に失敗した場合、「XX人がこのレビューが参考になった」の文言を直接探す
            if (!score) {
              var jm = card.innerText && card.innerText.match(/(\d[\d,]*)\s*人が.{0,4}参考になった/);
              if (jm) score = parseInt(jm[1].replace(/,/g, ''), 10) || 0;
            }
          }
        } else if (mode === 'length') {
          var textEl = card.querySelector('[data-ja-trans]');
          if (textEl) {
            var clone = textEl.cloneNode(true);
            clone.querySelectorAll('button,span[class]').forEach(function(x){ x.remove(); });
            score = clone.innerText.trim().length;
          }
        } else if (mode === 'playtime') {
          score = parsePlaytime(card) || 0;
        }
        return { card: card, score: score };
      });

      scored.sort(function(a, b) { return b.score - a.score; });
      scored.forEach(function(item) { parent.appendChild(item.card); });
    });

    wrap.appendChild(label); wrap.appendChild(sel);
    var toolbar = container.querySelector('div[style*="display:flex"]');
    if (toolbar) toolbar.appendChild(wrap);
  }

  function collectReviewTexts() {
    var scored = [];
    document.querySelectorAll('.' + BTN_CLASS).forEach(function (b) {
      var textEl = b.parentElement;
      var clone = textEl.cloneNode(true);
      clone.querySelectorAll('.' + BTN_CLASS + ',.' + RESULT_CLASS + ',.ja-rebtn,.ja-rep-btn,.' + AI_RESULT_CLASS + ',.ja-lang-badge,.ja-rec-badge,.ja-hours-badge')
        .forEach(function (el) { el.remove(); });
      var t = clone.innerText.trim();
      if (!t) return;

      // 機能12: 最小文字数フィルター（AI分析時）
      var minLen2 = _opts.minReviewLength || 0;
      if (minLen2 > 0 && t.length < minLen2) return;

      var score = 0;
      // 文章の長さ（詳細なレビューを優先）
      score += Math.min(t.length / 80, 8);
      // プレイ時間（長時間プレイヤーの意見を重視）
      var hrsBadge = textEl.querySelector('.ja-hours-badge');
      if (hrsBadge) {
        var hm = hrsBadge.textContent.match(/([\d.]+)(k?)h/);
        if (hm) {
          var hrs = parseFloat(hm[1]) * (hm[2] ? 1000 : 1);
          score += Math.min(hrs / 50, 4);
        }
      }
      // 非推薦レビューは特に貴重（問題点が書かれやすい）
      var recBadge = textEl.querySelector('.ja-rec-badge');
      if (recBadge && recBadge.textContent.indexOf('非推薦') >= 0) score += 2;

      scored.push({ text: t, score: score });
    });

    // スコア降順でソートし上位40件。ただし推薦/非推薦バランスを考慮
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 40).map(function (x) { return x.text; });
  }

  // ── セール履歴グラフ（IsThereAnyDeal API、キー登録制） ──
  var ITAD_KEY_STORAGE = 'ja_trans_itad_key';
  var _itadKeyCache = null;
  chrome.storage.local.get([ITAD_KEY_STORAGE], function (r) { _itadKeyCache = r[ITAD_KEY_STORAGE] || null; });

  // appid → ITADのゲームUUID。この対応は変わらないため長期キャッシュしてlookup APIの再呼び出しを避ける
  var ITAD_ID_KEY = 'ja_trans_itad_id_map_v1';
  var _itadIdMap = {};
  chrome.storage.local.get([ITAD_ID_KEY], function (r) { if (r[ITAD_ID_KEY]) _itadIdMap = r[ITAD_ID_KEY]; });
  function _saveItadIdMap() { try { var o = {}; o[ITAD_ID_KEY] = _itadIdMap; chrome.storage.local.set(o); } catch (e) { /* 保存失敗は無視 */ } }

  var PRICE_HIST_KEY = 'ja_trans_price_hist_v2'; // v1はshopsフィルタ無しで他ストアのデータが混入していたため破棄しv2に変更
  var PRICE_HIST_TTL = 24 * 3600000; // 24時間。価格履歴は日単位で変わるものではないためSteam/ITAD双方への再アクセスを抑える
  var _priceHistCache = {};
  chrome.storage.local.get([PRICE_HIST_KEY], function (r) { if (r[PRICE_HIST_KEY]) _priceHistCache = r[PRICE_HIST_KEY]; });
  function _savePriceHistCache() { try { var o = {}; o[PRICE_HIST_KEY] = _priceHistCache; chrome.storage.local.set(o); } catch (e) { /* 保存失敗は無視 */ } }

  async function _getItadId(appid) {
    if (_itadIdMap[appid] !== undefined) return _itadIdMap[appid];
    // ITADはSteamドメイン外の外部APIのため、1min.aiと同様にbackground経由(_bgFetch)で叩く。
    // ページCSPの影響下にある直接fetch()だと"Failed to fetch"で弾かれることがある。
    var r = await _bgFetch('https://api.isthereanydeal.com/games/lookup/v1?key=' + encodeURIComponent(_itadKeyCache) + '&appid=' + appid, {});
    if (!r.ok) throw new Error('ITADのゲーム検索に失敗しました(' + r.status + ')');
    var d = await r.json();
    var id = (d && d.found && d.game && d.game.id) || null;
    _itadIdMap[appid] = id; // 見つからなかった場合もnullをキャッシュし、毎回問い合わせるのを防ぐ
    _saveItadIdMap();
    return id;
  }

  // 戻り値: 価格履歴ログ配列（フィールド形式は呼び出し側で防御的に解釈する）
  async function _fetchPriceHistoryLog(appid) {
    if (!_itadKeyCache) throw new Error('IsThereAnyDealのAPIキーが未設定です');
    var cached = _priceHistCache[appid];
    if (cached && (Date.now() - cached.fetchedAt < PRICE_HIST_TTL)) return cached.log;
    var itadId = await _getItadId(appid);
    if (!itadId) return null; // ITADにデータがないゲーム
    // shops=61(Steam)を指定しないとGOG等の他ストア・他通貨の価格が混在して返ってくる
    // （country=JPを指定してもストア横断のログ自体はフィルタされない）。
    var r = await _bgFetch('https://api.isthereanydeal.com/games/history/v2?key=' + encodeURIComponent(_itadKeyCache)
      + '&id=' + encodeURIComponent(itadId) + '&country=JP&shops=61&since=2010-01-01T00:00:00Z', {});
    if (!r.ok) throw new Error('ITADの価格履歴取得に失敗しました(' + r.status + ')');
    var log = await r.json();
    if (!Array.isArray(log)) { console.warn('[SteamJaTrans] ITAD価格履歴が予期しない形式で返されました', log); return null; }
    // 上記のshopsフィルタが効かないケースに備えた防御的な二重チェック
    log = log.filter(function (entry) { return entry.shop && entry.shop.id === 61; });
    _priceHistCache[appid] = { log: log, fetchedAt: Date.now() };
    _savePriceHistCache();
    return log;
  }

  function _buildPriceLineChartSVG(points) {
    var w = 480, h = 160, padL = 46, padB = 22, padT = 10, padR = 10;
    var chartW = w - padL - padR, chartH = h - padT - padB;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', '100%');
    svg.style.cssText = 'display:block;';
    var prices = points.map(function (p) { return p.price; });
    var maxP = Math.max.apply(null, prices), minP = Math.min.apply(null, prices);
    var range = Math.max(maxP - minP, 1);
    function xOf(i) { return padL + (points.length > 1 ? (i / (points.length - 1)) * chartW : chartW / 2); }
    function yOf(p) { return padT + chartH - ((p - minP) / range) * chartH; }
    [minP, (minP + maxP) / 2, maxP].forEach(function (v) {
      var y = yOf(v);
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', padL); line.setAttribute('x2', w - padR);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', '#2a475e'); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      var lbl = document.createElementNS(svgNS, 'text');
      lbl.setAttribute('x', 2); lbl.setAttribute('y', y + 3);
      lbl.setAttribute('fill', '#8f98a0'); lbl.setAttribute('font-size', '9');
      lbl.textContent = '¥' + Math.round(v).toLocaleString();
      svg.appendChild(lbl);
    });
    var pathD = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + xOf(i).toFixed(1) + ' ' + yOf(p.price).toFixed(1); }).join(' ');
    var path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#66c0f4');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    points.forEach(function (p) {
      var c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', xOf(points.indexOf(p))); c.setAttribute('cy', yOf(p.price)); c.setAttribute('r', 2.5);
      c.setAttribute('fill', p.price === minP ? '#4caf50' : '#66c0f4');
      var title = document.createElementNS(svgNS, 'title');
      title.textContent = p.label + ': ¥' + Math.round(p.price).toLocaleString();
      c.appendChild(title);
      svg.appendChild(c);
    });
    return svg;
  }

  function _showPriceHistoryPanel(appid) {
    var existing = document.getElementById('ja-price-hist-panel');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'ja-price-hist-panel';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483646;'
      + 'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:#0f1923;border:1px solid #2d5a3d;border-radius:8px;'
      + 'width:min(90vw,560px);max-height:80vh;overflow-y:auto;padding:20px;color:#c6d4df;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#66c0f4;font-size:15px;font-weight:bold;';
    hdrTitle.textContent = '💰 セール履歴';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    hdr.appendChild(hdrTitle); hdr.appendChild(closeBtn);
    panel.appendChild(hdr);
    var body = document.createElement('div');
    body.style.cssText = 'color:#8f98a0;font-size:12px;';
    body.textContent = '⏳ 価格履歴を取得中...';
    panel.appendChild(body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    (async function () {
      if (!_itadKeyCache) {
        body.textContent = '⚠ IsThereAnyDealのAPIキーが未設定です。拡張機能の設定（一般設定）で登録してください。';
        return;
      }
      try {
        var log = await _fetchPriceHistoryLog(appid);
        if (!log) { body.textContent = 'このゲームの価格履歴データはIsThereAnyDeal上に見つかりませんでした。'; return; }
        // ITADのレスポンス形式はドキュメント上の表記ゆれがあるため、複数のフィールド名候補を試して防御的に解釈する
        var points = log.map(function (entry) {
          var priceObj = (entry.deal && entry.deal.price) || entry.price || null;
          var amount = priceObj && priceObj.amount != null ? priceObj.amount : (typeof priceObj === 'number' ? priceObj : null);
          var tsRaw = entry.timestamp || entry.date || entry.added;
          if (amount == null || !tsRaw) return null;
          var d = new Date(tsRaw);
          if (isNaN(d.getTime())) return null;
          return { date: d, price: amount, label: (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2) };
        }).filter(Boolean).sort(function (a, b) { return a.date - b.date; });

        if (!points.length) {
          console.warn('[SteamJaTrans] ITAD価格履歴のフィールドを解釈できませんでした。生データ:', log[0]);
          body.textContent = '⚠ 価格履歴データの形式を解釈できませんでした。';
          return;
        }

        var lowest = points.reduce(function (m, p) { return p.price < m.price ? p : m; });
        var current = points[points.length - 1];

        body.textContent = '';
        var summary = document.createElement('div');
        summary.style.cssText = 'display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap;';
        [
          { label: '🏆 過去最安値', value: '¥' + Math.round(lowest.price).toLocaleString(), sub: lowest.date.toLocaleDateString('ja-JP') },
          { label: '📍 直近の価格', value: '¥' + Math.round(current.price).toLocaleString(), sub: current.date.toLocaleDateString('ja-JP') }
        ].forEach(function (s) {
          var box = document.createElement('div');
          box.style.cssText = 'background:#0a1319;border-radius:6px;padding:8px 12px;';
          var l = document.createElement('div'); l.style.cssText = 'color:#8f98a0;font-size:10px;'; l.textContent = s.label;
          var v = document.createElement('div'); v.style.cssText = 'color:#c6d4df;font-size:15px;font-weight:bold;'; v.textContent = s.value;
          var sub = document.createElement('div'); sub.style.cssText = 'color:#8f98a0;font-size:10px;'; sub.textContent = s.sub;
          box.appendChild(l); box.appendChild(v); box.appendChild(sub);
          summary.appendChild(box);
        });
        body.appendChild(summary);

        var chartWrap = document.createElement('div');
        chartWrap.style.cssText = 'background:#0a1319;border-radius:6px;padding:10px;margin-bottom:8px;';
        chartWrap.appendChild(_buildPriceLineChartSVG(points));
        body.appendChild(chartWrap);

        var note = document.createElement('div');
        note.style.cssText = 'color:#8f98a0;font-size:10px;';
        note.textContent = '💡 データ提供: IsThereAnyDeal（日本円換算・価格変動記録ベース）。1日1回程度のキャッシュで表示しています。';
        body.appendChild(note);
      } catch (e) {
        body.textContent = '⚠ 取得に失敗しました: ' + (e && e.message);
      }
    })();
  }

  // ── 評判急変検知グラフ（Steam公式レビューヒストグラムAPI、キー不要・AI不使用） ──
  var REVIEW_HIST_KEY = 'ja_trans_review_hist_v1';
  var REVIEW_HIST_TTL = 6 * 3600000; // 6時間。頻繁に変動するデータではないため長めにキャッシュしSteamへの再アクセスを抑える
  var _reviewHistCache = {};
  chrome.storage.local.get([REVIEW_HIST_KEY], function (r) { if (r[REVIEW_HIST_KEY]) _reviewHistCache = r[REVIEW_HIST_KEY]; });
  function _saveReviewHistCache() {
    try { var obj = {}; obj[REVIEW_HIST_KEY] = _reviewHistCache; chrome.storage.local.set(obj); } catch (e) { /* 保存できなくても表示自体は継続する */ }
  }
  async function _fetchReviewHistogram(appid) {
    var cached = _reviewHistCache[appid];
    if (cached && (Date.now() - cached.fetchedAt < REVIEW_HIST_TTL)) return cached.rollups;
    var r = await fetch('https://store.steampowered.com/appreviewhistogram/' + appid, { signal: _timeoutSignal(8000) });
    if (!r.ok) throw new Error('取得失敗(' + r.status + ')');
    var d = await r.json();
    var rollups = (d.results && d.results.rollups) || [];
    _reviewHistCache[appid] = { rollups: rollups, fetchedAt: Date.now() };
    _saveReviewHistCache();
    return rollups;
  }

  function _buildTrendChartSVG(buckets) {
    var w = 480, h = 160, padL = 28, padB = 22, padT = 10, padR = 10;
    var chartW = w - padL - padR, chartH = h - padT - padB;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', '100%');
    svg.style.cssText = 'display:block;';
    [0, 50, 100].forEach(function (pctLine) {
      var y = padT + chartH - (pctLine / 100) * chartH;
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', padL); line.setAttribute('x2', w - padR);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', '#2a475e'); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', 2); label.setAttribute('y', y + 3);
      label.setAttribute('fill', '#8f98a0'); label.setAttribute('font-size', '9');
      label.textContent = pctLine + '%';
      svg.appendChild(label);
    });
    var gap = chartW / buckets.length;
    var barW = Math.max(gap * 0.6, 2);
    buckets.forEach(function (b, i) {
      var barH = (b.pct / 100) * chartH;
      var x = padL + i * gap + (gap - barW) / 2;
      var y = padT + chartH - barH;
      var color = b.pct >= 70 ? '#4caf50' : (b.pct >= 40 ? '#f6c744' : '#e74c3c');
      var rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', barW); rect.setAttribute('height', Math.max(barH, 1));
      rect.setAttribute('fill', color);
      var title = document.createElementNS(svgNS, 'title');
      title.textContent = b.label + ': ' + b.pct + '%（' + b.volume + '件）';
      rect.appendChild(title);
      svg.appendChild(rect);
    });
    if (buckets.length) {
      var firstLabel = document.createElementNS(svgNS, 'text');
      firstLabel.setAttribute('x', padL); firstLabel.setAttribute('y', h - 6);
      firstLabel.setAttribute('fill', '#8f98a0'); firstLabel.setAttribute('font-size', '9');
      firstLabel.textContent = buckets[0].label;
      svg.appendChild(firstLabel);
      var lastLabel = document.createElementNS(svgNS, 'text');
      lastLabel.setAttribute('x', w - padR); lastLabel.setAttribute('y', h - 6);
      lastLabel.setAttribute('text-anchor', 'end');
      lastLabel.setAttribute('fill', '#8f98a0'); lastLabel.setAttribute('font-size', '9');
      lastLabel.textContent = buckets[buckets.length - 1].label;
      svg.appendChild(lastLabel);
    }
    return svg;
  }

  function _showReputationTrendPanel(appid) {
    var existing = document.getElementById('ja-trend-panel');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'ja-trend-panel';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483646;'
      + 'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:#0f1923;border:1px solid #2d5a3d;border-radius:8px;'
      + 'width:min(90vw,560px);max-height:80vh;overflow-y:auto;padding:20px;color:#c6d4df;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#66c0f4;font-size:15px;font-weight:bold;';
    hdrTitle.textContent = '📉 評判の推移';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    hdr.appendChild(hdrTitle); hdr.appendChild(closeBtn);
    panel.appendChild(hdr);
    var body = document.createElement('div');
    body.style.cssText = 'color:#8f98a0;font-size:12px;';
    body.textContent = '⏳ レビュー推移データを取得中...';
    panel.appendChild(body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    (async function () {
      try {
        var rollups = await _fetchReviewHistogram(appid);
        if (!rollups.length) { body.textContent = 'レビュー推移データが見つかりませんでした。'; return; }
        var buckets = rollups.slice(-16).map(function (r) {
          var total = (r.recommendations_up || 0) + (r.recommendations_down || 0);
          var d = new Date(r.date * 1000);
          return {
            label: (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2),
            pct: total > 0 ? Math.round(r.recommendations_up / total * 100) : 0,
            volume: total,
            hasData: total > 0
          };
        }).filter(function (b) { return b.hasData; });
        if (buckets.length < 2) { body.textContent = 'レビュー件数が少なく、推移を判定できませんでした。'; return; }

        var recentSlice = buckets.slice(-2);
        var priorSlice = buckets.slice(0, -2);
        var recentAvg = recentSlice.reduce(function (s, b) { return s + b.pct; }, 0) / recentSlice.length;
        var priorAvg = priorSlice.length ? priorSlice.reduce(function (s, b) { return s + b.pct; }, 0) / priorSlice.length : recentAvg;
        var diff = recentAvg - priorAvg;

        body.textContent = '';
        if (priorSlice.length && Math.abs(diff) >= 15) {
          var alertBox = document.createElement('div');
          alertBox.style.cssText = 'margin-bottom:10px;padding:8px 12px;border-radius:4px;font-size:12px;'
            + (diff < 0
              ? 'background:rgba(231,76,60,0.1);border:1px solid #e74c3c;color:#e74c3c;'
              : 'background:rgba(76,175,80,0.1);border:1px solid #4caf50;color:#4caf50;');
          alertBox.textContent = (diff < 0 ? '⚠ 直近の評判が悪化傾向です' : '📈 直近の評判が改善傾向です')
            + '（直近平均' + Math.round(recentAvg) + '% ／ それ以前平均' + Math.round(priorAvg) + '%）';
          body.appendChild(alertBox);
        }
        var chartWrap = document.createElement('div');
        chartWrap.style.cssText = 'background:#0a1319;border-radius:6px;padding:10px;margin-bottom:8px;';
        chartWrap.appendChild(_buildTrendChartSVG(buckets));
        body.appendChild(chartWrap);
        var note = document.createElement('div');
        note.style.cssText = 'color:#8f98a0;font-size:10px;';
        note.textContent = '💡 Steam公式のレビュー集計期間ごとのポジティブ率（AI不使用・実データのみ）。バーにカーソルを合わせると件数を確認できます。';
        body.appendChild(note);
      } catch (e) {
        body.textContent = '⚠ 取得に失敗しました: ' + (e && e.message);
      }
    })();
  }

  // ── 気になるリスト横断のAI比較レポート ──
  function _showBookmarkCompareReport(ids) {
    var existing = document.getElementById('ja-bm-compare-modal');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'ja-bm-compare-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483646;'
      + 'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:#0f1923;border:1px solid #2d5a3d;border-radius:8px;'
      + 'width:min(90vw,700px);max-height:80vh;overflow-y:auto;padding:20px;color:#c6d4df;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'color:#66c0f4;font-size:15px;font-weight:bold;';
    hdrTitle.textContent = '🔍 気になるリスト比較レポート（' + ids.length + '件）';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    hdr.appendChild(hdrTitle); hdr.appendChild(closeBtn);
    panel.appendChild(hdr);
    var body = document.createElement('div');
    body.style.cssText = 'color:#8f98a0;font-size:12px;line-height:1.7;';
    body.textContent = '⏳ AIが比較中...';
    panel.appendChild(body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    (async function () {
      try {
        var lines = ids.map(function (id, i) {
          var entry = _aiCache[id];
          var bm = _bookmarks[id];
          var a = entry.analysis;
          var verdict = a.recommendation && a.recommendation.verdict;
          var price = entry.priceInfo && entry.priceInfo.current;
          var risk = (a.risk_flags || []).join('/');
          return (i + 1) + '. ' + (bm.name || id)
            + ' | 判定:' + (verdict || '不明')
            + ' | 価格:' + (price != null ? '¥' + price : '不明')
            + ' | 概要:' + (a.summary || '')
            + ' | リスク:' + (risk || 'なし');
        }).join('\n');
        var prompt = 'あなたはゲーム購入アドバイザーです。以下は「気になるリスト」に入っているAI分析済みのゲーム' + ids.length + '本です。'
          + 'これらを比較し、「先に買うならどれか」の優先順位と、それぞれ簡潔な理由を日本語でまとめてください'
          + '（各ゲーム1〜2文、最後に総括を1文）。\n\n' + lines;
        var report = await _aiText(prompt);
        body.textContent = '';
        renderLiteMarkdown(body, report || '比較レポートを生成できませんでした');
      } catch (e) {
        body.textContent = '⚠ レポート生成に失敗しました: ' + (e && e.message);
      }
    })();
  }

  function addPageAiButton() {
    if (document.getElementById('ja-ai-header-btn')) return;
    var hubLink = null;
    document.querySelectorAll('a').forEach(function (el) {
      if (!hubLink) {
        var t = el.textContent.trim();
        if (t === 'コミュニティハブ' || t === 'Community Hub') hubLink = el;
      }
    });
    if (!hubLink) return;

    var btn = document.createElement('a');
    btn.id = 'ja-ai-header-btn';
    btn.href = '#';
    btn.textContent = '🤖 AI分析';
    btn.className = hubLink.className;
    btn.style.cssText = 'color:#4caf50 !important;margin-left:4px;cursor:pointer;';

    hubLink.parentNode.insertBefore(btn, hubLink);

    // 気になるリスト一覧ボタン
    (function() {
      var bmListBtn = document.createElement('a');
      bmListBtn.id = 'ja-bookmark-list-btn';
      bmListBtn.href = '#';
      bmListBtn.className = hubLink.className;
      bmListBtn.style.cssText = 'color:#e74c3c !important;margin-left:4px;cursor:pointer;';
      bmListBtn.textContent = '📚 気になる';
      hubLink.parentNode.insertBefore(bmListBtn, hubLink);
      bmListBtn.addEventListener('click', function(e) {
        e.preventDefault();
        var existing = document.getElementById('ja-bookmark-panel');
        if (existing) { existing.remove(); return; }
        var panel = document.createElement('div');
        panel.id = 'ja-bookmark-panel';
        panel.style.cssText = 'position:fixed;top:60px;right:20px;z-index:2147483640;'
          + 'background:#1b2838;border:1px solid #4a5a6a;border-radius:6px;width:320px;max-height:480px;'
          + 'overflow-y:auto;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.6);';
        var ph = document.createElement('div');
        ph.style.cssText = 'padding:10px 14px;border-bottom:1px solid #2a475e;display:flex;justify-content:space-between;align-items:center;';
        var pt = document.createElement('span');
        pt.style.cssText = 'color:#c6d4df;font-size:13px;font-weight:bold;';
        var keys = Object.keys(_bookmarks);
        pt.textContent = '❤ 気になるリスト（' + keys.length + '件）';
        var cmpBtn = document.createElement('button');
        cmpBtn.textContent = '🔍 比較';
        cmpBtn.title = 'AI分析済みのゲームを2件以上比較';
        cmpBtn.style.cssText = 'background:none;border:1px solid #4caf50;color:#8fcfa0;border-radius:3px;'
          + 'padding:2px 8px;font-size:11px;cursor:pointer;margin-right:8px;';
        cmpBtn.addEventListener('click', function() {
          var analyzedKeys = keys.filter(function(id) { return _aiCache[id] && _aiCache[id].analysis; });
          if (analyzedKeys.length < 2) { toast('AI分析済みのゲームが2件以上必要です（「🤖 AI分析」で分析してから比較してください）', '#f6c744'); return; }
          panel.remove();
          _showBookmarkCompareReport(analyzedKeys);
        });
        var pc = document.createElement('button');
        pc.textContent = '✕';
        pc.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
        pc.addEventListener('click', function() { panel.remove(); });
        ph.appendChild(pt); ph.appendChild(cmpBtn); ph.appendChild(pc);
        panel.appendChild(ph);
        if (!keys.length) {
          var empty = document.createElement('div');
          empty.style.cssText = 'padding:20px;text-align:center;color:#8f98a0;font-size:12px;';
          empty.textContent = '気になるゲームはまだありません。分析後に❤ボタンで追加できます。';
          panel.appendChild(empty);
        } else {
          keys.sort(function(a, b) { return (_bookmarks[b].date || 0) - (_bookmarks[a].date || 0); }).forEach(function(id) {
            var bm = _bookmarks[id];
            var row = document.createElement('div');
            row.style.cssText = 'padding:8px 14px;border-bottom:1px solid #1e3828;display:flex;align-items:center;gap:8px;';
            var thumb = document.createElement('img');
            thumb.src = 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/capsule_sm_120.jpg';
            thumb.style.cssText = 'width:60px;height:28px;object-fit:cover;border-radius:2px;flex-shrink:0;';
            thumb.onerror = function() { thumb.style.display = 'none'; };
            var info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0;';
            var nm = document.createElement('a');
            nm.href = 'https://store.steampowered.com/app/' + id + '/';
            nm.target = '_blank';
            nm.rel = 'noopener';
            nm.style.cssText = 'color:#c6d4df;font-size:12px;text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            nm.textContent = bm.name || id;
            nm.addEventListener('mouseenter', function() { nm.style.color = '#66c0f4'; });
            nm.addEventListener('mouseleave', function() { nm.style.color = '#c6d4df'; });
            var meta = document.createElement('div');
            meta.style.cssText = 'color:#8f98a0;font-size:10px;margin-top:2px;';
            var metaParts = [];
            if (bm.verdict) metaParts.push(bm.verdict);
            if (bm.priceInfo && bm.priceInfo.current) metaParts.push('¥' + bm.priceInfo.current.toLocaleString());
            if (bm.date) metaParts.push(new Date(bm.date).toLocaleDateString('ja-JP', {month:'numeric',day:'numeric'}));
            meta.textContent = metaParts.join(' · ');
            var del = document.createElement('button');
            del.textContent = '🗑';
            del.title = '削除';
            del.style.cssText = 'background:none;border:none;cursor:pointer;font-size:13px;padding:2px;flex-shrink:0;opacity:0.5;';
            del.addEventListener('mouseenter', function() { del.style.opacity = '1'; });
            del.addEventListener('mouseleave', function() { del.style.opacity = '0.5'; });
            del.addEventListener('click', function() {
              delete _bookmarks[id];
              var obj = {}; obj[BOOKMARK_KEY] = _bookmarks;
              chrome.storage.local.set(obj);
              row.remove();
              pt.textContent = '❤ 気になるリスト（' + Object.keys(_bookmarks).length + '件）';
            });
            info.appendChild(nm); info.appendChild(meta);
            row.appendChild(thumb); row.appendChild(info); row.appendChild(del);
            panel.appendChild(row);
          });
        }
        document.body.appendChild(panel);
        // パネル外クリックで閉じる
        setTimeout(function() {
          document.addEventListener('click', function onOutside(ev) {
            if (!panel.contains(ev.target) && ev.target !== bmListBtn) { panel.remove(); document.removeEventListener('click', onOutside); }
          });
        }, 100);
      });
    })();

    // 機能: セール履歴グラフ
    (function() {
      var priceHistBtn = document.createElement('a');
      priceHistBtn.id = 'ja-price-hist-btn';
      priceHistBtn.href = '#';
      priceHistBtn.className = hubLink.className;
      priceHistBtn.style.cssText = 'color:#5a8a65 !important;margin-left:4px;cursor:pointer;';
      priceHistBtn.textContent = '💰 セール履歴';
      hubLink.parentNode.insertBefore(priceHistBtn, hubLink);
      priceHistBtn.addEventListener('click', function(e) {
        e.preventDefault();
        var appid = getGameId();
        if (!appid) return;
        _showPriceHistoryPanel(appid);
      });
    })();

    // 機能: 評判急変検知グラフ
    (function() {
      var trendBtn = document.createElement('a');
      trendBtn.id = 'ja-trend-btn';
      trendBtn.href = '#';
      trendBtn.className = hubLink.className;
      trendBtn.style.cssText = 'color:#f6c744 !important;margin-left:4px;cursor:pointer;';
      trendBtn.textContent = '📉 評判推移';
      hubLink.parentNode.insertBefore(trendBtn, hubLink);
      trendBtn.addEventListener('click', function(e) {
        e.preventDefault();
        var appid = getGameId();
        if (!appid) return;
        _showReputationTrendPanel(appid);
      });
    })();

    // 機能: コミュニティ人気スレ要約
    (function() {
      var threadBtn = document.createElement('a');
      threadBtn.id = 'ja-thread-sum-btn';
      threadBtn.href = '#';
      threadBtn.className = hubLink.className;
      threadBtn.style.cssText = 'color:#66c0f4 !important;margin-left:4px;cursor:pointer;';
      threadBtn.textContent = '💬 人気スレ要約';
      hubLink.parentNode.insertBefore(threadBtn, hubLink);
      threadBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        if (!_geminiKeyCache && !_1minKeyCache) { toast('要約にはAPIキーが必要です', '#f6c744'); return; }
        var appid = getGameId();
        if (!appid) return;
        var existing = document.getElementById('ja-thread-sum-panel');
        if (existing) { existing.remove(); return; }
        var panel = document.createElement('div');
        panel.id = 'ja-thread-sum-panel';
        panel.style.cssText = 'position:fixed;top:60px;right:20px;z-index:2147483640;'
          + 'background:#1b2838;border:1px solid #4a5a6a;border-radius:6px;width:340px;max-height:480px;'
          + 'overflow-y:auto;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.6);';
        var ph = document.createElement('div');
        ph.style.cssText = 'padding:10px 14px;border-bottom:1px solid #2a475e;display:flex;justify-content:space-between;align-items:center;';
        var pt = document.createElement('span');
        pt.style.cssText = 'color:#c6d4df;font-size:13px;font-weight:bold;';
        pt.textContent = '💬 人気スレ要約';
        var pc = document.createElement('button');
        pc.textContent = '✕';
        pc.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
        pc.addEventListener('click', function() { panel.remove(); });
        ph.appendChild(pt); ph.appendChild(pc);
        panel.appendChild(ph);
        var body = document.createElement('div');
        body.style.cssText = 'padding:12px 14px;color:#8f98a0;font-size:12px;line-height:1.6;';
        body.textContent = '⏳ スレッド一覧を取得中...';
        panel.appendChild(body);
        document.body.appendChild(panel);
        setTimeout(function() {
          document.addEventListener('click', function onOutside(ev) {
            if (!panel.contains(ev.target) && ev.target !== threadBtn) { panel.remove(); document.removeEventListener('click', onOutside); }
          });
        }, 100);

        try {
          var res = await _bgFetch('https://steamcommunity.com/app/' + appid + '/discussions/', { credentials: 'include' });
          if (!res.ok) throw new Error('取得失敗(' + res.status + ')');
          var html = await res.text();
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var threads = [];
          doc.querySelectorAll('.forum_topic').forEach(function(row) {
            if (row.classList.contains('sticky')) return; // 運営固定・ガイドライン等は話題性の判断材料にならないため除外
            var nameEl = row.querySelector('.forum_topic_name');
            var replyEl = row.querySelector('.forum_topic_reply_count');
            if (!nameEl) return;
            var title = nameEl.textContent.replace(/\s+/g, ' ').trim();
            if (!title) return;
            var replies = replyEl ? (parseInt(replyEl.textContent.trim(), 10) || 0) : 0;
            threads.push({ title: title, replies: replies });
          });
          if (!threads.length) { body.textContent = 'コミュニティのスレッドが見つかりませんでした。'; return; }
          threads.sort(function(a, b) { return b.replies - a.replies; });
          threads = threads.slice(0, 8);

          body.textContent = '⏳ AI要約中...';
          var promptLines = threads.map(function(t, i) { return (i + 1) + '. ' + t.title + '（返信' + t.replies + '件）'; }).join('\n');
          var prompt = '以下はSteamコミュニティディスカッションの返信数が多い人気投稿タイトル一覧です。'
            + 'これらから読み取れる「今このゲームで何が話題になっているか」を日本語で3〜5行に要約してください（説明文・前置き不要、要約のみ）。\n\n' + promptLines;
          var summary = await _aiText(prompt);

          body.textContent = '';
          var sumEl = document.createElement('div');
          sumEl.style.cssText = 'margin-bottom:10px;color:#c6d4df;';
          renderLiteMarkdown(sumEl, summary || '要約を取得できませんでした');
          body.appendChild(sumEl);

          var listTitle = document.createElement('div');
          listTitle.style.cssText = 'color:#66c0f4;font-size:11px;font-weight:bold;margin:8px 0 4px;';
          listTitle.textContent = '📌 返信数の多いスレッド';
          body.appendChild(listTitle);
          threads.forEach(function(t) {
            var row = document.createElement('div');
            row.style.cssText = 'padding:4px 0;border-bottom:1px solid #24313d;font-size:11px;color:#a8b6c0;';
            row.textContent = t.title + '（返信' + t.replies + '）';
            body.appendChild(row);
          });
        } catch (err) {
          body.textContent = '⚠ 取得/要約に失敗しました: ' + (err && err.message);
        }
      });
    })();

    // レビューブックマーク一覧ボタン
    (function() {
      var rbmListBtn = document.createElement('a');
      rbmListBtn.id = 'ja-review-bm-list-btn';
      rbmListBtn.href = '#';
      rbmListBtn.className = hubLink.className;
      rbmListBtn.style.cssText = 'color:#c6a84a !important;margin-left:4px;cursor:pointer;';
      rbmListBtn.textContent = '🔖 レビュー';
      hubLink.parentNode.insertBefore(rbmListBtn, hubLink);
      rbmListBtn.addEventListener('click', function(e) {
        e.preventDefault();
        var existing = document.getElementById('ja-review-bm-panel');
        if (existing) { existing.remove(); return; }
        chrome.storage.local.get([REVIEW_BM_KEY], function(r) {
          var list = r[REVIEW_BM_KEY] || [];
          var panel = document.createElement('div');
          panel.id = 'ja-review-bm-panel';
          panel.style.cssText = 'position:fixed;top:60px;right:20px;z-index:2147483640;'
            + 'background:#1b2838;border:1px solid #4a5a6a;border-radius:6px;width:340px;max-height:480px;'
            + 'overflow-y:auto;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.6);';
          var ph = document.createElement('div');
          ph.style.cssText = 'padding:10px 14px;border-bottom:1px solid #2a475e;display:flex;justify-content:space-between;align-items:center;';
          var pt = document.createElement('span');
          pt.style.cssText = 'color:#c6d4df;font-size:13px;font-weight:bold;';
          pt.textContent = '🔖 レビューブックマーク（' + list.length + '件）';
          var pc = document.createElement('button');
          pc.textContent = '✕';
          pc.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;';
          pc.addEventListener('click', function() { panel.remove(); });
          ph.appendChild(pt); ph.appendChild(pc);
          panel.appendChild(ph);
          if (!list.length) {
            var empty = document.createElement('div');
            empty.style.cssText = 'padding:20px;text-align:center;color:#8f98a0;font-size:12px;';
            empty.textContent = 'ブックマークしたレビューはまだありません。レビューの🔖ボタンで追加できます。';
            panel.appendChild(empty);
          } else {
            list.forEach(function(bm, idx) {
              var row = document.createElement('div');
              row.style.cssText = 'padding:8px 14px;border-bottom:1px solid #1e3828;';
              var head = document.createElement('div');
              head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
              var nm = document.createElement('a');
              nm.href = bm.url || '#';
              nm.target = '_blank';
              nm.rel = 'noopener';
              nm.style.cssText = 'color:#66c0f4;font-size:11px;font-weight:bold;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;';
              nm.textContent = bm.gameName || 'ゲーム';
              var del = document.createElement('button');
              del.textContent = '🗑';
              del.title = '削除';
              del.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:2px;flex-shrink:0;opacity:0.5;margin-left:6px;';
              del.addEventListener('mouseenter', function() { del.style.opacity = '1'; });
              del.addEventListener('mouseleave', function() { del.style.opacity = '0.5'; });
              del.addEventListener('click', function() {
                chrome.storage.local.get([REVIEW_BM_KEY], function(r2) {
                  var list2 = r2[REVIEW_BM_KEY] || [];
                  list2.splice(idx, 1);
                  var obj = {}; obj[REVIEW_BM_KEY] = list2;
                  chrome.storage.local.set(obj, function() {
                    row.remove();
                    pt.textContent = '🔖 レビューブックマーク（' + list2.length + '件）';
                  });
                });
              });
              head.appendChild(nm); head.appendChild(del);
              row.appendChild(head);
              var origEl = document.createElement('div');
              origEl.style.cssText = 'color:#8f98a0;font-size:11px;line-height:1.4;margin-bottom:2px;';
              origEl.textContent = (bm.original || '').slice(0, 120);
              row.appendChild(origEl);
              if (bm.translated) {
                var transEl = document.createElement('div');
                transEl.style.cssText = 'color:#c6d4df;font-size:11px;line-height:1.4;';
                transEl.textContent = bm.translated.slice(0, 120);
                row.appendChild(transEl);
              }
              panel.appendChild(row);
            });
          }
          document.body.appendChild(panel);
          setTimeout(function() {
            document.addEventListener('click', function onOutside(ev) {
              if (!panel.contains(ev.target) && ev.target !== rbmListBtn) { panel.remove(); document.removeEventListener('click', onOutside); }
            });
          }, 100);
        });
      });
    })();

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var existing = document.getElementById('ja-ai-page-result');
      if (existing) { existing.remove(); btn.textContent = '🤖 AI分析'; return; }

      var texts = collectReviewTexts();
      if (!texts.length) { toast('レビューが見つかりません', '#e74c3c'); return; }
      // ストア商品ページには表示中のレビューが数件しかDOMに存在しないことが多く、
      // その少数だけをAIに渡すと(特に強いモデルでも)出力が崩れてプロンプトの指示文を
      // そのまま書き写すことがある(_looksLikeTemplateLeakで検出する不具合の主因)。
      // レビューページなら多数のレビューがDOMに読み込まれるため、そちらでの分析を促す。
      var MIN_ANALYSIS_REVIEWS = 5;
      if (texts.length < MIN_ANALYSIS_REVIEWS) {
        var gidForReviews = getGameId();
        toast('表示中のレビューが' + texts.length + '件しかありません。'
          + (gidForReviews ? 'レビューページ(store.steampowered.com/app/' + gidForReviews + '/reviews/)で分析してください' : 'レビューをもっと読み込んでから分析してください'), '#f6c744');
        return;
      }
      _lastReviewTexts = texts;

      // 機能7: バグ/クラッシュ言及集計
      var BUG_KW = ['bug','crash','バグ','クラッシュ','freeze','フリーズ','error','エラー','not working','動かない','落ちる','起動しない'];
      var bugCount = texts.filter(function(t){ return BUG_KW.some(function(k){ return t.toLowerCase().indexOf(k) >= 0; }); }).length;

      // 機能9: 最近のスコア取得
      function getRecentScore() {
        var els = document.querySelectorAll('.user_reviews_filter_score .game_review_summary, .summary_column .game_review_summary');
        if (els.length >= 2) {
          var text = els[1].textContent.trim();
          return STEAM_SCORE_MAP[text] ? { en: text, ja: STEAM_SCORE_MAP[text].ja, color: STEAM_SCORE_MAP[text].color } : null;
        }
        return null;
      }
      var recentScore = getRecentScore();

      var gameId     = getGameId();
      var langDist   = computeLangDist(texts);
      var steamScore = getSteamScore();
      var priceInfo  = getGamePrice();
      var gameTags   = getGameTags();

      // 機能6: プレイ時間グループ収集
      var reviewMetaData = (function() {
        var early = { count: 0, rec: 0 }, mid = { count: 0, rec: 0 }, heavy = { count: 0, rec: 0 };
        var timestamps = [];
        var negTexts = [], jaTexts = [];
        document.querySelectorAll('.' + BTN_CLASS).forEach(function(b) {
          var textEl = b.parentElement;
          var card = textEl.closest('[class*="apphub_Card"],[class*="review_card"],[class*="ReviewCard"]');
          if (!card) return;
          // プレイ時間（分単位の属性を探す）
          var ptEl = card.querySelector('[class*="playtime"],[class*="hours"],[class*="numHours"]');
          var hrs = parsePlaytime(card);
          var isRec = !!(card.querySelector('.thumbsUpIcon,.thumbsup,[class*="thumbsUp"],[class*="ThumbsUp"]'));
          if (hrs !== null) {
            if (hrs < 10) { early.count++; if (isRec) early.rec++; }
            else if (hrs <= 100) { mid.count++; if (isRec) mid.rec++; }
            else { heavy.count++; if (isRec) heavy.rec++; }
          }
          // タイムスタンプ
          var tsEl = card.querySelector('.date_posted,[class*="date_posted"],[class*="posted"]');
          if (tsEl) {
            var dateStr = tsEl.textContent.trim();
            var d = new Date(dateStr);
            if (!isNaN(d.getTime())) timestamps.push(d.getTime());
          }
          // ネガティブ / 日本語レビュー
          var clone2 = textEl.cloneNode(true);
          clone2.querySelectorAll('button,span[class]').forEach(function(x){ x.remove(); });
          var t = clone2.innerText.trim();
          if (!t) return;
          var lang = textEl.dataset.jaLang || detectLang(t);
          if (!isRec) negTexts.push(t);
          if (lang === 'JA') jaTexts.push(t);
        });
        // スパン計算
        var spanMonths = null;
        if (timestamps.length >= 2) {
          var sorted = timestamps.sort(function(a,b){ return a-b; });
          spanMonths = Math.round((sorted[sorted.length-1] - sorted[0]) / (30*24*3600*1000));
        }
        // 推薦率を%に変換
        var toRec = function(g) { return g.count > 0 ? Math.round(g.rec/g.count*100) : 0; };
        return {
          playtimeGroups: {
            early: { count: early.count, rec: toRec(early) },
            mid:   { count: mid.count,   rec: toRec(mid)   },
            heavy: { count: heavy.count, rec: toRec(heavy) }
          },
          reviewSpanMonths: spanMonths,
          totalReviews: texts.length,
          negativeTexts: negTexts,
          jaTexts: jaTexts
        };
      })();

      var jaReviewCount = reviewMetaData.jaTexts ? reviewMetaData.jaTexts.length : 0;

      // 機能F10/11/12/13/14: 追加メタ収集
      var reviewCards = Array.from(document.querySelectorAll('[class*="apphub_Card"],[class*="review_card"],[class*="ReviewCard"]'));
      _extraMeta = {
        refundRisk: calcRefundRisk(reviewCards),
        bugScore: calcBugScore(texts),
        populationHealth: calcPopulationHealth(reviewCards),
        reviewBomb: detectReviewBomb(reviewCards),
        dlcDependency: calcDlcDependency(texts),
        playstyle: null
      };

      var doRender = function (result, cacheTime) {
        var anchor = hubLink.closest('div[class]');
        while (anchor && anchor.parentElement && anchor.parentElement.tagName !== 'BODY') {
          if (anchor.previousElementSibling) break;
          anchor = anchor.parentElement;
        }
        var displayModel = _lastAnalysisModel || _getActiveModel();
        renderPageAnalysis(anchor || hubLink, result, {
          steamScore: steamScore, langDist: langDist, priceInfo: priceInfo,
          cacheTime: cacheTime || null,
          usedModel: displayModel,
          bugCount: bugCount, totalReviewCount: texts.length,
          recentScore: recentScore,
          jaReviewCount: jaReviewCount
        });
        addMiniTitleBadge(result);
        showMiniFloat(result);
        watchNewReviews();
        btn.textContent = '🤖 AI分析を閉じる';
        btn.style.pointerEvents = '';
        _updateAiBtn();
      };

      // キャッシュチェック(🔄再分析からの呼び出しは1回だけキャッシュを迂回する)
      var _skipCacheThisRun = _forceReanalyze;
      _forceReanalyze = false;
      if (gameId && !_skipCacheThisRun) {
        var cached = getAnalysisCache(gameId, texts.length);
        if (cached) {
          langDist   = cached.langDist   || langDist;
          steamScore = cached.steamScore || steamScore;
          priceInfo  = cached.priceInfo  || priceInfo;
          // キャッシュ利用時もニュースをバックグラウンド取得してQAに使えるようにする
          if (gameId) {
            fetch('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=' + gameId + '&count=10&maxlength=500&format=json')
              .then(function(r){ return r.json(); })
              .then(function(d){ _lastNewsItems = (d.appnews && d.appnews.newsitems) || []; })
              .catch(function(){});
          }
          if (cached.basicData) _extraMeta.basicData = cached.basicData;
          if (cached.playtimeCorr) _extraMeta.playtimeCorr = cached.playtimeCorr;
          doRender(cached.analysis, cached.timestamp);
          return;
        }
      }

      var doAnalyze = function (apiKey) {
        btn.textContent = '分析中...';
        btn.style.pointerEvents = 'none';
        _saleContextForAnalysis = '';
        var appIdForPrice = getGameId();
        var pricePromise = Promise.resolve();
        var newsPromise = Promise.resolve([]);
        var releasePromise = Promise.resolve(null);
        var trendPromise = Promise.resolve(null);
        var achievePromise = Promise.resolve(null);
        if (appIdForPrice) {
          pricePromise = fetch('https://store.steampowered.com/api/appdetails?appids=' + appIdForPrice + '&filters=price_overview&cc=jp')
            .then(function(pr){ return pr.json(); })
            .then(function(pd){
              var po = pd && pd[appIdForPrice] && pd[appIdForPrice].data && pd[appIdForPrice].data.price_overview;
              if (po && po.initial) {
                _saleContextForAnalysis = '価格情報: 定価¥' + Math.round(po.initial/100) + ' 現在¥' + Math.round(po.final/100);
                if (po.discount_percent) _saleContextForAnalysis += ' (' + po.discount_percent + '%オフ中)';
                _saleContextForAnalysis += '\n';
              }
            }).catch(function(){});
          newsPromise = fetch('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=' + appIdForPrice + '&count=10&maxlength=500&format=json')
            .then(function(r){ return r.json(); })
            .then(function(d){ return (d.appnews && d.appnews.newsitems) || []; })
            .catch(function(){ return []; });
          releasePromise = fetch('https://store.steampowered.com/api/appdetails?appids=' + appIdForPrice + '&filters=basic,dlc,demos,steam_deck_compatibility,categories,supported_languages&cc=jp')
            .then(function(r){ return r.json(); })
            .then(function(d){ return (d && d[appIdForPrice] && d[appIdForPrice].data) || null; })
            .catch(function(){ return null; });
          trendPromise = fetch('https://store.steampowered.com/appreviews/' + appIdForPrice + '?json=1&num_per_page=100&filter=recent&language=all&review_type=all&purchase_type=all')
            .then(function(r){ return r.json(); })
            .catch(function(){ return null; });
          achievePromise = fetch('https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=' + appIdForPrice + '&format=json')
            .then(function(r){ return r.json(); })
            .catch(function(){ return null; });
        }
        // 機能10: Workshop MOD数
        var workshopPromise = appIdForPrice
          ? fetch('https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?query_type=0&numperpage=1&appid=' + appIdForPrice + '&return_total_only=true&format=json')
              .then(function(r){ return r.json(); }).catch(function(){ return null; })
          : Promise.resolve(null);
        // 機能21: Metacritic
        var metacriticPromise = appIdForPrice
          ? fetch('https://store.steampowered.com/api/appdetails?appids=' + appIdForPrice + '&filters=metacritic&cc=jp')
              .then(function(r){ return r.json(); }).catch(function(){ return null; })
          : Promise.resolve(null);
        // 機能8: コミュニティアナウンス取得（forum feed）
        var forumNewsPromise = appIdForPrice
          ? fetch('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=' + appIdForPrice + '&count=5&maxlength=300&format=json&feeds=steam_community_announcements')
              .then(function(r){ return r.json(); })
              .then(function(d){ return (d.appnews && d.appnews.newsitems) || []; })
              .catch(function(){ return []; })
          : Promise.resolve([]);
        // 機能24: レビューヒストグラム（コミュニティ活性度）
        var forumPromise = appIdForPrice
          ? fetch('https://store.steampowered.com/appreviewhistogram/' + appIdForPrice + '?json=1')
              .then(function(r){ return r.json(); }).catch(function(){ return null; })
          : Promise.resolve(null);
        // プレイヤー人口指数: Steam公式の同時接続数API(認証不要・実数)。
        // 「過疎化懸念」はレビュー文面からのAI推測に留まるため、実数で裏付けを添える。
        var playerCountPromise = appIdForPrice
          ? fetch('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=' + appIdForPrice + '&format=json')
              .then(function(r){ return r.json(); }).catch(function(){ return null; })
          : Promise.resolve(null);
        Promise.all([pricePromise, newsPromise, releasePromise, trendPromise, achievePromise, workshopPromise, metacriticPromise, forumPromise, forumNewsPromise, playerCountPromise]).then(function(fetched) {
          var newsItems = fetched[1] || [];
          var basicData = fetched[2];
          var reviewTrendData = fetched[3];
          var achieveData = fetched[4];
          var workshopData = fetched[5];
          var metacriticData = fetched[6];
          var forumData = fetched[7];
          var playerCountData = fetched[9];
          // レビュー時期別推薦率を計算
          var trendMeta = null;
          if (reviewTrendData && reviewTrendData.reviews && reviewTrendData.reviews.length) {
            var now = Math.floor(Date.now() / 1000);
            var p30 = {pos:0,tot:0}, p90 = {pos:0,tot:0}, p365 = {pos:0,tot:0}, pOld = {pos:0,tot:0};
            reviewTrendData.reviews.forEach(function(rv) {
              var age = now - (rv.timestamp_created || 0);
              var bucket = age < 30*86400 ? p30 : age < 90*86400 ? p90 : age < 365*86400 ? p365 : pOld;
              bucket.tot++;
              if (rv.voted_up) bucket.pos++;
            });
            var pct = function(b) { return b.tot > 0 ? Math.round(b.pos / b.tot * 100) : null; };
            trendMeta = { d30: pct(p30), d90: pct(p90), d365: pct(p365), dOld: pct(pOld) };
          }
          // Feature 5: 返金直前ネガティブレビュー（2時間未満+非推薦）
          var refundNegTexts = [], refundNegCount = 0;
          // Feature 7: プレイ時間別推薦率（API実データ）
          var playtimeCorrData = null;
          if (reviewTrendData && reviewTrendData.reviews && reviewTrendData.reviews.length) {
            var pcg = { a:{p:0,t:0}, b:{p:0,t:0}, c:{p:0,t:0}, d:{p:0,t:0} }; // <2h,2-10h,10-50h,50h+
            reviewTrendData.reviews.forEach(function(rv) {
              var mins = rv.author && rv.author.playtime_at_review ? rv.author.playtime_at_review : null;
              if (mins === null) return;
              var hrs = mins / 60;
              var grp = hrs < 2 ? pcg.a : hrs < 10 ? pcg.b : hrs < 50 ? pcg.c : pcg.d;
              grp.t++;
              if (rv.voted_up) grp.p++;
              // Feature 5: 返金候補抽出
              if (hrs < 2 && !rv.voted_up && rv.review) {
                refundNegCount++;
                if (refundNegTexts.length < 5) refundNegTexts.push(rv.review.slice(0, 200));
              }
            });
            var cPct = function(g) { return g.t >= 3 ? Math.round(g.p / g.t * 100) : null; };
            playtimeCorrData = {
              under2:  { pct: cPct(pcg.a), tot: pcg.a.t },
              h2to10:  { pct: cPct(pcg.b), tot: pcg.b.t },
              h10to50: { pct: cPct(pcg.c), tot: pcg.c.t },
              over50:  { pct: cPct(pcg.d), tot: pcg.d.t },
              total: reviewTrendData.reviews.length
            };
          }
          _lastNewsItems = newsItems;
          _lastForumPosts = fetched[8] || []; // 機能8: コミュニティアナウンス
          _extraMeta.newsItems = newsItems;
          _extraMeta.basicData = basicData;
          _extraMeta.trendMeta = trendMeta;
          _extraMeta.playtimeCorr = playtimeCorrData;
          _extraMeta.refundNegTexts = refundNegTexts;
          if (playerCountData && playerCountData.response && playerCountData.response.result === 1) {
            _extraMeta.currentPlayers = playerCountData.response.player_count;
          }
          if (basicData && basicData.steam_deck_compatibility) {
            _extraMeta.deckCompat = basicData.steam_deck_compatibility.category; // 1=Unsupported 2=Playable 3=Verified
          }
          _extraMeta.refundNegPct = (reviewTrendData && reviewTrendData.reviews && reviewTrendData.reviews.length)
            ? Math.round(refundNegCount / reviewTrendData.reviews.length * 100) : null;
          // 機能10: Workshop件数格納
          if (workshopData && workshopData.response && workshopData.response.total != null) {
            _extraMeta.workshopCount = workshopData.response.total;
          }
          // 機能21: Metacritic格納
          if (metacriticData && appIdForPrice && metacriticData[appIdForPrice] && metacriticData[appIdForPrice].data && metacriticData[appIdForPrice].data.metacritic) {
            _extraMeta.metacritic = metacriticData[appIdForPrice].data.metacritic;
          }
          // 機能24: フォーラム活性度（週次レビュー数）
          if (forumData && forumData.results && forumData.results.recent) {
            var recentWeeks = forumData.results.recent;
            var totalRecent = recentWeeks.reduce(function(s, w) { return s + ((w.recommendations_up || 0) + (w.recommendations_down || 0)); }, 0);
            var weekCount = recentWeeks.length || 1;
            _extraMeta.weeklyReviewAvg = Math.round(totalRecent / weekCount);
          }
          // 機能14: 実績データ処理
          if (achieveData && achieveData.achievementpercentages && achieveData.achievementpercentages.achievements) {
            var achievements = achieveData.achievementpercentages.achievements;
            var totalAchieve = achievements.length;
            if (totalAchieve > 0) {
              var sumPct = achievements.reduce(function(s, a) { return s + (a.percent || 0); }, 0);
              var avgAchievePct = Math.round(sumPct / totalAchieve);
              var minAchieve = achievements.reduce(function(prev, cur) { return (cur.percent || 0) < (prev.percent || 0) ? cur : prev; }, achievements[0]);
              var minAchievePct = Math.round(minAchieve.percent || 0);
              _extraMeta.achieveData = { totalAchieve: totalAchieve, avgAchievePct: avgAchievePct, minAchievePct: minAchievePct, minAchieveName: minAchieve.name || '' };
            }
          }
          // 設定とキーを最新のストレージから取得してからAI呼び出し
          chrome.storage.local.get([SETTINGS_KEY, ONE_MIN_KEY_STORAGE], function(storageData) {
            if (storageData[SETTINGS_KEY]) Object.assign(_opts, storageData[SETTINGS_KEY]);
            _1minKeyCache = storageData[ONE_MIN_KEY_STORAGE] || _1minKeyCache;
            getPlaystyle(function(ps) {
              _extraMeta.playstyle = ps;
              analyzeWithGemini(texts, apiKey, priceInfo, gameTags, 0, reviewMetaData, _extraMeta).then(function (result) {
                if (gameId) setAnalysisCache(gameId, result, texts.length, langDist, steamScore, priceInfo, gameTags);
                _incrementDailyCount();
                doRender(result, null);
              }).catch(function (e) {
                toast('AI分析失敗: ' + e.message, '#e74c3c');
                btn.textContent = '🤖 AI分析';
                btn.style.pointerEvents = '';
                _updateAiBtn();
              });
            });
          });
        });
      };

      chrome.storage.local.get([GEMINI_KEY_STORAGE, ONE_MIN_KEY_STORAGE], function (result) {
        var geminiKey = result[GEMINI_KEY_STORAGE];
        var oneMinKey = result[ONE_MIN_KEY_STORAGE];
        _1minKeyCache = oneMinKey || _1minKeyCache;
        if (geminiKey) { doAnalyze(geminiKey); }
        else if (oneMinKey) { doAnalyze(null); }
        else promptApiKey(doAnalyze);
      });
    });
  }

  function openSettings() {
    if (document.getElementById('ja-settings-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'ja-settings-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2147483645;display:flex;align-items:center;justify-content:center;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:#1b2838;border:1px solid #66c0f4;border-radius:6px;width:320px;font-family:sans-serif;color:#c6d4df;overflow:hidden;';
    var header = document.createElement('div');
    header.style.cssText = 'background:#171d25;padding:12px 16px;border-bottom:1px solid #2a475e;display:flex;align-items:center;justify-content:space-between;';
    var titleEl = document.createElement('div');
    var titleMain = document.createElement('div');
    titleMain.style.cssText = 'color:#66c0f4;font-size:14px;font-weight:bold;';
    titleMain.textContent = '🔤 Steam Japanese Translator';
    var titleSub = document.createElement('div');
    titleSub.style.cssText = 'color:#8f98a0;font-size:11px;margin-top:2px;';
    titleSub.textContent = '設定';
    titleEl.appendChild(titleMain); titleEl.appendChild(titleSub);
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#8f98a0;font-size:16px;cursor:pointer;padding:0 4px;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    header.appendChild(titleEl); header.appendChild(closeBtn);
    var section = document.createElement('div');
    section.style.cssText = 'padding:16px;';
    var secTitle = document.createElement('div');
    secTitle.style.cssText = 'color:#66c0f4;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;';
    secTitle.textContent = '🤖 Gemini API キー';
    var desc = document.createElement('div');
    desc.style.cssText = 'color:#8f98a0;font-size:11px;margin-bottom:8px;line-height:1.5;';
    desc.textContent = 'Google AI Studio（aistudio.google.com）で無料取得できます';
    var inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    var keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.placeholder = 'AIza...';
    keyInput.style.cssText = 'flex:1;background:#2a475e;border:1px solid #4a5a6a;border-radius:3px;color:#c6d4df;padding:6px 8px;font-size:12px;';
    var showBtn = document.createElement('button');
    showBtn.textContent = '表示';
    showBtn.style.cssText = 'padding:5px 10px;background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;border-radius:3px;cursor:pointer;font-size:12px;';
    showBtn.addEventListener('click', function () {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      showBtn.textContent = keyInput.type === 'password' ? '表示' : '隠す';
    });
    inputRow.appendChild(keyInput); inputRow.appendChild(showBtn);
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;';
    var saveBtn2 = document.createElement('button');
    saveBtn2.textContent = '保存';
    saveBtn2.style.cssText = 'padding:5px 14px;background:#1b2838;color:#4caf50;border:1px solid #4caf50;border-radius:3px;cursor:pointer;font-size:12px;';
    var clearBtn = document.createElement('button');
    clearBtn.textContent = '削除';
    clearBtn.style.cssText = 'padding:5px 14px;background:#1b2838;color:#e74c3c;border:1px solid #e74c3c;border-radius:3px;cursor:pointer;font-size:12px;';
    btnRow.appendChild(saveBtn2); btnRow.appendChild(clearBtn);
    var statusEl = document.createElement('div');
    statusEl.style.cssText = 'font-size:11px;padding:6px 8px;border-radius:3px;';
    function refreshStatus() {
      chrome.storage.local.get([GEMINI_KEY_STORAGE, ONE_MIN_KEY_STORAGE], function (result) {
        var key = result[GEMINI_KEY_STORAGE];
        var oneMinKey = result[ONE_MIN_KEY_STORAGE];
        if (key) {
          keyInput.value = key;
          statusEl.textContent = '✓ キー設定済み: ' + key.slice(0, 8) + '••••' + key.slice(-4);
          statusEl.style.cssText = 'font-size:11px;padding:6px 8px;border-radius:3px;background:rgba(76,175,80,0.15);color:#4caf50;border:1px solid #4caf50;';
        } else if (oneMinKey) {
          statusEl.textContent = '✓ Geminiキーは未設定ですが、1min.ai(Qwen3-8B)で動作中です';
          statusEl.style.cssText = 'font-size:11px;padding:6px 8px;border-radius:3px;background:rgba(76,175,80,0.15);color:#4caf50;border:1px solid #4caf50;';
        } else {
          statusEl.textContent = '⚠ APIキー未設定';
          statusEl.style.cssText = 'font-size:11px;padding:6px 8px;border-radius:3px;background:rgba(246,199,68,0.12);color:#f6c744;border:1px solid #f6c744;';
        }
      });
    }
    saveBtn2.addEventListener('click', function () {
      var key = keyInput.value.trim();
      if (!key) return;
      var obj = {}; obj[GEMINI_KEY_STORAGE] = key;
      chrome.storage.local.set(obj, function () { _geminiKeyCache = key; refreshStatus(); });
    });
    clearBtn.addEventListener('click', function () {
      chrome.storage.local.remove([GEMINI_KEY_STORAGE], function () {
        keyInput.value = ''; _geminiKeyCache = null; refreshStatus();
      });
    });
    section.appendChild(secTitle); section.appendChild(desc); section.appendChild(inputRow); section.appendChild(btnRow); section.appendChild(statusEl);
    var footer = document.createElement('div');
    footer.style.cssText = 'padding:8px 16px;border-top:1px solid #2a475e;color:#4a5a6a;font-size:10px;text-align:center;';
    footer.textContent = 'キーはブラウザのローカルにのみ保存されます';
    panel.appendChild(header); panel.appendChild(section); panel.appendChild(footer);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    refreshStatus();
    setTimeout(function () { keyInput.focus(); }, 50);
  }

  function addSettingsFab() {
    if (document.getElementById('ja-settings-fab')) return;
    var fab = document.createElement('button');
    fab.id = 'ja-settings-fab';
    fab.textContent = '⚙';
    fab.title = 'Steam Japanese Translator 設定';
    fab.style.cssText = 'position:fixed;bottom:60px;right:16px;width:36px;height:36px;'
      + 'background:#1b2838;color:#66c0f4;border:1px solid #66c0f4;border-radius:50%;'
      + 'cursor:pointer;font-size:18px;z-index:2147483644;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,0.5);line-height:1;';
    fab.addEventListener('click', openSettings);
    document.body.appendChild(fab);

    var recFab = document.createElement('button');
    recFab.id = 'ja-rec-fab';
    recFab.textContent = '🎯';
    recFab.title = 'あなた向けおすすめゲーム';
    recFab.style.cssText = 'position:fixed;bottom:104px;right:16px;width:36px;height:36px;'
      + 'background:#1b2838;color:#f6c744;border:1px solid #f6c744;border-radius:50%;'
      + 'cursor:pointer;font-size:18px;z-index:2147483644;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,0.5);line-height:1;';
    recFab.addEventListener('click', showRecommendationPanel);
    document.body.appendChild(recFab);

    var bugFab = document.createElement('button');
    bugFab.id = 'ja-bug-fab';
    bugFab.textContent = '🐛';
    bugFab.title = 'バグ報告の可能性があるレビュー一覧';
    bugFab.style.cssText = 'position:fixed;bottom:148px;right:16px;width:36px;height:36px;'
      + 'background:#1b2838;color:#e74c3c;border:1px solid #e74c3c;border-radius:50%;'
      + 'cursor:pointer;font-size:18px;z-index:2147483644;display:none;'
      + 'align-items:center;justify-content:center;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,0.5);line-height:1;';
    bugFab.addEventListener('click', showBugReportPanel);
    document.body.appendChild(bugFab);
  }
  function _updateBugFabVisibility() {
    var fab = document.getElementById('ja-bug-fab');
    if (!fab) return;
    fab.style.display = document.querySelectorAll('[data-ja-trans="1"]').length ? 'flex' : 'none';
  }

  // ── キーボードショートカット ──
  var _kbdFocusIndex = -1;
  function _getReviewCards() {
    return Array.from(document.querySelectorAll('[class*="apphub_Card"],[class*="review_card"],[class*="ReviewCard"]'))
      .filter(function (c) { return c.querySelector('.' + BTN_CLASS); });
  }
  function _kbdScrollTo(card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var prevOutline = card.style.outline;
    card.style.outline = '2px solid #4caf50';
    setTimeout(function () { card.style.outline = prevOutline; }, 900);
  }
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      // Steam本体のUI要素（検索欄、フィルタのselect等）にフォーカスがある間は割り込まない。
      // 何もフォーカスされていない時はe.targetがdocument.bodyになる。
      if (e.target !== document.body) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        toast('⌨ j/k: 前後のレビュー移動　t: 翻訳　s: 設定を開く', '#66c0f4');
        return;
      }
      if (e.key === 's') {
        e.preventDefault();
        var fab = document.getElementById('ja-settings-fab');
        if (fab) fab.click();
        return;
      }
      if (e.key !== 'j' && e.key !== 'k' && e.key !== 't') return;
      var cards = _getReviewCards();
      if (!cards.length) return;
      if (e.key === 'j') {
        e.preventDefault();
        _kbdFocusIndex = Math.min(_kbdFocusIndex + 1, cards.length - 1);
        _kbdScrollTo(cards[_kbdFocusIndex]);
      } else if (e.key === 'k') {
        e.preventDefault();
        _kbdFocusIndex = Math.max(_kbdFocusIndex - 1, 0);
        _kbdScrollTo(cards[_kbdFocusIndex]);
      } else if (e.key === 't') {
        e.preventDefault();
        var focusedCard = cards[_kbdFocusIndex];
        if (!focusedCard) return;
        var tBtn = focusedCard.querySelector('.' + BTN_CLASS);
        if (tBtn) tBtn.click();
      }
    });
  }

  function init() {
    if (_opts.toast) toast('🔤 翻訳ツール起動');
    addSettingsFab();
    initSelectionTooltip();
    initKeyboardShortcuts();
    var observer = new MutationObserver(function () {
      clearTimeout(window._jaTransTimer);
      window._jaTransTimer = setTimeout(function () { scan(); addPageAiButton(); }, 600);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    var count = 0;
    var iv = setInterval(function () {
      scan();
      addPageAiButton();
      if (++count >= 20) clearInterval(iv);
    }, 1000);
    scan();
    addPageAiButton();
  }

  if (document.body) { init(); }
  else { document.addEventListener('DOMContentLoaded', init); }
})();
