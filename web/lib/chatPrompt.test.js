'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChatPrompt } = require('./chatPrompt.js');

test('buildChatPrompt renders history as ユーザー/AI lines followed by the new message', () => {
  const prompt = buildChatPrompt(
    [{ role: 'user', text: '前の質問' }, { role: 'assistant', text: '前の答え' }],
    '新しい質問',
    null
  );
  assert.match(prompt, /ユーザー: 前の質問/);
  assert.match(prompt, /AI: 前の答え/);
  assert.match(prompt, /ユーザー: 新しい質問/);
});

test('buildChatPrompt works with empty history', () => {
  const prompt = buildChatPrompt([], 'はじめまして', null);
  assert.match(prompt, /ユーザー: はじめまして/);
});

test('buildChatPrompt includes game context when provided', () => {
  const prompt = buildChatPrompt([], '質問', {
    name: 'Hollow Knight',
    reviewSummaryText: '95% (1,000件)',
    categories: ['シングルプレイヤー', 'コントローラー対応']
  });
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /95% \(1,000件\)/);
  assert.match(prompt, /シングルプレイヤー, コントローラー対応/);
});

test('buildChatPrompt omits the context section entirely when gameContext is null', () => {
  const prompt = buildChatPrompt([], '質問', null);
  assert.doesNotMatch(prompt, /というSteamゲーム/);
});

test('buildChatPrompt omits missing reviewSummaryText/categories gracefully', () => {
  const prompt = buildChatPrompt([], '質問', { name: 'Y', reviewSummaryText: null, categories: [] });
  assert.match(prompt, /「Y」というSteamゲーム/);
  assert.doesNotMatch(prompt, /レビュー評価: null/);
  assert.doesNotMatch(prompt, /タグ: /);
});
