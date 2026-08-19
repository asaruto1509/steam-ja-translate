'use strict';

// APIが応答しない場合にコマンドが無期限にハングするのを防ぐため、
// AbortControllerでfetch全体にタイムアウトを付ける共通ラッパー。
var DEFAULT_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  fetchWithTimeout: fetchWithTimeout,
  DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS
};
