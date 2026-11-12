'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * Minimal structured (JSON) logger. One JSON object per line on stdout/stderr,
 * which is what log shippers (Loki, Fluent Bit, CloudWatch, Datadog) expect.
 */
function createLogger(level = 'info', base = {}) {
  const threshold = LEVELS[level] !== undefined ? LEVELS[level] : LEVELS.info;

  function write(name, message, fields) {
    if (LEVELS[name] < threshold) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level: name,
      msg: message,
      ...base,
      ...fields,
    });
    const stream = name === 'error' ? process.stderr : process.stdout;
    stream.write(line + '\n');
  }

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    child: (extra) => createLogger(level, { ...base, ...extra }),
  };
}

module.exports = { createLogger, LEVELS };
