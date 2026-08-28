'use strict';
const test = require('node:test');
const vm = require('node:vm');
const { renderIncrementalPage } = require('./incrementalPage.js');

function makeEl() {
  const el = {
    classList: { add() {}, remove() {} },
    style: {},
    children: [],
    addEventListener() {},
    appendChild(child) { el.children.push(child); },
    remove() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    click() {},
    clientWidth: 300,
    clientHeight: 160,
  };
  Object.defineProperty(el, 'textContent', { get() { return ''; }, set() {} });
  Object.defineProperty(el, 'offsetWidth', { get() { return 0; } });
  return el;
}

function extractClientScript(html) {
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('renderIncrementalPage output has no <script> block');
  return m[1];
}

function runClientScriptInSandbox(script) {
  const storage = {};
  const localStorageStub = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  };
  const pageEl = makeEl();
  pageEl.querySelector = () => makeEl();
  const documentStub = {
    querySelector: (sel) => (sel === '.incremental-page' ? pageEl : makeEl()),
    createElement: () => makeEl(),
  };
  const sandbox = {
    document: documentStub,
    localStorage: localStorageStub,
    window: { AudioContext: undefined, webkitAudioContext: undefined, confirm: () => true },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    Date,
    Math,
    console,
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    isFinite,
    Number,
    String,
    Array,
    Object,
    Boolean,
    JSON,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'incremental-client-script.js' });
}

test('the generated incremental client script runs to completion without throwing', () => {
  const html = renderIncrementalPage({});
  const script = extractClientScript(html);
  runClientScriptInSandbox(script);
});

module.exports = { makeEl, extractClientScript, runClientScriptInSandbox };
