'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, toInt, toBool } = require('../src/config');

test('loadConfig applies defaults', () => {
  const config = loadConfig({});
  assert.equal(config.port, 3000);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.chaosEnabled, false);
  assert.equal(config.logLevel, 'info');
});

test('loadConfig reads environment overrides', () => {
  const config = loadConfig({ PORT: '8080', CHAOS_ENABLED: 'true', LOG_LEVEL: 'debug', APP_VERSION: '9.9.9' });
  assert.equal(config.port, 8080);
  assert.equal(config.chaosEnabled, true);
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.version, '9.9.9');
});

test('invalid numbers fall back to defaults', () => {
  assert.equal(loadConfig({ PORT: 'abc' }).port, 3000);
  assert.equal(toInt('abc', 5), 5);
});

test('toInt clamps to bounds', () => {
  assert.equal(toInt('999999', 1, { min: 0, max: 100 }), 100);
  assert.equal(toInt('-5', 1, { min: 0, max: 100 }), 0);
});

test('toBool parses common truthy values', () => {
  assert.equal(toBool('1'), true);
  assert.equal(toBool('YES'), true);
  assert.equal(toBool('false'), false);
  assert.equal(toBool(undefined, true), true);
});
