'use strict';

var fs = require('node:fs');
var path = require('node:path');

// 既存のbackground.js内checkWishlistPricesと同じロジック(閾値未満の下落ではhistを更新しない)を
// ブラウザ非依存のNode.js純粋関数として移植したもの。
function detectPriceDrops(items, history, minDiscountPct) {
  var drops = [];
  var updatedHistory = Object.assign({}, history);
  items.forEach(function (item) {
    var prev = updatedHistory[item.id];
    if (prev != null && item.price < prev) {
      var dropPct = prev > 0 ? Math.round((prev - item.price) / prev * 100) : 0;
      if (dropPct >= minDiscountPct) {
        drops.push({ id: item.id, name: item.name, prevPrice: prev, price: item.price, dropPct: dropPct });
        updatedHistory[item.id] = item.price;
      }
      // 閾値未満の下落はhistを更新しない。何日も積み重なった末の大きな値下げを検知できるようにするため。
    } else if (prev !== item.price) {
      updatedHistory[item.id] = item.price;
    }
  });
  return { drops: drops, updatedHistory: updatedHistory };
}

// 既存background.jsのVERDICT_RANK/VERDICT_EMOJIと同じ値。
// Discord通知内のAI判定バッジ表示・ランキング順位付けに使う。
var VERDICT_RANK = { '今すぐ買い': 0, '買い': 1, 'セール待ち': 2, '人を選ぶ': 3, '見送り': 4 };
var VERDICT_EMOJI = { '今すぐ買い': '🔥', '買い': '✅', 'セール待ち': '⏳', '人を選ぶ': '🤔', '見送り': '⛔' };

// 既存background.js の _sendDiscordNotification 呼び出し3パターン(1件/2件/3件以上)を
// 1つの純粋関数に統合したもの。embedの見た目は既存通知と同一にする。
function buildDiscordEmbed(drops, verdictMap) {
  verdictMap = verdictMap || {};

  if (drops.length === 1) {
    var d = drops[0];
    return {
      title: '💰 ' + d.name + ' が値下げされました',
      url: 'https://store.steampowered.com/app/' + d.id + '/',
      color: 0x4caf50,
      thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + d.id + '/header.jpg' },
      fields: [
        { name: '価格', value: '~~¥' + d.prevPrice.toLocaleString() + '~~ → **¥' + d.price.toLocaleString() + '**', inline: true },
        { name: '割引率', value: '-' + d.dropPct + '%', inline: true }
      ]
    };
  }

  if (drops.length >= 3) {
    var ranked = drops.slice().sort(function (a, b) {
      var ra = VERDICT_RANK[verdictMap[a.id]] != null ? VERDICT_RANK[verdictMap[a.id]] : 9;
      var rb = VERDICT_RANK[verdictMap[b.id]] != null ? VERDICT_RANK[verdictMap[b.id]] : 9;
      if (ra !== rb) return ra - rb;
      return b.dropPct - a.dropPct;
    });
    var best3 = ranked.slice(0, 3);
    var hasVerdict = best3.some(function (dd) { return verdictMap[dd.id]; });
    return {
      title: hasVerdict ? '🎯 セール中！AI判定ベスト' : '💰 ウィッシュリストの' + drops.length + '件が値下げされました',
      url: 'https://store.steampowered.com/wishlist/',
      color: hasVerdict ? 0xf6c744 : 0x66c0f4,
      thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + best3[0].id + '/header.jpg' },
      description: best3.map(function (dd) {
        var vv = verdictMap[dd.id];
        var emoji = vv && VERDICT_EMOJI[vv] ? VERDICT_EMOJI[vv] + ' ' : '▪ ';
        return emoji + '**' + dd.name + '**' + (vv ? ' `' + vv + '`' : '')
          + '\n¥' + dd.prevPrice.toLocaleString() + ' → ¥' + dd.price.toLocaleString() + '（-' + dd.dropPct + '%）';
      }).join('\n\n') + (drops.length > 3 ? '\n\n他' + (drops.length - 3) + '件' : ''),
      footer: { text: 'ウィッシュリスト全' + drops.length + '件が値下げ中' }
    };
  }

  return {
    title: '💰 ウィッシュリストの' + drops.length + '件が値下げされました',
    url: 'https://store.steampowered.com/wishlist/',
    color: 0x66c0f4,
    thumbnail: { url: 'https://cdn.akamai.steamstatic.com/steam/apps/' + drops[0].id + '/header.jpg' },
    description: drops.map(function (dd) {
      return '▪ **' + dd.name + '**\n¥' + dd.prevPrice.toLocaleString() + ' → ¥' + dd.price.toLocaleString() + '（-' + dd.dropPct + '%）';
    }).join('\n\n')
  };
}

var VERDICT_LABELS = ['今すぐ買い', '買い', 'セール待ち', '人を選ぶ', '見送り'];

// AIは単一ラベルのみ返すよう指示するが、句読点や引用符が付いて返ることがあるため
// 完全一致 → 部分一致(長い順、"買い"が"今すぐ買い"の一部に誤爆しないよう長さ降順)の順で判定する。
function parseVerdictLabel(text) {
  if (!text) return null;
  var trimmed = String(text).trim();
  if (VERDICT_LABELS.indexOf(trimmed) >= 0) return trimmed;
  var byLength = VERDICT_LABELS.slice().sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < byLength.length; i++) {
    if (trimmed.indexOf(byLength[i]) >= 0) return byLength[i];
  }
  return null;
}

async function fetchWishlist(steamId64) {
  var r = await fetch('https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=' + steamId64);
  if (!r.ok) throw new Error('ウィッシュリスト取得に失敗しました(' + r.status + ')');
  var d = await r.json();
  return (d.response && d.response.items) || [];
}

async function fetchPrice(appid) {
  var r = await fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic,price_overview&cc=jp');
  if (!r.ok) return null;
  var d = await r.json();
  var info = d && d[appid] && d[appid].data;
  if (!info || !info.price_overview) return null;
  return { id: String(appid), name: info.name, price: Math.floor(info.price_overview.final / 100) };
}

async function fetchReviews(appid, count) {
  var r = await fetch('https://store.steampowered.com/appreviews/' + appid
    + '?json=1&num_per_page=' + (count || 15) + '&language=japanese&filter=recent&purchase_type=all');
  if (!r.ok) return [];
  var d = await r.json();
  return (d.reviews || []).map(function (rv) { return rv.review; }).filter(Boolean);
}

async function fetchVerdict(gameName, reviewTexts, apiKey) {
  if (!reviewTexts.length) return null;
  var joined = reviewTexts.join('\n---\n').slice(0, 3000);
  var prompt = 'あなたはSteamゲームレビューの要約AIです。以下は「' + gameName + '」のユーザーレビュー抜粋です。\n'
    + 'このゲームの購入判断を、次の5つのラベルのうち1つだけで答えてください。ラベル以外の文字は一切出力しないでください。\n'
    + 'ラベル: 今すぐ買い / 買い / セール待ち / 人を選ぶ / 見送り\n\n'
    + 'レビュー:\n' + joined;
  var body = {
    type: 'UNIFY_CHAT_WITH_AI',
    model: 'qwen3-8b',
    promptObject: { prompt: prompt, settings: { historySettings: { isMixed: false, historyMessageLimit: 0 }, webSearchSettings: { webSearch: false } } }
  };
  var r = await fetch('https://api.1min.ai/api/chat-with-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'API-KEY': apiKey },
    body: JSON.stringify(body)
  });
  var d = await r.json();
  if (!r.ok || d.errorCode) throw new Error(d.message || String(r.status));
  var text = (d.aiRecord && d.aiRecord.aiRecordDetail && d.aiRecord.aiRecordDetail.resultObject && d.aiRecord.aiRecordDetail.resultObject[0]) || '';
  return parseVerdictLabel(text);
}

async function sendDiscordNotification(embed, webhookUrl) {
  embed.footer = embed.footer || { text: 'Steam Japanese Translator (Cron)' };
  embed.timestamp = new Date().toISOString();
  var r = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });
  if (!r.ok) throw new Error('Discord webhook送信に失敗しました(' + r.status + ')');
}

function loadHistory(filePath) {
  var raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
  return JSON.parse(raw);
}

function saveHistory(filePath, history) {
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2) + '\n');
}

async function main() {
  var steamId = process.env.STEAM_ID64;
  var webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  var apiKey = process.env.ONEMIN_API_KEY;
  var minDiscountPct = Number(process.env.MIN_DISCOUNT_PCT || 0);
  var historyPath = path.join(__dirname, '..', 'price_history.json');

  if (!steamId || !webhookUrl) {
    console.error('STEAM_ID64 と DISCORD_WEBHOOK_URL は必須です');
    process.exit(1);
  }

  var wishlist = await fetchWishlist(steamId);
  console.log('ウィッシュリスト件数: ' + wishlist.length);

  if (!wishlist.length) {
    console.error('ウィッシュリストが0件でした。SteamプロフィールとウィッシュリストがPublic設定になっているか確認してください。');
    process.exit(1);
  }

  var items = [];
  var CHUNK = 4;
  for (var i = 0; i < wishlist.length; i += CHUNK) {
    var chunk = wishlist.slice(i, i + CHUNK);
    var results = await Promise.all(chunk.map(function (w) {
      return fetchPrice(w.appid).catch(function () { return null; });
    }));
    results.forEach(function (r) { if (r) items.push(r); });
    if (i + CHUNK < wishlist.length) {
      await new Promise(function (res) { setTimeout(res, 800); });
    }
  }
  console.log('価格取得成功件数: ' + items.length);

  var history = loadHistory(historyPath);
  var result = detectPriceDrops(items, history, minDiscountPct);
  console.log('値下げ検知件数: ' + result.drops.length);

  saveHistory(historyPath, result.updatedHistory);

  if (!result.drops.length) {
    console.log('値下げなし、終了します');
    return;
  }

  var verdictMap = {};
  if (result.drops.length >= 3 && apiKey) {
    for (var j = 0; j < result.drops.length; j++) {
      var drop = result.drops[j];
      try {
        var reviews = await fetchReviews(drop.id, 15);
        var verdict = await fetchVerdict(drop.name, reviews, apiKey);
        if (verdict) verdictMap[drop.id] = verdict;
      } catch (e) {
        console.error('AI判定失敗(appid=' + drop.id + '): ' + e.message);
      }
    }
  }

  var embed = buildDiscordEmbed(result.drops, verdictMap);
  await sendDiscordNotification(embed, webhookUrl);
  console.log('Discord通知を送信しました');
}

if (require.main === module) {
  main().catch(function (e) {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  detectPriceDrops: detectPriceDrops,
  buildDiscordEmbed: buildDiscordEmbed,
  parseVerdictLabel: parseVerdictLabel,
  VERDICT_RANK: VERDICT_RANK,
  VERDICT_EMOJI: VERDICT_EMOJI,
  fetchWishlist: fetchWishlist,
  fetchPrice: fetchPrice,
  fetchReviews: fetchReviews,
  fetchVerdict: fetchVerdict,
  sendDiscordNotification: sendDiscordNotification,
  loadHistory: loadHistory,
  saveHistory: saveHistory,
  main: main
};
