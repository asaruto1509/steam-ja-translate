'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChallengePrompt, formatChallengeReply } = require('./challenge.js');

test('buildChallengePrompt includes the game name and rare achievement names', () => {
  const achievements = [{ name: 'STEEL_SOUL', percent: 0.3 }, { name: 'GODMASTER', percent: 1.2 }];
  const prompt = buildChallengePrompt('Hollow Knight', achievements);
  assert.match(prompt, /Hollow Knight/);
  assert.match(prompt, /STEEL_SOUL/);
  assert.match(prompt, /GODMASTER/);
});

test('formatChallengeReply lists the rare achievements and the AI challenge text', () => {
  const achievements = [{ name: 'STEEL_SOUL', percent: 0.3 }];
  const reply = formatChallengeReply('Hollow Knight', achievements, 'ダメージを一切受けずにクリアせよ！', '1');
  assert.equal(reply.embeds[0].title, 'Hollow Knight チャレンジ');
  assert.match(reply.embeds[0].description, /ダメージを一切受けずに/);
  assert.match(reply.embeds[0].fields[0].value, /STEEL_SOUL/);
  assert.match(reply.embeds[0].fields[0].value, /0\.3%/);
});

test('formatChallengeReply returns a not-found message when there are no achievements', () => {
  const reply = formatChallengeReply('Some Game', [], null, null);
  assert.match(reply.content, /見つからなかった/);
});
