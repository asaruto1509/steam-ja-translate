'use strict';
const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const { parseHistoryEntries } = require('./priceHistoryApi.js');

const REAL_SAMPLE_RESPONSE = [
  { timestamp: '2026-07-09T19:28:10+02:00', shop: { id: 61, name: 'Steam' }, deal: { price: { amount: 1700, amountInt: 1700, currency: 'JPY' }, regular: { amount: 1700, amountInt: 1700, currency: 'JPY' }, cut: 0 } },
  { timestamp: '2026-06-25T19:39:18+02:00', shop: { id: 61, name: 'Steam' }, deal: { price: { amount: 850, amountInt: 850, currency: 'JPY' }, regular: { amount: 1700, amountInt: 1700, currency: 'JPY' }, cut: 50 } },
  { timestamp: '2026-05-20T17:29:34+02:00', shop: { id: 61, name: 'Steam' }, deal: { price: { amount: 1700, amountInt: 1700, currency: 'JPY' }, regular: { amount: 1700, amountInt: 1700, currency: 'JPY' }, cut: 0 } }
];

test('parseHistoryEntries maps the real ITAD response shape to {date, price}', () => {
  const result = parseHistoryEntries(REAL_SAMPLE_RESPONSE);
  assert.deepEqual(result, [
    { date: '2026-07-09T19:28:10+02:00', price: 1700 },
    { date: '2026-06-25T19:39:18+02:00', price: 850 },
    { date: '2026-05-20T17:29:34+02:00', price: 1700 }
  ]);
});

test('parseHistoryEntries filters out entries from shops other than Steam (id 61)', () => {
  const mixed = REAL_SAMPLE_RESPONSE.concat([
    { timestamp: '2026-07-10T00:00:00+02:00', shop: { id: 35, name: 'GOG' }, deal: { price: { amount: 1600, amountInt: 1600, currency: 'JPY' }, regular: { amount: 1700, amountInt: 1700, currency: 'JPY' }, cut: 6 } }
  ]);
  const result = parseHistoryEntries(mixed);
  assert.equal(result.length, 3);
  assert.ok(result.every((r) => r.price !== 1600));
});

test('parseHistoryEntries skips malformed entries missing a price', () => {
  const warnMock = mock.method(console, 'warn', () => {});
  try {
    const malformed = [{ timestamp: '2026-07-09T19:28:10+02:00', shop: { id: 61, name: 'Steam' }, deal: {} }];
    assert.deepEqual(parseHistoryEntries(malformed), []);
  } finally {
    warnMock.mock.restore();
  }
});

test('parseHistoryEntries returns an empty array for non-array input', () => {
  assert.deepEqual(parseHistoryEntries(null), []);
  assert.deepEqual(parseHistoryEntries(undefined), []);
  assert.deepEqual(parseHistoryEntries('not an array'), []);
});

test('parseHistoryEntries warns when non-empty input yields no matching entries', () => {
  const warnMock = mock.method(console, 'warn', () => {});
  try {
    const malformed = [{ timestamp: '2026-07-09T19:28:10+02:00', shop: { id: 61, name: 'Steam' }, deal: {} }];
    assert.deepEqual(parseHistoryEntries(malformed), []);
    assert.equal(warnMock.mock.callCount(), 1);
  } finally {
    warnMock.mock.restore();
  }
});

test('parseHistoryEntries does not warn for legitimately empty input', () => {
  const warnMock = mock.method(console, 'warn', () => {});
  try {
    parseHistoryEntries([]);
    parseHistoryEntries(null);
    parseHistoryEntries(undefined);
    assert.equal(warnMock.mock.callCount(), 0);
  } finally {
    warnMock.mock.restore();
  }
});
