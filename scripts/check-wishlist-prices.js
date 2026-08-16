'use strict';

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

module.exports = {
  detectPriceDrops: detectPriceDrops,
  buildDiscordEmbed: buildDiscordEmbed,
  VERDICT_RANK: VERDICT_RANK,
  VERDICT_EMOJI: VERDICT_EMOJI,
  parseVerdictLabel: parseVerdictLabel
};
