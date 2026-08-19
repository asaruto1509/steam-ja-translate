'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithTimeout, DEFAULT_TIMEOUT_MS } = require('./fetchWithTimeout.js');

test('DEFAULT_TIMEOUT_MS is a reasonable positive number', () => {
  assert.equal(typeof DEFAULT_TIMEOUT_MS, 'number');
  assert.ok(DEFAULT_TIMEOUT_MS > 0);
});

test('fetchWithTimeout resolves normally when the request finishes before the timeout', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    assert.equal(url, 'https://example.com/');
    assert.ok(opts.signal instanceof AbortSignal);
    return { ok: true };
  };
  try {
    const res = await fetchWithTimeout('https://example.com/', {}, 1000);
    assert.equal(res.ok, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchWithTimeout aborts and rejects once the timeout elapses', async () => {
  const originalFetch = global.fetch;
  global.fetch = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
  try {
    await assert.rejects(fetchWithTimeout('https://example.com/', {}, 20), (err) => err.name === 'AbortError');
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchWithTimeout preserves caller-provided options like method and headers', async () => {
  const originalFetch = global.fetch;
  let capturedOpts = null;
  global.fetch = async (url, opts) => { capturedOpts = opts; return { ok: true }; };
  try {
    await fetchWithTimeout('https://example.com/', { method: 'POST', headers: { 'X-Test': '1' } }, 1000);
    assert.equal(capturedOpts.method, 'POST');
    assert.equal(capturedOpts.headers['X-Test'], '1');
  } finally {
    global.fetch = originalFetch;
  }
});
