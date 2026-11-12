'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { createLogger } = require('../src/logger');

async function startServer(overrides = {}) {
  const config = { ...loadConfig({}), port: 0, logLevel: 'silent', ...overrides };
  const app = createApp({ config, logger: createLogger('silent') });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return { app, base, close };
}

test('GET /healthz returns ok', async () => {
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
    assert.ok(res.headers.get('x-request-id'));
  } finally {
    await close();
  }
});

test('GET /readyz flips to 503 when shutting down', async () => {
  const { app, base, close } = await startServer();
  try {
    assert.equal((await fetch(`${base}/readyz`)).status, 200);
    app.locals.setReady(false);
    const res = await fetch(`${base}/readyz`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: 'shutting_down' });
  } finally {
    await close();
  }
});

test('request id header is propagated', async () => {
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/healthz`, { headers: { 'x-request-id': 'abc-123' } });
    assert.equal(res.headers.get('x-request-id'), 'abc-123');
  } finally {
    await close();
  }
});

test('items CRUD lifecycle', async () => {
  const { base, close } = await startServer();
  try {
    const created = await fetch(`${base}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'first' }),
    });
    assert.equal(created.status, 201);
    const item = await created.json();
    assert.equal(item.name, 'first');
    assert.equal(item.id, 1);

    const list = await (await fetch(`${base}/api/items`)).json();
    assert.equal(list.count, 1);

    const single = await fetch(`${base}/api/items/${item.id}`);
    assert.equal(single.status, 200);

    const del = await fetch(`${base}/api/items/${item.id}`, { method: 'DELETE' });
    assert.equal(del.status, 204);

    const gone = await fetch(`${base}/api/items/${item.id}`);
    assert.equal(gone.status, 404);
  } finally {
    await close();
  }
});

test('POST /api/items validates input', async () => {
  const { base, close } = await startServer();
  try {
    const empty = await fetch(`${base}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    assert.equal(empty.status, 400);

    const malformed = await fetch(`${base}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(malformed.status, 400);
  } finally {
    await close();
  }
});

test('item limit returns 429', async () => {
  const { base, close } = await startServer({ maxItems: 1 });
  try {
    const post = () =>
      fetch(`${base}/api/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      });
    assert.equal((await post()).status, 201);
    assert.equal((await post()).status, 429);
  } finally {
    await close();
  }
});

test('unknown route returns JSON 404', async () => {
  const { base, close } = await startServer();
  try {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not found' });
  } finally {
    await close();
  }
});

test('GET /metrics exposes RED metrics with bounded labels', async () => {
  const { base, close } = await startServer();
  try {
    await fetch(`${base}/api/items/12345`); // 404 on a parameterised route
    await fetch(`${base}/totally/unknown/path`);
    const res = await fetch(`${base}/metrics`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/plain/);
    const text = await res.text();
    assert.match(text, /http_requests_total\{[^}]*route="\/api\/items\/:id"[^}]*status_code="404"/);
    assert.match(text, /route="unmatched"/);
    assert.doesNotMatch(text, /route="\/api\/items\/12345"/);
    assert.match(text, /http_request_duration_seconds_bucket/);
    assert.match(text, /app_build_info/);
    assert.match(text, /process_cpu_user_seconds_total/);
  } finally {
    await close();
  }
});

test('chaos endpoints are disabled by default', async () => {
  const { base, close } = await startServer();
  try {
    assert.equal((await fetch(`${base}/api/chaos/error`)).status, 404);
  } finally {
    await close();
  }
});

test('chaos endpoints work when enabled', async () => {
  const { base, close } = await startServer({ chaosEnabled: true });
  try {
    assert.equal((await fetch(`${base}/api/chaos/error`)).status, 500);
    const res = await fetch(`${base}/api/chaos/latency?ms=10`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { delayed_ms: 10 });
  } finally {
    await close();
  }
});

test('GET /version reports build info', async () => {
  const { base, close } = await startServer({ version: '1.2.3', commit: 'abc1234' });
  try {
    const body = await (await fetch(`${base}/version`)).json();
    assert.equal(body.version, '1.2.3');
    assert.equal(body.commit, 'abc1234');
  } finally {
    await close();
  }
});
