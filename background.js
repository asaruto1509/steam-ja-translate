chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'proxyFetch') {
    // Steamアプリ内蔵ブラウザ(CEF)ではcontent scriptからの外部ドメイン通信が
    // 制限される場合があるため、バックグラウンド(ページCSPの影響を受けない)経由で代行する。
    (async function () {
      try {
        var res = await fetch(msg.url, msg.options || {});
        var bodyText = await res.text();
        sendResponse({ ok: res.ok, status: res.status, bodyText: bodyText });
      } catch (e) {
        sendResponse({ ok: false, status: 0, error: String((e && e.message) || e) });
      }
    })();
    return true;
  }
  if (msg.type === 'injectMain' && sender.tab) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['main.js'],
      world: 'ISOLATED'
    }).catch(function (e) {
      console.error('[SteamJaTrans] inject failed:', e);
    });
    return;
  }
  if (msg.type === 'getWishlistSSR' && sender.tab) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: function () {
        try {
          var raw = window.SSR && window.SSR.renderContext && window.SSR.renderContext.queryData;
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          var q = (parsed.queries || []).find(function (qq) { return qq.queryKey && qq.queryKey[0] === 'WishlistSortedFiltered'; });
          var items = q && q.state && q.state.data && q.state.data.items;
          if (!items) return null;
          return items.map(function (it) { return { appid: String(it.appid), dateAdded: it.date_added || null }; });
        } catch (e) { return null; }
      }
    }).then(function (results) {
      var items = results && results[0] && results[0].result;
      var ids = [], dateAdded = {};
      (items || []).forEach(function (it) { ids.push(it.appid); if (it.dateAdded) dateAdded[it.appid] = it.dateAdded; });
      sendResponse({ ids: ids, dateAdded: dateAdded });
    }).catch(function () {
      sendResponse({ ids: [], dateAdded: {} });
    });
    return true;
  }
});

// ── ウィッシュリスト値下げ通知（1日1回バックグラウンドチェック） ──
var WISH_PRICE_KEY = 'ja_trans_wish_price_history_v1';
var WISH_ALARM_NAME = 'ja_trans_wishlist_price_check';
var SETTINGS_KEY = 'ja_trans_settings';
var AI_VERDICT_MAP_KEY = 'ja_trans_ai_verdict_map_v1';
var VERDICT_RANK = { '今すぐ買い': 0, '買い': 1, 'セール待ち': 2, '人を選ぶ': 3, '見送り': 4 };
var DISCORD_WEBHOOK_KEY = 'ja_trans_discord_webhook';
var VERDICT_EMOJI = { '今すぐ買い': '🔥', '買い': '✅', 'セール待ち': '⏳', '人を選ぶ': '🤔', '見送り': '⛔' };

async function _sendDiscordNotification(embed) {
  var r = await new Promise(function (res) { chrome.storage.local.get([DISCORD_WEBHOOK_KEY], res); });
  var url = r[DISCORD_WEBHOOK_KEY];
  if (!url) return;
  embed.footer = embed.footer || { text: 'Steam Japanese Translator' };
  embed.timestamp = new Date().toISOString();
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) { /* Discord通知が失敗してもSteam側の通知自体には影響させない */ }
}

function ensureWishlistAlarm() {
  chrome.alarms.get(WISH_ALARM_NAME, function (a) {
    if (!a) chrome.alarms.create(WISH_ALARM_NAME, { periodInMinutes: 1440 });
  });
}
// ウィッシュリスト値下げチェックはGitHub Actions(.github/workflows/wishlist-price-check.yml)に
// 移行したため、拡張機能側の自動起動は無効化する(二重通知防止)。
// chrome.runtime.onInstalled.addListener(ensureWishlistAlarm);
// chrome.runtime.onStartup.addListener(ensureWishlistAlarm);

// chrome.alarms.onAlarm.addListener(function (alarm) {
//   if (alarm.name === WISH_ALARM_NAME) checkWishlistPrices();
// });

async function checkWishlistPrices() {
  try {
    var r = await fetch('https://store.steampowered.com/dynamicstore/userdata/', { credentials: 'include' });
    if (!r.ok) return;
    var j = await r.json();
    var ids = (j.rgWishlist || []).map(String);
    if (!ids.length) return;

    var settingsObj = await new Promise(function (res) { chrome.storage.local.get([SETTINGS_KEY], res); });
    var minDiscountPct = (settingsObj[SETTINGS_KEY] && settingsObj[SETTINGS_KEY].wishPriceAlertMinDiscount) || 0;

    var histObj = await new Promise(function (res) { chrome.storage.local.get([WISH_PRICE_KEY], res); });
    var hist = histObj[WISH_PRICE_KEY] || {};
    var drops = [];
    // ウィッシュリスト全件を一気に叩くとAkamaiのbot判定に引っかかるため、
    // 同時実行数を絞りチャンク間隔を広めに取る(バックグラウンドの1日1回チェックなので急ぐ必要はない)。
    var CHUNK = 4;
    for (var i = 0; i < ids.length; i += CHUNK) {
      var chunk = ids.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async function (id) {
        try {
          var dr = await fetch('https://store.steampowered.com/api/appdetails?appids=' + id + '&filters=basic,price_overview&cc=jp');
          if (!dr.ok) return;
          var dd = await dr.json();
          var info = dd && dd[id] && dd[id].data;
          if (!info || !info.price_overview) return;
          var price = Math.floor(info.price_overview.final / 100);
          var prev = hist[id];
          if (prev != null && price < prev) {
            var dropPct = prev > 0 ? Math.round((prev - price) / prev * 100) : 0;
            if (dropPct >= minDiscountPct) {
              drops.push({ id: id, name: info.name, prevPrice: prev, price: price, dropPct: dropPct });
              hist[id] = price;
            }
            // 閾値未満の下落は基準値(hist)を更新しない。更新してしまうと閾値以下の
            // 下落が何日も積み重なった末の大きな値下げを検知できなくなるため。
          } else if (prev !== price) {
            hist[id] = price;
          }
        } catch (e) { /* この1件はスキップ */ }
      }));
      if (i + CHUNK < ids.length) await new Promise(function (res) { setTimeout(res, 800); });
    }

    var obj = {}; obj[WISH_PRICE_KEY] = hist;
    chrome.storage.local.set(obj);

    if (!drops.length) return;
    if (drops.length === 1) {
      var d = drops[0];
      chrome.notifications.create('ja_trans_price_' + d.id, {
        type: 'basic',
        iconUrl: 'icon128.png',
        title: '💰 ' + d.name + ' が値下げされました',
        message: '¥' + d.prevPrice.toLocaleString() + ' → ¥' + d.price.toLocaleString(),
        priority: 1
      });
      _sendDiscordNotification({
        title: '💰 ' + d.name + ' が値下げされました',
        url: 'https://store.steampowered.com/app/' + d.id + '/',
        color: 0x4caf50,
        thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + d.id + '/header.jpg' },
        fields: [
          { name: '価格', value: '~~¥' + d.prevPrice.toLocaleString() + '~~ → **¥' + d.price.toLocaleString() + '**', inline: true },
          { name: '割引率', value: '-' + d.dropPct + '%', inline: true }
        ]
      });
    } else if (drops.length >= 3) {
      // AI判定順マップ(軽量)を使ってベスト3をダイジェスト表示。
      // _aiCache本体は非常に大きくなり得るため読み込まず、判定だけの小さいマップを参照する。
      var verdictObj = await new Promise(function (res) { chrome.storage.local.get([AI_VERDICT_MAP_KEY], res); });
      var verdictMap = verdictObj[AI_VERDICT_MAP_KEY] || {};
      var ranked = drops.slice().sort(function (a, b) {
        var ra = VERDICT_RANK[verdictMap[a.id]] != null ? VERDICT_RANK[verdictMap[a.id]] : 9;
        var rb = VERDICT_RANK[verdictMap[b.id]] != null ? VERDICT_RANK[verdictMap[b.id]] : 9;
        if (ra !== rb) return ra - rb;
        return b.dropPct - a.dropPct;
      });
      var best3 = ranked.slice(0, 3);
      var hasVerdict = best3.some(function (d) { return verdictMap[d.id]; });
      chrome.notifications.create('ja_trans_price_multi', {
        type: 'basic',
        iconUrl: 'icon128.png',
        title: (hasVerdict ? '🎯 セール中！AI判定ベスト' : '💰 ウィッシュリストの') + drops.length + '件が値下げされました',
        message: best3.map(function (d) {
          var vv = verdictMap[d.id];
          return (vv ? '[' + vv + '] ' : '') + d.name;
        }).join('、') + (drops.length > 3 ? ' 他' : ''),
        priority: 1
      });
      _sendDiscordNotification({
        title: hasVerdict ? '🎯 セール中！AI判定ベスト' : '💰 ウィッシュリストの' + drops.length + '件が値下げされました',
        url: 'https://store.steampowered.com/wishlist/',
        color: hasVerdict ? 0xf6c744 : 0x66c0f4,
        thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + best3[0].id + '/header.jpg' },
        description: best3.map(function (d) {
          var vv = verdictMap[d.id];
          var emoji = vv && VERDICT_EMOJI[vv] ? VERDICT_EMOJI[vv] + ' ' : '▪ ';
          return emoji + '**' + d.name + '**' + (vv ? ' `' + vv + '`' : '')
            + '\n¥' + d.prevPrice.toLocaleString() + ' → ¥' + d.price.toLocaleString() + '（-' + d.dropPct + '%）';
        }).join('\n\n') + (drops.length > 3 ? '\n\n他' + (drops.length - 3) + '件' : ''),
        footer: { text: 'ウィッシュリスト全' + drops.length + '件が値下げ中' }
      });
    } else {
      chrome.notifications.create('ja_trans_price_multi', {
        type: 'basic',
        iconUrl: 'icon128.png',
        title: '💰 ウィッシュリストの' + drops.length + '件が値下げされました',
        message: drops.map(function (d) { return d.name; }).join('、'),
        priority: 1
      });
      _sendDiscordNotification({
        title: '💰 ウィッシュリストの' + drops.length + '件が値下げされました',
        url: 'https://store.steampowered.com/wishlist/',
        color: 0x66c0f4,
        thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + drops[0].id + '/header.jpg' },
        description: drops.map(function (d) {
          return '▪ **' + d.name + '**\n¥' + d.prevPrice.toLocaleString() + ' → ¥' + d.price.toLocaleString() + '（-' + d.dropPct + '%）';
        }).join('\n\n')
      });
    }
  } catch (e) {
    console.error('[SteamJaTrans] wishlist price check failed:', e);
  }
}

chrome.notifications.onClicked.addListener(function (notifId) {
  var m = notifId.match(/^ja_trans_price_(\d+)$/);
  if (m) {
    chrome.tabs.create({ url: 'https://store.steampowered.com/app/' + m[1] + '/' });
  } else if (notifId === 'ja_trans_price_multi') {
    chrome.tabs.create({ url: 'https://store.steampowered.com/wishlist/' });
  }
});
