const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

const {
  DEFAULT_CANDIDATE_PORTS,
  findRuntimeFiles,
  resolveBaseUrl,
  writeRuntimeFile
} = require('../agent/base-url-resolver');

test('resolveBaseUrl uses explicit config before runtime files', async () => {
  const result = await resolveBaseUrl({
    baseUrl: 'http://127.0.0.1:9999',
    env: {
      HEXO_PRO_BASE_URL: 'http://127.0.0.1:8888'
    }
  });

  assert.strictEqual(result.baseUrl, 'http://127.0.0.1:9999');
  assert.strictEqual(result.source, 'options.baseUrl');
});

test('resolveBaseUrl reads blog runtime file from HEXOPRO_BASE_DIR', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexo-pro-runtime-'));
  writeRuntimeFile({
    baseDir: tempDir,
    baseUrl: 'http://127.0.0.1:8081',
    serverUrl: 'http://127.0.0.1:8001'
  });

  const result = await resolveBaseUrl({
    env: {
      HEXOPRO_BASE_DIR: tempDir
    }
  });

  assert.strictEqual(result.baseUrl, 'http://127.0.0.1:8081');
  assert.strictEqual(result.source, 'runtime');
});

test('findRuntimeFiles supports explicit runtime file and blog base dir', () => {
  const files = findRuntimeFiles({
    env: {
      HEXO_PRO_RUNTIME_FILE: '/tmp/custom-runtime.json',
      HEXOPRO_BASE_DIR: '/tmp/blog'
    }
  });

  assert.strictEqual(files[0], '/tmp/custom-runtime.json');
  assert.ok(files.includes('/tmp/blog/.hexo-pro/runtime.json'));
});

test('resolveBaseUrl probes candidate ports when runtime is unavailable', async () => {
  const probedUrls = [];
  const result = await resolveBaseUrl({
    env: {},
    runtimeFiles: [],
    candidatePorts: [5555, 6666],
    fetchImpl: async (url) => {
      probedUrls.push(url);
      return {
        ok: url.startsWith('http://127.0.0.1:6666/'),
        text: async () => '{"authEnabled":true}',
        headers: { get: () => 'application/json' }
      };
    }
  });

  assert.strictEqual(result.baseUrl, 'http://127.0.0.1:6666');
  assert.strictEqual(result.source, 'probe');
  assert.deepStrictEqual(probedUrls, [
    'http://127.0.0.1:5555/hexopro/api/auth/status',
    'http://127.0.0.1:6666/hexopro/api/auth/status'
  ]);
});

test('default candidate ports try debug BrowserSync before common Hexo ports', () => {
  assert.deepStrictEqual(DEFAULT_CANDIDATE_PORTS.slice(0, 3), [8081, 8001, 4000]);
});
