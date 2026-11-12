'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { createMetrics } = require('./metrics');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates the Express application.
 * Returned app exposes `app.locals.setReady(bool)` so the server can flip the
 * readiness probe to "not ready" at the start of a graceful shutdown.
 */
function createApp({ config, logger }) {
  const app = express();
  const metrics = createMetrics({ version: config.version, commit: config.commit });
  const items = new Map();
  let nextId = 1;
  let ready = true;
  const startedAt = Date.now();

  app.disable('x-powered-by');
  app.locals.setReady = (value) => {
    ready = Boolean(value);
  };
  app.locals.metrics = metrics;

  // ---- Request ID + access log + RED metrics --------------------------------
  app.use((req, res, next) => {
    const requestId = req.get('x-request-id') || crypto.randomUUID();
    req.id = requestId;
    res.set('x-request-id', requestId);

    const start = process.hrtime.bigint();
    metrics.httpRequestsInFlight.inc();

    res.on('finish', () => {
      metrics.httpRequestsInFlight.dec();
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      // Use the route *pattern* (e.g. /api/items/:id), never the raw URL,
      // to keep metric label cardinality bounded.
      const route = req.route ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched';
      const labels = { method: req.method, route, status_code: String(res.statusCode) };
      metrics.httpRequestsTotal.inc(labels);
      metrics.httpRequestDuration.observe(labels, seconds);

      // Do not spam the log with probe and scrape traffic.
      if (route !== '/healthz' && route !== '/readyz' && route !== '/metrics') {
        logger.info('request', {
          request_id: requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          duration_ms: Math.round(seconds * 1000 * 100) / 100,
        });
      }
    });

    next();
  });

  app.use(express.json({ limit: '10kb' }));

  // ---- Operational endpoints -------------------------------------------------
  // Liveness: "is the process alive?" - must be cheap and dependency-free.
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: "should traffic be sent to me?" - flips to 503 while draining.
  app.get('/readyz', (req, res) => {
    if (!ready) return res.status(503).json({ status: 'shutting_down' });
    return res.json({ status: 'ready' });
  });

  app.get('/metrics', async (req, res, next) => {
    try {
      metrics.itemsGauge.set(items.size);
      res.set('Content-Type', metrics.register.contentType);
      res.send(await metrics.register.metrics());
    } catch (err) {
      next(err);
    }
  });

  app.get('/version', (req, res) => {
    res.json({
      version: config.version,
      commit: config.commit,
      env: config.env,
      uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  app.get('/', (req, res) => {
    res.json({
      service: 'sre-reliability-platform',
      version: config.version,
      endpoints: ['/healthz', '/readyz', '/metrics', '/version', '/api/items'],
    });
  });

  // ---- Business API (in-memory CRUD) -----------------------------------------
  app.get('/api/items', (req, res) => {
    res.json({ count: items.size, items: Array.from(items.values()) });
  });

  app.post('/api/items', (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 100) {
      return res.status(400).json({ error: 'name must be a string of 1-100 characters' });
    }
    if (items.size >= config.maxItems) {
      return res.status(429).json({ error: 'item limit reached' });
    }
    const item = { id: nextId++, name, createdAt: new Date().toISOString() };
    items.set(item.id, item);
    return res.status(201).json(item);
  });

  app.get('/api/items/:id', (req, res) => {
    const item = items.get(Number.parseInt(req.params.id, 10));
    if (!item) return res.status(404).json({ error: 'item not found' });
    return res.json(item);
  });

  app.delete('/api/items/:id', (req, res) => {
    const removed = items.delete(Number.parseInt(req.params.id, 10));
    if (!removed) return res.status(404).json({ error: 'item not found' });
    return res.status(204).end();
  });

  // ---- Chaos endpoints (disabled by default) ---------------------------------
  // Used to demo alerting, SLO burn rate and incident response in a safe way.
  if (config.chaosEnabled) {
    app.get('/api/chaos/error', (req, res) => {
      res.status(500).json({ error: 'injected failure' });
    });

    app.get('/api/chaos/latency', async (req, res) => {
      const requested = Number.parseInt(req.query.ms, 10);
      const ms = Number.isNaN(requested) ? 1000 : Math.min(Math.max(requested, 0), 5000);
      await sleep(ms);
      res.json({ delayed_ms: ms });
    });
  }

  // ---- 404 and error handling -------------------------------------------------
  app.use((req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid JSON body' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload too large' });
    }
    logger.error('unhandled_error', {
      request_id: req.id,
      error: err && err.message,
      stack: err && err.stack,
    });
    return res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
