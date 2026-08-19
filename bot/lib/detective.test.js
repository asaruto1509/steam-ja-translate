'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDetectivePrompt,
  parseDetectiveAnswer,
  isDirectGuess,
  buildRevealEmbed,
  handleDetectiveMessage
} = require('./detective.js');

test('buildDetectivePrompt includes the secret game name, context, and the question', () => {
  const prompt = buildDetectivePrompt('Hollow Knight', { genres: ['アクション'], categories: ['探索'] }, '主人公は人間ですか？');
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /アクション/);
  assert.match(prompt, /主人公は人間ですか？/);
});

test('parseDetectiveAnswer strips <think> blocks and trims to the first line', () => {
  const raw = '<think>正解はHollow Knightだから…</think>いいえ\n余計な補足文';
  assert.equal(parseDetectiveAnswer(raw), 'いいえ');
});

test('parseDetectiveAnswer truncates overly long answers', () => {
  const raw = 'あ'.repeat(300);
  assert.equal(parseDetectiveAnswer(raw).length <= 200, true);
});

test('isDirectGuess matches when normalized text equals the game name', () => {
  assert.equal(isDirectGuess(' hollow   knight ', 'Hollow Knight'), true);
});

test('isDirectGuess matches when the game name appears inside a longer guess', () => {
  assert.equal(isDirectGuess('それってHollow Knightじゃない?', 'Hollow Knight'), true);
});

test('isDirectGuess does not false-positive when a short game name is embedded in an unrelated English word', () => {
  assert.equal(isDirectGuess('このゲームはrustlike系ですか？', 'Rust'), false);
});

test('isDirectGuess still matches a short game name asked about directly', () => {
  assert.equal(isDirectGuess('それってRustですか？', 'Rust'), true);
});

test('isDirectGuess returns false for unrelated text', () => {
  assert.equal(isDirectGuess('主人公は人間ですか？', 'Hollow Knight'), false);
});

test('buildRevealEmbed includes the game title, store link, and header image', () => {
  const embed = buildRevealEmbed('Hollow Knight', '367520');
  assert.match(embed.title, /Hollow Knight/);
  assert.equal(embed.url, 'https://store.steampowered.com/app/367520/');
  assert.equal(embed.image.url, 'https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg');
});

test('handleDetectiveMessage reveals and clears state on a direct guess without calling the AI', async () => {
  const detectiveThreads = new Map();
  detectiveThreads.set('thread-1', { name: 'Hollow Knight', id: '367520', genres: [], categories: [], questionCount: 0, maxQuestions: 20 });
  let sent = null;
  const message = { channelId: 'thread-1', content: 'Hollow Knight', channel: { send: async (m) => { sent = m; }, sendTyping: async () => {} } };
  const deps = { fetchChatReply: async () => { throw new Error('should not be called'); } };
  await handleDetectiveMessage(message, detectiveThreads, 'api-key', deps);
  assert.match(sent.embeds[0].title, /Hollow Knight/);
  assert.equal(detectiveThreads.has('thread-1'), false);
});

test('handleDetectiveMessage answers a yes/no question via AI and increments the question count', async () => {
  const detectiveThreads = new Map();
  detectiveThreads.set('thread-1', { name: 'Hollow Knight', id: '367520', genres: ['アクション'], categories: [], questionCount: 0, maxQuestions: 20 });
  let sent = null;
  const message = { channelId: 'thread-1', content: '主人公は人間ですか？', channel: { send: async (m) => { sent = m; }, sendTyping: async () => {} } };
  const deps = { fetchChatReply: async () => 'いいえ' };
  await handleDetectiveMessage(message, detectiveThreads, 'api-key', deps);
  assert.equal(sent, 'いいえ');
  assert.equal(detectiveThreads.get('thread-1').questionCount, 1);
});

test('handleDetectiveMessage reveals the answer once the question limit is reached', async () => {
  const detectiveThreads = new Map();
  detectiveThreads.set('thread-1', { name: 'Hollow Knight', id: '367520', genres: [], categories: [], questionCount: 19, maxQuestions: 20 });
  const sentMessages = [];
  const message = { channelId: 'thread-1', content: '空を飛べますか？', channel: { send: async (m) => { sentMessages.push(m); }, sendTyping: async () => {} } };
  const deps = { fetchChatReply: async () => 'いいえ' };
  await handleDetectiveMessage(message, detectiveThreads, 'api-key', deps);
  assert.equal(sentMessages[0], 'いいえ');
  assert.match(sentMessages[1].embeds[0].title, /Hollow Knight/);
  assert.equal(detectiveThreads.has('thread-1'), false);
});
