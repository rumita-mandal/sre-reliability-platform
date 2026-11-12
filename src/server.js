'use strict';

const { loadConfig } = require('./config');
const { createLogger } = require('./logger');
const { createApp } = require('./app');

const config = loadConfig();
const logger = createLogger(config.logLevel, { service: 'sre-reliability-platform' });
const app = createApp({ config, logger });

const server = app.listen(config.port, config.host, () => {
  logger.info('server_started', {
    host: config.host,
    port: server.address().port,
    version: config.version,
    env: config.env,
  });
});

// Keep-alive must exceed the load balancer idle timeout (AWS ALB default: 60s)
// to avoid sporadic 502s caused by connection reuse races.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutdown_started', { signal, drain_ms: config.shutdownDelayMs });

  // 1. Fail readiness so the load balancer stops sending new traffic.
  app.locals.setReady(false);

  // 2. Keep serving for a short drain window, then stop accepting connections.
  setTimeout(() => {
    server.close((err) => {
      if (err) {
        logger.error('shutdown_error', { error: err.message });
        process.exit(1);
      }
      logger.info('shutdown_complete');
      process.exit(0);
    });
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
  }, config.shutdownDelayMs).unref();

  // 3. Hard deadline so a stuck connection can never block a rollout.
  setTimeout(() => {
    logger.error('shutdown_forced');
    process.exit(1);
  }, config.shutdownTimeoutMs).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('uncaught_exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
