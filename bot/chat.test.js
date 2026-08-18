'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendHistory, buildChatPrompt, extractGameMentions, buildMentionEmbed, needsTranslation, buildTranslatePrompt } = require('./chat.js');

test('appendHistory adds an entry and keeps existing channels untouched', () => {
  const history = { 'other-channel': [{ author: 'X', text: 'hi' }] };
  const result = appendHistory(history, 'chan-1', { author: 'A', text: 'hello' }, 6);
  assert.deepEqual(result['chan-1'], [{ author: 'A', text: 'hello' }]);
  assert.deepEqual(result['other-channel'], [{ author: 'X', text: 'hi' }]);
});

test('appendHistory does not mutate the input object', () => {
  const history = { 'chan-1': [{ author: 'A', text: 'first' }] };
  appendHistory(history, 'chan-1', { author: 'B', text: 'second' }, 6);
  assert.deepEqual(history['chan-1'], [{ author: 'A', text: 'first' }]);
});

test('appendHistory caps the list at maxLen, dropping the oldest entries', () => {
  let history = {};
  for (let i = 0; i < 5; i++) {
    history = appendHistory(history, 'chan-1', { author: 'A', text: 'msg' + i }, 3);
  }
  assert.deepEqual(history['chan-1'].map((e) => e.text), ['msg2', 'msg3', 'msg4']);
});

test('buildChatPrompt includes prior history lines and the new message', () => {
  const historyEntries = [{ author: 'ユーザー', text: '猫好き？' }, { author: 'Bot', text: '好きだよ' }];
  const prompt = buildChatPrompt(historyEntries, '犬は？');
  assert.match(prompt, /猫好き？/);
  assert.match(prompt, /好きだよ/);
  assert.match(prompt, /犬は？/);
});

test('buildChatPrompt works with empty history', () => {
  const prompt = buildChatPrompt([], 'こんにちは');
  assert.match(prompt, /こんにちは/);
});

test('extractGameMentions pulls unique bracketed titles from text', () => {
  const mentions = extractGameMentions('似てるゲームだと「Hollow Knight」とか「Celeste」がおすすめ。「Hollow Knight」は特に。');
  assert.deepEqual(mentions, ['Hollow Knight', 'Celeste']);
});

test('extractGameMentions also matches 『』作品名括弧(AIがこちらを使うことがある)', () => {
  const mentions = extractGameMentions('『Fallout 3』や『Metro Redux』が似た雰囲気です。');
  assert.deepEqual(mentions, ['Fallout 3', 'Metro Redux']);
});

test('extractGameMentions returns an empty array when there are no brackets', () => {
  assert.deepEqual(extractGameMentions('普通の返答だよ'), []);
});

test('extractGameMentions caps the number of mentions returned', () => {
  const text = '「A」「B」「C」「D」';
  assert.equal(extractGameMentions(text, 2).length, 2);
});

test('buildMentionEmbed builds a JPY-priced embed with image and store link (no bare URL in text, so Discord will not auto-unfurl an English/USD preview)', () => {
  const game = { id: '367520', name: 'Hollow Knight' };
  const detail = { finalPrice: 1000, originalPrice: 1000, discountPercent: 0 };
  const embed = buildMentionEmbed(game, detail);
  assert.equal(embed.title, 'Hollow Knight');
  assert.equal(embed.url, 'https://store.steampowered.com/app/367520/');
  assert.equal(embed.image.url, 'https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg');
  assert.match(embed.fields[0].value, /¥1,000/);
});

test('buildMentionEmbed includes the store short description when available', () => {
  const detail = { finalPrice: 1000, originalPrice: 1000, discountPercent: 0, shortDescription: '洞窟の奥深くを探索するメトロイドヴァニア。' };
  const embed = buildMentionEmbed({ id: '367520', name: 'Hollow Knight' }, detail);
  assert.match(embed.description, /メトロイドヴァニア/);
});

test('buildMentionEmbed omits the description field when no short description is available', () => {
  const embed = buildMentionEmbed({ id: '1', name: 'Some Game' }, { finalPrice: 0, originalPrice: 0, discountPercent: 0 });
  assert.equal(embed.description, undefined);
});

test('needsTranslation is true for text with no Japanese characters', () => {
  assert.equal(needsTranslation('Money Talks. Silence Pays.'), true);
});

test('needsTranslation is false for text that already contains Japanese', () => {
  assert.equal(needsTranslation('洞窟を探索するアクション'), false);
});

test('needsTranslation is false for empty or missing text', () => {
  assert.equal(needsTranslation(''), false);
  assert.equal(needsTranslation(null), false);
});

test('buildTranslatePrompt includes the source text', () => {
  const prompt = buildTranslatePrompt('Money Talks. Silence Pays.');
  assert.match(prompt, /Money Talks/);
});

test('buildMentionEmbed shows a fallback price line when the price detail is unavailable', () => {
  const embed = buildMentionEmbed({ id: '1', name: 'Some Game' }, null);
  assert.match(embed.fields[0].value, /価格情報なし/);
});
