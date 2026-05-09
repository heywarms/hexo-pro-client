const assert = require('assert');
const { test } = require('node:test');

const {
  ensureHexoProRuntime,
  isTruthyEnv
} = require('../agent/runtime-manager');

test('isTruthyEnv recognizes opt-in values only', () => {
  assert.strictEqual(isTruthyEnv('true'), true);
  assert.strictEqual(isTruthyEnv('1'), true);
  assert.strictEqual(isTruthyEnv('yes'), true);
  assert.strictEqual(isTruthyEnv('false'), false);
  assert.strictEqual(isTruthyEnv(undefined), false);
});

test('ensureHexoProRuntime returns existing healthy runtime without spawning', async () => {
  let spawnCalled = false;
  const result = await ensureHexoProRuntime({
    env: {},
    resolveBaseUrlImpl: async () => ({ baseUrl: 'http://127.0.0.1:8787', source: 'probe' }),
    healthCheckImpl: async () => true,
    spawnImpl: () => {
      spawnCalled = true;
    }
  });

  assert.strictEqual(result.baseUrl, 'http://127.0.0.1:8787');
  assert.strictEqual(result.started, false);
  assert.strictEqual(spawnCalled, false);
});

test('ensureHexoProRuntime throws a helpful error when runtime is down and auto start is disabled', async () => {
  await assert.rejects(
    () => ensureHexoProRuntime({
      env: {},
      resolveBaseUrlImpl: async () => ({ baseUrl: 'http://127.0.0.1:8787', source: 'default' }),
      healthCheckImpl: async () => false
    }),
    /Hexo Pro is not running/
  );
});

test('ensureHexoProRuntime starts headless server when auto start is enabled', async () => {
  const spawned = [];
  let healthAttempts = 0;
  const result = await ensureHexoProRuntime({
    env: {
      HEXO_PRO_AUTO_START: 'true',
      HEXOPRO_BASE_DIR: '/tmp/blog',
      HEXO_PRO_HEADLESS_PORT: '8787'
    },
    resolveBaseUrlImpl: async () => ({ baseUrl: 'http://127.0.0.1:8787', source: 'default' }),
    healthCheckImpl: async () => {
      healthAttempts += 1;
      return healthAttempts > 1;
    },
    spawnImpl: (command, args, options) => {
      spawned.push({ command, args, options });
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: () => {},
        kill: () => {}
      };
    },
    waitMs: async () => {},
    maxAttempts: 3
  });

  assert.strictEqual(result.baseUrl, 'http://127.0.0.1:8787');
  assert.strictEqual(result.started, true);
  assert.strictEqual(spawned.length, 1);
  assert.ok(spawned[0].args[0].endsWith('hexo-pro/headless_server.js'));
  assert.strictEqual(spawned[0].options.env.HEXOPRO_BASE_DIR, '/tmp/blog');
});
