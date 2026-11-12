'use strict';

function toInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

/**
 * Twelve-factor style configuration: everything comes from environment variables.
 * Invalid values fall back to safe defaults instead of crashing the process.
 */
function loadConfig(env = process.env) {
  return {
    env: env.NODE_ENV || 'development',
    host: env.HOST || '0.0.0.0',
    port: toInt(env.PORT, 3000, { min: 0, max: 65535 }),
    logLevel: env.LOG_LEVEL || 'info',
    version: env.APP_VERSION || 'dev',
    commit: env.GIT_COMMIT || 'unknown',
    chaosEnabled: toBool(env.CHAOS_ENABLED, false),
    maxItems: toInt(env.MAX_ITEMS, 1000, { min: 1, max: 100000 }),
    // How long to keep serving after SIGTERM so load balancers can drain us.
    shutdownDelayMs: toInt(env.SHUTDOWN_DELAY_MS, 5000, { min: 0, max: 60000 }),
    // Hard deadline for graceful shutdown.
    shutdownTimeoutMs: toInt(env.SHUTDOWN_TIMEOUT_MS, 15000, { min: 1000, max: 120000 }),
  };
}

module.exports = { loadConfig, toInt, toBool };
