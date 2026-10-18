import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise main's unchanged auth-storage implementation, without a browser,
// real credentials, network access or any production client initialization.
const source = ts.transpileModule(readFileSync(new URL('./previewAuthStorage.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const projectId = '12345678-1234-4123-8123-123456789abc';

function fixture({ hostname = 'localhost', framed = false, ancestor = 'https://lovable.dev', reply } = {}) {
  const values = new Map(), messages = [], listeners = new Set();
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const window = {
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
  };
  const deliver = (message, origin, value) => {
    for (const listener of listeners) listener({ origin, data: {
      type: 'lovable-preview-auth:result', requestId: message.requestId, ok: true, value,
    } });
  };
  window.parent = framed ? {
    postMessage(message, origin) {
      messages.push({ message, origin });
      queueMicrotask(() => reply?.(message, origin, deliver));
    },
  } : window;
  const sandbox = { exports: {}, window, location: { hostname, ancestorOrigins: [ancestor] },
    document: { referrer: '' }, localStorage, setTimeout, clearTimeout, URL };
  vm.runInNewContext(source, sandbox);
  return { storage: sandbox.exports.brokeredPreviewStorage(), localStorage, values, messages, listeners };
}

test('server rendering does not require window or localStorage', () => {
  const sandbox = { exports: {} };
  vm.runInNewContext(source, sandbox);
  assert.equal(sandbox.exports.brokeredPreviewStorage(), undefined);
});

test('localhost, production hosts and non-embedded previews retain local session storage', () => {
  for (const config of [{ hostname: 'localhost', framed: true }, { hostname: 'www.o2iinstitute.org', framed: true },
    { hostname: `${projectId}.lovableproject.com` }, { hostname: 'preview--user-name.lovableproject.com', framed: true }]) {
    const f = fixture(config);
    assert.equal(f.storage, f.localStorage);
    f.storage.setItem('synthetic-session', 'synthetic-value');
    assert.equal(f.storage.getItem('synthetic-session'), 'synthetic-value');
    f.storage.removeItem('synthetic-session');
    assert.equal(f.storage.getItem('synthetic-session'), null);
    assert.equal(f.messages.length, 0);
  }
});

test('trusted embedded preview brokers, seeds and clears sessions without losing logout', async () => {
  let result = 'synthetic-session';
  const f = fixture({ hostname: `${projectId}.lovableproject.com`, framed: true,
    reply: (message, origin, deliver) => deliver(message, origin, result) });
  assert.equal(await f.storage.getItem('key'), result);
  assert.equal(f.localStorage.getItem('key'), result);
  result = 'synthetic-updated';
  await f.storage.setItem('key', result);
  assert.equal(f.localStorage.getItem('key'), result);
  result = '';
  assert.equal(await f.storage.getItem('key'), null);
  assert.equal(f.localStorage.getItem('key'), null);
  await f.storage.removeItem('key');
  assert.equal(f.messages.at(-1).message.type, 'lovable-preview-auth:remove');
  assert.ok(f.messages.every(({ origin, message }) => origin === 'https://lovable.dev' && message.projectId === projectId));
  assert.equal(f.listeners.size, 0);
});

test('untrusted embedders and replies cannot receive or replace a preview session', async () => {
  const f = fixture({ hostname: `${projectId}.lovableproject.com`, framed: true, ancestor: 'https://untrusted.example.test',
    reply(message, origin, deliver) {
      deliver(message, 'https://untrusted.example.test', 'synthetic-spoof');
      deliver(message, origin, 'synthetic-trusted');
    } });
  assert.equal(await f.storage.getItem('key'), 'synthetic-trusted');
  assert.deepEqual(f.messages.map(({ origin }) => origin), ['https://lovable.dev']);
  assert.equal(f.localStorage.getItem('key'), 'synthetic-trusted');
});
