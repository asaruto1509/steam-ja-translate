(function () {
  var KEY_GEMINI   = 'ja_trans_gemini_key';
  var KEY_SETTINGS = 'ja_trans_settings';
  var KEY_DISCORD_WEBHOOK = 'ja_trans_discord_webhook';
  var KEY_ITAD = 'ja_trans_itad_key';

  // ── ナビゲーション ──
  document.querySelectorAll('.nav-item').forEach(function (item) {
    item.addEventListener('click', function () {
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
      document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
      item.classList.add('active');
      document.getElementById('page-' + item.dataset.page).classList.add('active');
    });
  });

  // ── ステータス表示 ──
  function showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'status-box status-' + type;
    setTimeout(function () { el.textContent = ''; el.className = ''; }, 3000);
  }

  // ── 設定の読み込み ──
  function loadSettings() {
    chrome.storage.local.get([KEY_DISCORD_WEBHOOK], function (r) {
      var webhookInput = document.getElementById('discord-webhook-input');
      if (webhookInput && r[KEY_DISCORD_WEBHOOK]) webhookInput.value = r[KEY_DISCORD_WEBHOOK];
    });
    chrome.storage.local.get([KEY_ITAD], function (r) {
      var itadInput = document.getElementById('itad-key-input');
      if (itadInput && r[KEY_ITAD]) itadInput.value = r[KEY_ITAD];
    });
    chrome.storage.local.get([KEY_GEMINI, KEY_SETTINGS, 'ja_trans_1min_key'], function (result) {
      var key = result[KEY_GEMINI];
      var s = result[KEY_SETTINGS] || {};
      var oneminKey = result['ja_trans_1min_key'];

      // APIキー
      if (key) {
        document.getElementById('api-key-input').value = key;
        updateKeyStatus(key);
      } else {
        updateKeyStatus(null);
      }

      // 全般設定
      if (s.langBadge     !== undefined) document.getElementById('opt-lang-badge').checked     = s.langBadge;
      if (s.highlight     !== undefined) document.getElementById('opt-highlight').checked      = s.highlight;
      if (s.toast         !== undefined) document.getElementById('opt-toast').checked          = s.toast;
      if (s.autoTranslate   !== undefined) document.getElementById('opt-auto-translate').checked   = s.autoTranslate;
      if (s.geminiTranslate !== undefined) document.getElementById('opt-gemini-translate').checked = s.geminiTranslate;
      if (s.bulkDelay     !== undefined) document.getElementById('opt-bulk-delay').value       = s.bulkDelay;
      if (s.transEngine)                 document.getElementById('opt-trans-engine').value     = s.transEngine;
      if (s.minReviewLength !== undefined) {
        var mlEl = document.getElementById('opt-min-review-length');
        if (mlEl) mlEl.value = s.minReviewLength;
      }
      if (s.aiAutoEnrich !== undefined) {
        var aeEl = document.getElementById('opt-ai-auto-enrich');
        if (aeEl) aeEl.checked = s.aiAutoEnrich;
      }
      if (s.wishPriceAlertMinDiscount !== undefined) {
        var wptEl = document.getElementById('opt-wish-price-threshold');
        if (wptEl) wptEl.value = s.wishPriceAlertMinDiscount;
      }

      // モデル
      if (s.model) document.getElementById('opt-model').value = s.model;

      // 1min.ai設定
      if (s.aiProvider) {
        var pSel = document.getElementById('opt-ai-provider');
        if (pSel) { pSel.value = s.aiProvider; if (oneminSettings) oneminSettings.style.display = s.aiProvider === '1min' ? 'block' : 'none'; }
      }
      if (s.oneMinModel) { var omSel = document.getElementById('opt-onemin-model'); if (omSel) omSel.value = s.oneMinModel; }
      if (oneminKey) {
        var st = document.getElementById('onemin-key-status');
        if (st) st.textContent = '✓ キー設定済み: ' + oneminKey.slice(0,8) + '••••';
      }
    });
  }

  function updateKeyStatus(key) {
    var el = document.getElementById('key-status');
    if (key) {
      el.textContent = '✓ キー設定済み: ' + key.slice(0, 8) + '••••' + key.slice(-4);
      el.className = 'status-box status-ok';
    } else {
      el.textContent = '⚠ APIキーが未設定です';
      el.className = 'status-box status-warn';
    }
  }

  // ── APIキー ──
  document.getElementById('toggle-key-btn').addEventListener('click', function () {
    var input = document.getElementById('api-key-input');
    var isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    this.textContent = isPass ? '隠す' : '表示';
  });

  document.getElementById('save-key-btn').addEventListener('click', function () {
    var key = document.getElementById('api-key-input').value.trim();
    if (!key) { showStatus(document.getElementById('key-status'), 'キーを入力してください', 'err'); return; }
    var obj = {}; obj[KEY_GEMINI] = key;
    chrome.storage.local.set(obj, function () { updateKeyStatus(key); });
  });

  document.getElementById('clear-key-btn').addEventListener('click', function () {
    chrome.storage.local.remove([KEY_GEMINI], function () {
      document.getElementById('api-key-input').value = '';
      updateKeyStatus(null);
    });
  });

  // ── 全般設定 保存 ──
  document.getElementById('save-general').addEventListener('click', function () {
    var mlInput = document.getElementById('opt-min-review-length');
    var aeInput = document.getElementById('opt-ai-auto-enrich');
    var wptInput = document.getElementById('opt-wish-price-threshold');
    chrome.storage.local.get([KEY_SETTINGS], function (result) {
      var s = result[KEY_SETTINGS] || {};
      s.langBadge       = document.getElementById('opt-lang-badge').checked;
      s.highlight        = document.getElementById('opt-highlight').checked;
      s.toast             = document.getElementById('opt-toast').checked;
      s.autoTranslate     = document.getElementById('opt-auto-translate').checked;
      s.geminiTranslate   = document.getElementById('opt-gemini-translate').checked;
      s.transEngine       = document.getElementById('opt-trans-engine').value;
      s.bulkDelay         = parseInt(document.getElementById('opt-bulk-delay').value, 10);
      s.minReviewLength   = mlInput ? (parseInt(mlInput.value, 10) || 0) : 0;
      s.aiAutoEnrich       = aeInput ? aeInput.checked : false;
      s.wishPriceAlertMinDiscount = wptInput ? (parseInt(wptInput.value, 10) || 0) : 0;
      var obj = {}; obj[KEY_SETTINGS] = s;
      chrome.storage.local.set(obj, function () {
        showStatus(document.getElementById('status-general'), '✓ 保存しました', 'ok');
      });
    });
  });

  // ── 自動化設定 保存（1min.ai保存ボタンとは別枠。同じページ内だが
  //    save-onemin-btnのハンドラはaiAutoEnrichを書き込まないため専用ボタンが必要）──
  document.getElementById('save-auto-enrich-btn').addEventListener('click', function () {
    var aeInput = document.getElementById('opt-ai-auto-enrich');
    chrome.storage.local.get([KEY_SETTINGS], function (result) {
      var s = result[KEY_SETTINGS] || {};
      s.aiAutoEnrich = aeInput ? aeInput.checked : false;
      var obj = {}; obj[KEY_SETTINGS] = s;
      chrome.storage.local.set(obj, function () {
        showStatus(document.getElementById('auto-enrich-save-status'), '✓ 保存しました', 'ok');
      });
    });
  });

  // ── Discord Webhook連携 ──
  document.getElementById('save-discord-btn').addEventListener('click', function () {
    var input = document.getElementById('discord-webhook-input');
    var url = input ? input.value.trim() : '';
    var obj = {}; obj[KEY_DISCORD_WEBHOOK] = url;
    chrome.storage.local.set(obj, function () {
      showStatus(document.getElementById('discord-save-status'), '✓ 保存しました', 'ok');
    });
  });
  document.getElementById('test-discord-btn').addEventListener('click', async function () {
    var input = document.getElementById('discord-webhook-input');
    var url = input ? input.value.trim() : '';
    var statusEl = document.getElementById('discord-save-status');
    if (!url) { showStatus(statusEl, 'Webhook URLを入力してください', 'err'); return; }
    try {
      var r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [{
          title: '🔥 テスト通知',
          description: '▪ **Stardew Valley**\n~~¥1,480~~ → **¥740**（-50%）\n\nこんな見た目で値下げ通知が届きます。',
          color: 0x4caf50,
          thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/header.jpg' },
          footer: { text: 'Steam Japanese Translator' },
          timestamp: new Date().toISOString()
        }] })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      showStatus(statusEl, '✓ テスト送信しました。Discordを確認してください', 'ok');
    } catch (e) {
      showStatus(statusEl, '⚠ 送信失敗: ' + e.message, 'err');
    }
  });

  // ── IsThereAnyDeal APIキー ──
  document.getElementById('save-itad-btn').addEventListener('click', function () {
    var input = document.getElementById('itad-key-input');
    var key = input ? input.value.trim() : '';
    var obj = {}; obj[KEY_ITAD] = key;
    chrome.storage.local.set(obj, function () {
      showStatus(document.getElementById('itad-save-status'), '✓ 保存しました', 'ok');
    });
  });

  // ── モデル設定 保存 ──
  document.getElementById('save-model-btn').addEventListener('click', function () {
    chrome.storage.local.get([KEY_SETTINGS], function (result) {
      var s = result[KEY_SETTINGS] || {};
      s.model = document.getElementById('opt-model').value;
      var obj = {}; obj[KEY_SETTINGS] = s;
      chrome.storage.local.set(obj, function () {
        showStatus(document.getElementById('model-status'), '✓ 保存しました', 'ok');
      });
    });
  });

  // ── 1min.ai設定 ──
  var ONE_MIN_KEY = 'ja_trans_1min_key';
  var providerSel = document.getElementById('opt-ai-provider');
  var oneminSettings = document.getElementById('onemin-settings');
  if (providerSel) {
    providerSel.addEventListener('change', function () {
      if (oneminSettings) oneminSettings.style.display = this.value === '1min' ? 'block' : 'none';
    });
  }
  var toggleBtn = document.getElementById('onemin-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      var inp = document.getElementById('onemin-key-input');
      var isPass = inp.type === 'password';
      inp.type = isPass ? 'text' : 'password';
      this.textContent = isPass ? '隠す' : '表示';
    });
  }
  document.getElementById('save-onemin-btn').addEventListener('click', function () {
    var key = document.getElementById('onemin-key-input').value.trim();
    var model = document.getElementById('opt-onemin-model').value;
    var provider = document.getElementById('opt-ai-provider').value;
    chrome.storage.local.get([KEY_SETTINGS, ONE_MIN_KEY], function (result) {
      var s = result[KEY_SETTINGS] || {};
      s.aiProvider = provider;
      s.oneMinModel = model;
      var obj = {}; obj[KEY_SETTINGS] = s;
      if (key) obj[ONE_MIN_KEY] = key;
      chrome.storage.local.set(obj, function () {
        var st = document.getElementById('onemin-key-status');
        if (st) { st.textContent = key ? '✓ キー保存済み: ' + key.slice(0,8) + '••••' : '（キー未変更）'; }
        showStatus(document.getElementById('onemin-save-status'), '✓ 保存しました', 'ok');
      });
    });
  });

  loadSettings();

  // ── 1min.ai 専用設定ページ ──
  (function() {
    var OM_KEY = 'ja_trans_1min_key';

    function omUpdateKeyStatus(key) {
      var el = document.getElementById('om-key-status');
      if (!el) return;
      if (key) {
        el.textContent = '✓ キー設定済み: ' + key.slice(0,8) + '••••' + key.slice(-4);
        el.style.color = '#4caf50';
      } else {
        el.textContent = '⚠ APIキーが未設定です';
        el.style.color = '#f6c744';
      }
    }

    // 現在有効な設定を表示（実際にchrome.storageに保存されている値を都度読み直す）
    function refreshCurrentStatus() {
      var el = document.getElementById('om-current-status');
      if (!el) return;
      chrome.storage.local.get([KEY_SETTINGS], function(r) {
        var s = r[KEY_SETTINGS] || {};
        var provider = s.aiProvider === '1min' ? '1min.ai' : 'Gemini';
        var model = s.aiProvider === '1min' ? (s.oneMinModel || 'qwen3-8b') : (s.model || 'gemini-3.6-flash');
        var transEngineLabel = { '1min': '1min.ai', gemini: 'Gemini', google: 'Google Translate', mymemory: 'MyMemory' }[s.transEngine] || s.transEngine || '未設定';
        el.textContent = '📌 AI分析: ' + provider + '（' + model + '） ／ 翻訳エンジン: ' + transEngineLabel;
      });
    }

    // ワンクリックで1min.ai + Qwen3-8Bを全箇所デフォルトに設定
    var useDefaultsBtn = document.getElementById('om-use-defaults-btn');
    if (useDefaultsBtn) {
      useDefaultsBtn.addEventListener('click', function() {
        chrome.storage.local.get([KEY_SETTINGS], function(result) {
          var s = result[KEY_SETTINGS] || {};
          s.aiProvider = '1min';
          s.oneMinModel = 'qwen3-8b';
          s.transEngine = '1min';
          var obj = {}; obj[KEY_SETTINGS] = s;
          chrome.storage.local.set(obj, function() {
            var ps = document.getElementById('om-provider-select'); if (ps) ps.value = '1min';
            var ms = document.getElementById('om-model-select'); if (ms) ms.value = 'qwen3-8b';
            var pSelAi = document.getElementById('opt-ai-provider'); if (pSelAi) pSelAi.value = '1min';
            var omSelAi = document.getElementById('opt-onemin-model'); if (omSelAi) omSelAi.value = 'qwen3-8b';
            var teSel = document.getElementById('opt-trans-engine'); if (teSel) teSel.value = '1min';
            showStatus(document.getElementById('om-save-status'), '✓ 1min.ai + Qwen3-8Bを全箇所デフォルトにしました', 'ok');
            refreshCurrentStatus();
          });
        });
      });
    }

    // 初期値ロード
    chrome.storage.local.get([OM_KEY, KEY_SETTINGS], function(r) {
      omUpdateKeyStatus(r[OM_KEY] || null);
      var s = r[KEY_SETTINGS] || {};
      if (r[OM_KEY]) document.getElementById('om-key-input').value = r[OM_KEY];
      if (s.oneMinModel) { var ms = document.getElementById('om-model-select'); if (ms) ms.value = s.oneMinModel; }
      if (s.aiProvider)  { var ps = document.getElementById('om-provider-select'); if (ps) ps.value = s.aiProvider; }
      refreshCurrentStatus();
    });

    // 表示/非表示トグル
    document.getElementById('om-toggle-btn').addEventListener('click', function() {
      var inp = document.getElementById('om-key-input');
      var isPass = inp.type === 'password';
      inp.type = isPass ? 'text' : 'password';
      this.textContent = isPass ? '隠す' : '表示';
    });

    // キー保存
    document.getElementById('om-save-key-btn').addEventListener('click', function() {
      var key = document.getElementById('om-key-input').value.trim();
      if (!key) { omUpdateKeyStatus(null); return; }
      var obj = {}; obj[OM_KEY] = key;
      chrome.storage.local.set(obj, function() { omUpdateKeyStatus(key); });
    });

    // キー削除
    document.getElementById('om-clear-key-btn').addEventListener('click', function() {
      chrome.storage.local.remove([OM_KEY], function() {
        document.getElementById('om-key-input').value = '';
        omUpdateKeyStatus(null);
      });
    });

    // 接続テスト
    document.getElementById('om-test-btn').addEventListener('click', function() {
      var key = document.getElementById('om-key-input').value.trim();
      if (!key) { chrome.storage.local.get([OM_KEY], function(r){ testConnection(r[OM_KEY]); }); return; }
      testConnection(key);
    });

    function testConnection(key) {
      var statusEl = document.getElementById('om-test-status');
      if (!key) { statusEl.textContent = '⚠ APIキーを入力してください'; statusEl.style.color = '#f6c744'; return; }
      statusEl.textContent = '接続テスト中...'; statusEl.style.color = '#8f98a0';
      var model = document.getElementById('om-model-select').value || 'gpt-4o-mini';
      fetch('https://api.1min.ai/api/chat-with-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'API-KEY': key },
        body: JSON.stringify({
          type: 'UNIFY_CHAT_WITH_AI',
          model: model,
          promptObject: { prompt: 'Reply with just: ok', settings: { historySettings: { isMixed: false, historyMessageLimit: 0 }, webSearchSettings: { webSearch: false } } }
        })
      }).then(function(r){ return r.json(); }).then(function(d) {
        if (d.aiRecord && d.aiRecord.status === 'SUCCESS') {
          statusEl.textContent = '✓ 接続成功！モデル: ' + model + ' / レスポンス: ' + (d.aiRecord.aiRecordDetail.resultObject[0] || '').slice(0,30);
          statusEl.style.color = '#4caf50';
        } else {
          statusEl.textContent = '✗ エラー: ' + (d.message || JSON.stringify(d).slice(0,80));
          statusEl.style.color = '#e74c3c';
        }
      }).catch(function(e) {
        statusEl.textContent = '✗ 接続失敗: ' + e.message;
        statusEl.style.color = '#e74c3c';
      });
    }

    // すべて保存
    document.getElementById('om-save-all-btn').addEventListener('click', function() {
      var key = document.getElementById('om-key-input').value.trim();
      var model = document.getElementById('om-model-select').value;
      var provider = document.getElementById('om-provider-select').value;
      chrome.storage.local.get([KEY_SETTINGS], function(result) {
        var s = result[KEY_SETTINGS] || {};
        s.aiProvider = provider;
        s.oneMinModel = model;
        var obj = {}; obj[KEY_SETTINGS] = s;
        if (key) { obj['ja_trans_1min_key'] = key; omUpdateKeyStatus(key); }
        chrome.storage.local.set(obj, function() {
          showStatus(document.getElementById('om-save-status'), '✓ 保存しました', 'ok');
          refreshCurrentStatus();
        });
      });
    });
  })();

  // ── 機能17: 用語辞書 ──
  var GLOSSARY_KEY = 'ja_trans_glossary_v1';
  var _glossary = {};

  function renderGlossaryList() {
    var list = document.getElementById('glossary-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    var keys = Object.keys(_glossary);
    if (!keys.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'color:#8f98a0;font-size:12px;text-align:center;padding:20px;';
      empty.textContent = '辞書エントリがありません';
      list.appendChild(empty);
      return;
    }
    keys.forEach(function(k) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(42,71,94,0.5);';
      var keyEl = document.createElement('span');
      keyEl.style.cssText = 'color:#66c0f4;font-size:12px;flex:1;';
      keyEl.textContent = k;
      var arrow = document.createElement('span');
      arrow.style.cssText = 'color:#4a5a6a;font-size:12px;';
      arrow.textContent = '→';
      var valEl = document.createElement('span');
      valEl.style.cssText = 'color:#c6d4df;font-size:12px;flex:1;';
      valEl.textContent = _glossary[k];
      var delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.style.cssText = 'background:none;border:none;color:#e74c3c;cursor:pointer;font-size:12px;padding:0 4px;';
      delBtn.addEventListener('click', function() {
        delete _glossary[k];
        saveGlossary(function() { renderGlossaryList(); });
      });
      row.appendChild(keyEl); row.appendChild(arrow); row.appendChild(valEl); row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  function saveGlossary(cb) {
    var obj = {}; obj[GLOSSARY_KEY] = _glossary;
    chrome.storage.local.set(obj, function() {
      if (cb) cb();
    });
  }

  chrome.storage.local.get([GLOSSARY_KEY], function(r) {
    _glossary = r[GLOSSARY_KEY] || {};
    renderGlossaryList();
  });

  document.getElementById('glossary-add-btn').addEventListener('click', function() {
    var keyInput = document.getElementById('glossary-key');
    var valInput = document.getElementById('glossary-val');
    var k = keyInput.value.trim();
    var v = valInput.value.trim();
    if (!k || !v) {
      showStatus(document.getElementById('glossary-status'), 'キーと値を入力してください', 'err');
      return;
    }
    _glossary[k] = v;
    saveGlossary(function() {
      keyInput.value = ''; valInput.value = '';
      renderGlossaryList();
      showStatus(document.getElementById('glossary-status'), '✓ 追加しました', 'ok');
    });
  });

  // ── 機能23: 所持ゲーム ──
  var OWNED_KEY = 'ja_trans_owned_games_v1';
  var OWNED_DETAIL_KEY = 'ja_trans_owned_games_detail_v1';

  chrome.storage.local.get([OWNED_KEY], function(r) {
    var owned = r[OWNED_KEY] || [];
    var textarea = document.getElementById('owned-games-input');
    if (textarea) textarea.value = owned.join('\n');
  });

  document.getElementById('save-owned-btn').addEventListener('click', function() {
    var textarea = document.getElementById('owned-games-input');
    var raw = textarea ? textarea.value : '';
    var owned = raw.split(/[\n,]/).map(function(s){ return s.trim(); }).filter(Boolean);
    var obj = {}; obj[OWNED_KEY] = owned;
    chrome.storage.local.set(obj, function() {
      showStatus(document.getElementById('owned-status'), '✓ ' + owned.length + 'タイトル保存しました', 'ok');
    });
  });

  document.getElementById('clear-owned-btn').addEventListener('click', function() {
    var textarea = document.getElementById('owned-games-input');
    if (textarea) textarea.value = '';
    var obj = {}; obj[OWNED_KEY] = [];
    chrome.storage.local.set(obj, function() {
      showStatus(document.getElementById('owned-status'), 'クリアしました', 'ok');
    });
  });

  // ── Steam Web APIキー & ライブラリ自動取得 ──
  var KEY_STEAM_API = 'ja_trans_steam_api_key';

  function updateSteamKeyStatus(key) {
    var el = document.getElementById('steam-key-status');
    if (!el) return;
    if (key) {
      el.textContent = '✓ キー設定済み: ' + key.slice(0, 6) + '••••' + key.slice(-4);
      el.className = 'status-box status-ok';
    } else {
      el.textContent = '';
      el.className = '';
    }
  }

  chrome.storage.local.get([KEY_STEAM_API], function (r) {
    var key = r[KEY_STEAM_API];
    var input = document.getElementById('steam-api-key-input');
    if (key && input) input.value = key;
    updateSteamKeyStatus(key);
  });

  document.getElementById('toggle-steam-key-btn').addEventListener('click', function () {
    var input = document.getElementById('steam-api-key-input');
    var isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    this.textContent = isPass ? '隠す' : '表示';
  });

  document.getElementById('save-steam-key-btn').addEventListener('click', function () {
    var key = document.getElementById('steam-api-key-input').value.trim();
    if (!key) { showStatus(document.getElementById('steam-key-status'), 'キーを入力してください', 'err'); return; }
    var obj = {}; obj[KEY_STEAM_API] = key;
    chrome.storage.local.set(obj, function () { updateSteamKeyStatus(key); });
  });

  document.getElementById('clear-steam-key-btn').addEventListener('click', function () {
    chrome.storage.local.remove([KEY_STEAM_API], function () {
      document.getElementById('steam-api-key-input').value = '';
      updateSteamKeyStatus(null);
    });
  });

  document.getElementById('fetch-owned-btn').addEventListener('click', function () {
    var fetchBtn = this;
    var statusEl = document.getElementById('fetch-owned-status');
    chrome.storage.local.get([KEY_STEAM_API], async function (r) {
      var key = r[KEY_STEAM_API];
      if (!key) { showStatus(statusEl, '⚠ 先にSteam Web APIキーを保存してください', 'err'); return; }
      fetchBtn.disabled = true;
      fetchBtn.textContent = '⏳ 取得中...';
      try {
        // 1. ログイン中の自分のSteamIDを特定（steamcommunity.com/my/ のリダイレクト先から取得）
        var meRes = await fetch('https://steamcommunity.com/my/', { credentials: 'include' });
        var steamid = null;
        var idMatch = meRes.url.match(/\/profiles\/(\d+)/);
        if (idMatch) {
          steamid = idMatch[1];
        } else {
          var vanityMatch = meRes.url.match(/\/id\/([^\/]+)/);
          if (vanityMatch) {
            var resolveRes = await fetch('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=' + encodeURIComponent(key) + '&vanityurl=' + encodeURIComponent(vanityMatch[1]));
            var resolveData = await resolveRes.json();
            if (resolveData.response && resolveData.response.success === 1) steamid = resolveData.response.steamid;
          }
        }
        if (!steamid) throw new Error('SteamIDを特定できませんでした（ブラウザでSteamにログインしているか確認してください）');

        // 2. 所持ゲーム一覧を取得（プレイ時間降順）
        var gamesRes = await fetch('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=' + encodeURIComponent(key) + '&steamid=' + steamid + '&include_appinfo=true&include_played_free_games=true&format=json');
        if (!gamesRes.ok) throw new Error('APIエラー: ' + gamesRes.status);
        var gamesData = await gamesRes.json();
        var games = (gamesData.response && gamesData.response.games) || [];
        if (!games.length) throw new Error('所持ゲームが0件でした');
        games.sort(function (a, b) { return (b.playtime_forever || 0) - (a.playtime_forever || 0); });
        var names = games.map(function (g) { return g.name; }).filter(Boolean);
        var detail = games.filter(function (g) { return g.name; }).map(function (g) {
          return { appid: g.appid, name: g.name, playtime_forever: g.playtime_forever || 0 };
        });

        var textarea = document.getElementById('owned-games-input');
        if (textarea) textarea.value = names.join('\n');
        var obj = {}; obj[OWNED_KEY] = names; obj[OWNED_DETAIL_KEY] = detail;
        chrome.storage.local.set(obj, function () {
          showStatus(statusEl, '✓ ' + names.length + '件のゲームを取得・保存しました', 'ok');
        });
      } catch (e) {
        showStatus(statusEl, '⚠ 取得失敗: ' + e.message, 'err');
      }
      fetchBtn.disabled = false;
      fetchBtn.textContent = '🔄 ライブラリから自動取得';
    });
  });

  // ── 機能16: 用語辞書プリセット ──
  var GLOSSARY_PRESETS = {
    'RPG': { 'HP': 'HP', 'MP': 'MP', 'buff': 'バフ', 'debuff': 'デバフ', 'aggro': 'ヘイト', 'tank': 'タンク', 'DPS': 'DPS' },
    'FPS': { 'headshot': 'ヘッドショット', 'frag': 'キル', 'spawn': 'スポーン', 'hitbox': 'ヒットボックス', 'recoil': '反動' },
    'RTS': { 'micro': 'マイクロ操作', 'macro': 'マクロ戦略', 'rush': 'ラッシュ', 'creep': 'クリープ', 'gg': '勝ち負け宣言' },
    'MOBA': { 'gank': 'ガンク', 'lane': 'レーン', 'jungle': 'ジャングル', 'carry': 'キャリー', 'support': 'サポート' },
    'Roguelike': { 'run': 'ラン', 'seed': 'シード', 'meta': 'メタ進行', 'synergy': 'シナジー', 'build': 'ビルド' }
  };

  var presetBtn = document.getElementById('glossary-preset-btn');
  var presetSelect = document.getElementById('glossary-preset-select');
  var presetStatus = document.getElementById('glossary-preset-status');
  if (presetBtn && presetSelect) {
    presetBtn.addEventListener('click', function() {
      var selected = presetSelect.value;
      if (!selected) {
        showStatus(presetStatus, 'プリセットを選択してください', 'err');
        return;
      }
      var preset = GLOSSARY_PRESETS[selected];
      if (!preset) return;
      chrome.storage.local.get([GLOSSARY_KEY], function(r) {
        var current = r[GLOSSARY_KEY] || {};
        var added = 0;
        Object.keys(preset).forEach(function(k) {
          if (!current[k]) { current[k] = preset[k]; added++; }
        });
        var obj = {}; obj[GLOSSARY_KEY] = current;
        chrome.storage.local.set(obj, function() {
          _glossary = current;
          renderGlossaryList();
          showStatus(presetStatus, '✓ ' + selected + 'プリセット ' + added + '語を追加しました', 'ok');
        });
      });
    });
  }

  // ── 機能28: プレイスタイル設定 ──
  var PLAYSTYLE_KEY = 'ja_trans_playstyle_v1';

  function loadPlaystyle() {
    chrome.storage.local.get([PLAYSTYLE_KEY], function(r) {
      var ps = r[PLAYSTYLE_KEY] || {};
      if (ps.casual !== undefined) {
        var el = document.getElementById(ps.casual ? 'ps-casual' : 'ps-hardcore');
        if (el) el.checked = true;
      }
      if (ps.mode) {
        var modeEl = document.getElementById('ps-' + ps.mode);
        if (modeEl) modeEl.checked = true;
      }
      if (ps.genres && ps.genres.length) {
        document.querySelectorAll('.ps-genre').forEach(function(cb) {
          cb.checked = ps.genres.indexOf(cb.value) >= 0;
        });
      }
      if (ps.weeklyHours) {
        document.querySelectorAll('[name="ps-hours"]').forEach(function(rb) {
          rb.checked = rb.value === ps.weeklyHours;
        });
      }
    });
  }

  var savePlaystyleBtn = document.getElementById('save-playstyle-btn');
  if (savePlaystyleBtn) {
    savePlaystyleBtn.addEventListener('click', function() {
      var casualEl = document.getElementById('ps-casual');
      var hardcoreEl = document.getElementById('ps-hardcore');
      var casual = casualEl && casualEl.checked ? true : (hardcoreEl && hardcoreEl.checked ? false : null);
      var modeEl = document.querySelector('[name="ps-mode"]:checked');
      var mode = modeEl ? modeEl.value : null;
      var genres = [];
      document.querySelectorAll('.ps-genre:checked').forEach(function(cb) { genres.push(cb.value); });
      var hoursEl = document.querySelector('[name="ps-hours"]:checked');
      var weeklyHours = hoursEl ? hoursEl.value : null;
      var ps = { casual: casual, mode: mode, genres: genres, weeklyHours: weeklyHours };
      var obj = {}; obj[PLAYSTYLE_KEY] = ps;
      chrome.storage.local.set(obj, function() {
        showStatus(document.getElementById('playstyle-status'), '✓ 保存しました', 'ok');
      });
    });
    loadPlaystyle();
  }
})();
