'use strict';

// top_sellersとnew_releasesの両方に同じゲームが載っているケースがあるため、
// 選出前にid重複を除去する(同じゲームが1日の投稿内で2回出るのを防ぐ)。
function _dedupeById(pool) {
  var seen = {};
  return pool.filter(function (item) {
    if (seen[item.id]) return false;
    seen[item.id] = true;
    return true;
  });
}

// Fisher-Yatesシャッフルで先頭n件を返す。rngを注入可能にすることで
// テストから決定的な乱数列を渡せるようにしている。
function pickRandomGames(pool, n, rng) {
  rng = rng || Math.random;
  var arr = _dedupeById(pool).slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, n);
}

module.exports = { pickRandomGames: pickRandomGames };
