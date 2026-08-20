'use strict';
var html = require('../lib/html.js');

function renderLayout(bodyHtml, opts) {
  opts = opts || {};
  var query = opts.query || '';
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Steamゲーム分析</title>'
    + '<style>'
    + 'body{font-family:sans-serif;max-width:720px;margin:0 auto;padding:16px;background:#1b2838;color:#c7d5e0}'
    + 'a{color:#66c0f4}'
    + '.search-form{display:flex;gap:8px;margin:16px 0}'
    + '.search-form input{flex:1;padding:8px;border-radius:4px;border:none}'
    + '.search-form button{padding:8px 16px;border-radius:4px;border:none;background:#66c0f4;cursor:pointer}'
    + '.game-card{background:#2a3f5a;padding:16px;border-radius:8px}'
    + '.orig{text-decoration:line-through;opacity:0.6}'
    + '</style></head><body>'
    + '<header><h1>🎮 Steamゲーム分析</h1>'
    + '<form method="GET" action="/analyze" class="search-form">'
    + '<input type="text" name="name" placeholder="ゲーム名で検索" value="' + html.escapeHtml(query) + '" required>'
    + '<button type="submit">分析する</button>'
    + '</form></header>'
    + '<main>' + bodyHtml + '</main>'
    + '</body></html>';
}

module.exports = { renderLayout: renderLayout };
