'use strict';

const client = require('prom-client');

/**
 * Builds an isolated metrics registry per app instance so tests can create
 * many apps without "metric already registered" errors.
 *
 * The three core signals follow the RED method (Rate, Errors, Duration).
 */
function createMetrics({ version, commit }) {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  });

  const httpRequestsInFlight = new client.Gauge({
    name: 'http_requests_in_flight',
    help: 'Number of HTTP requests currently being processed',
    registers: [register],
  });

  const itemsGauge = new client.Gauge({
    name: 'app_items_total',
    help: 'Number of items currently stored',
    registers: [register],
  });

  const buildInfo = new client.Gauge({
    name: 'app_build_info',
    help: 'Build information (value is always 1)',
    labelNames: ['version', 'commit'],
    registers: [register],
  });
  buildInfo.set({ version, commit }, 1);

  return { register, httpRequestsTotal, httpRequestDuration, httpRequestsInFlight, itemsGauge };
}

module.exports = { createMetrics };
