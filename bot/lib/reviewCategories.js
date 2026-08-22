'use strict';

// AIレビュー分析(/review, web dashboard)共通のカテゴリ評価軸。
// 両方のプロンプトから参照し、表示側(星グラフ・棒グラフ)は名前を問わず配列を汎用描画するので、
// ここに追加するだけで両サーフェスに反映される。
var CATEGORY_NAMES = [
  'ゲームプレイ',
  'ストーリー',
  'グラフィック',
  'アートスタイル',
  'サウンド',
  'コスパ',
  '安定性',
  'ボリューム',
  '操作性',
  '難易度バランス',
  '日本語対応',
  'リプレイ性',
  '没入感・世界観',
  '取っつきやすさ',
  'マルチプレイ体験',
  'コミュニティ・人口',
  '開発者サポート',
  '快適さ'
];

function buildCategorySchema() {
  return CATEGORY_NAMES.map(function (name) {
    return '{"name":"' + name + '","stars":1-5の整数またはnull(該当しない項目はnull)}';
  }).join(',');
}

module.exports = {
  CATEGORY_NAMES: CATEGORY_NAMES,
  buildCategorySchema: buildCategorySchema
};
