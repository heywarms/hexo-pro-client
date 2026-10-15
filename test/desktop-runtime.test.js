const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtimeCompatibility = require('../hexo-pro-desktop/src/main/runtime-compatibility');

test('desktop runtime compares the complete minimum Node.js version', () => {
  for (const version of ['16.20.2', '18.18.2', '20.18.99', '20.19.0-rc.1', '', '20', undefined]) {
    assert.equal(runtimeCompatibility.isSupportedNodeVersion(version), false, String(version));
  }
  for (const version of ['20.19.0', 'v20.19.0', '20.19.1', '20.20.0', '21.0.0', '22.0.0', '22.14.0']) {
    assert.equal(runtimeCompatibility.isSupportedNodeVersion(version), true, version);
  }
});

test('unsupported runtime guidance identifies the actual Electron and built-in Node.js versions', () => {
  assert.throws(() => runtimeCompatibility.assertSupportedNodeRuntime({ node: '18.18.2', electron: '28.3.3' }), error => {
    assert.equal(error.code, 'UNSUPPORTED_NODE_RUNTIME');
    assert.match(error.message, /20\.19\.0/);
    assert.match(error.message, /Electron 28\.3\.3（内置 Node\.js 18\.18\.2）/);
    assert.match(error.message, /请升级 Hexo Pro Desktop/);
    assert.match(error.message, /升级系统 Node\.js 无法更新它/);
    return true;
  });
  assert.throws(() => runtimeCompatibility.assertSupportedNodeRuntime({ node: '20.18.3' }), /请将 Node\.js 升级至 20\.19\.0/);
  assert.doesNotThrow(() => runtimeCompatibility.assertSupportedNodeRuntime({ node: '20.19.0' }));
  assert.doesNotThrow(() => runtimeCompatibility.assertSupportedNodeRuntime({ node: '22.14.0', electron: '35.0.0' }));
});

test('desktop source development requires Node.js 22.12.0 independently of the Hexo runtime minimum', () => {
  for (const version of ['20.19.0', '22.11.99']) {
    assert.throws(() => runtimeCompatibility.assertSupportedDevelopmentRuntime({ node: version }), error => {
      assert.equal(error.code, 'UNSUPPORTED_DEVELOPMENT_NODE_RUNTIME');
      assert.match(error.message, /源码开发和构建需要 Node\.js 22\.12\.0/);
      assert.ok(error.message.includes(`当前 Node.js ${version}`));
      return true;
    });
  }
  for (const version of ['22.12.0', '22.12.1', '22.14.0', '24.21.0']) {
    assert.doesNotThrow(() => runtimeCompatibility.assertSupportedDevelopmentRuntime({ node: version }));
  }
  assert.doesNotThrow(() => runtimeCompatibility.assertSupportedNodeRuntime({ node: '20.19.0' }));
});

test('desktop source launcher rejects an unsupported build Node.js before checking Yarn or installing dependencies', async () => {
  const filename = path.resolve(__dirname, '../hexo-pro-desktop/start.js');
  const module = { exports: {} };
  vm.runInNewContext(`${fs.readFileSync(filename, 'utf8')}\nmodule.exports = { checkEnvironment };`, {
    module, exports: module.exports, __dirname: path.dirname(filename),
    require: name => {
      if (name === './src/main/runtime-compatibility') return runtimeCompatibility;
      if (name === 'path') return path;
      if (name === 'child_process') return { spawn: () => assert.fail('must reject before invoking Yarn') };
      return {};
    },
    process: { version: 'v22.11.99', versions: { node: '22.11.99' }, on() {} },
    console: { log() {} }
  }, { filename });
  await assert.rejects(module.exports.checkEnvironment(), { code: 'UNSUPPORTED_DEVELOPMENT_NODE_RUNTIME' });
});

test('desktop rejects an old built-in Node.js before loading Hexo or changing the project environment', async () => {
  const filename = path.resolve(__dirname, '../hexo-pro-desktop/src/main/hexo-server.js');
  const module = { exports: {} };
  const required = [];
  const fakeProcess = {
    versions: { node: '18.18.2', electron: '28.3.3' },
    env: { NODE_PATH: '/original/modules' },
    cwd: () => '/original',
    chdir: () => assert.fail('must not change cwd on an unsupported runtime')
  };
  const isolatedRequire = name => {
    required.push(name);
    if (name === './runtime-compatibility') return runtimeCompatibility;
    if (name === 'path') return path;
    if (name === 'hexo') assert.fail('must reject before requiring Hexo');
    return {};
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: isolatedRequire, process: fakeProcess,
    console: { log() {}, warn() {}, error() {} }
  }, { filename });

  const server = new module.exports('/blog');
  await assert.rejects(server.initHexo(), { code: 'UNSUPPORTED_NODE_RUNTIME' });
  assert.equal(required.includes('hexo'), false);
  assert.equal(fakeProcess.env.NODE_PATH, '/original/modules');
  assert.equal(server.hexoInstance, null);
});
