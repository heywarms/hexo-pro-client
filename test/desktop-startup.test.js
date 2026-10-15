const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { promisify } = require('node:util');

const desktopDir = path.resolve(__dirname, '../hexo-pro-desktop');
const mainDir = path.join(desktopDir, 'src/main');
const desktopPackage = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
const entryFile = path.resolve(desktopDir, desktopPackage.main);
const currentModule = Symbol('current module');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function loadCommonJs(filename, mocks, requireMain) {
  const module = { exports: {} };
  const require = name => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
    return mocks[name];
  };
  require.main = requireMain === currentModule ? module : requireMain;
  const errors = [];
  const context = {
    module, exports: module.exports, require,
    __dirname: path.dirname(filename), __filename: filename,
    Buffer, URL, setTimeout, clearTimeout, setImmediate,
    process: { env: {}, platform: 'linux' },
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) }
  };
  context.global = context;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { value: module.exports, errors };
}

// Let the bootstrap's async error handler complete without relying on a delay.
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('desktop entry starts exactly once regardless of require.main in development or packaged mode', async () => {
  for (const requireMain of [undefined, { filename: '/electron/default_app.asar/main.js' }, currentModule]) {
    const calls = { construct: 0, initialize: 0, errors: [], exits: [] };
    class Desktop {
      constructor() { calls.construct += 1; }
      async initialize() { calls.initialize += 1; }
    }
    loadCommonJs(entryFile, {
      './main': Desktop,
      electron: {
        app: { exit: code => calls.exits.push(code) },
        dialog: { showErrorBox: (...args) => calls.errors.push(args) }
      }
    }, requireMain);
    await nextTurn();
    assert.equal(calls.construct, 1);
    assert.equal(calls.initialize, 1);
    assert.deepEqual(calls.errors, []);
    assert.deepEqual(calls.exits, []);
  }
});

test('desktop entry displays initialization failures and exits unsuccessfully', async () => {
  for (const error of [new Error('Window creation failed'), 'Initialization rejected']) {
    const calls = [];
    class Desktop {
      async initialize() { throw error; }
    }
    const loaded = loadCommonJs(entryFile, {
      './main': Desktop,
      electron: {
        dialog: { showErrorBox: (...args) => calls.push(['error', ...args]) },
        app: { exit: code => calls.push(['exit', code]) }
      }
    });
    await nextTurn();
    assert.deepEqual(calls, [
      ['error', 'Hexo Pro Desktop 启动失败', error.message || String(error)],
      ['exit', 1]
    ]);
    assert.equal(loaded.errors.length, 1);
    assert.equal(loaded.errors[0].at(-1), error);
  }
});

function desktopFixture() {
  const ready = deferred();
  const authentication = deferred();
  const windowCreated = deferred();
  const calls = [];
  const app = new EventEmitter();
  app.getVersion = () => '2.0.0';
  app.whenReady = () => ready.promise;
  app.setName = name => calls.push(['setName', name]);
  class AuthManager {
    loadAuthData() {
      calls.push('loadAuthData');
      return authentication.promise;
    }
  }
  class HexoProServer {
    async startStaticServer() {
      calls.push('startStaticServer');
      return { url: 'http://127.0.0.1:4000' };
    }
  }
  const loaded = loadCommonJs(path.join(mainDir, 'main.js'), {
    electron: { app },
    path, 'fs-extra': {},
    child_process: { exec() {} }, util: { promisify },
    './auth-manager': AuthManager, './hexo-server': HexoProServer,
    './desktop-security': {}, 'electron-updater': { autoUpdater: null },
    'iconv-lite': {}, 'node-fetch': () => {}
  }, currentModule);
  const Desktop = loaded.value;
  Desktop.prototype.initializeStore = async () => { calls.push('initializeStore'); };
  Desktop.prototype.createWindow = () => {
    calls.push('createWindow');
    return windowCreated.promise;
  };
  Desktop.prototype.createMenu = () => { calls.push('createMenu'); };
  Desktop.prototype.setupAutoUpdater = () => { calls.push('setupAutoUpdater'); };
  Desktop.prototype.setupIPC = () => { calls.push('setupIPC'); };
  const desktop = new Desktop();
  return { desktop, app, calls, ready, authentication, windowCreated };
}

test('desktop initialization waits for app readiness, authentication, and window creation', async () => {
  const { desktop, app, calls, ready, authentication, windowCreated } = desktopFixture();
  let settled = false;
  const startup = desktop.initialize();
  startup.then(() => { settled = true; });
  await nextTurn();
  assert.equal(settled, false);
  assert.deepEqual(calls, [['setName', 'Hexo Pro Desktop'], 'setupIPC']);
  for (const event of ['window-all-closed', 'activate', 'before-quit']) {
    assert.equal(app.listenerCount(event), 1);
  }

  ready.resolve();
  await nextTurn();
  assert.equal(settled, false);
  assert.equal(calls.includes('loadAuthData'), true);
  assert.equal(calls.includes('createWindow'), false);

  authentication.resolve();
  await nextTurn();
  assert.equal(settled, false);
  assert.equal(calls.includes('createWindow'), true);
  assert.equal(calls.includes('createMenu'), false);

  windowCreated.resolve();
  await startup;
  assert.equal(settled, true);
  assert.deepEqual(calls.slice(2), [
    'initializeStore', 'loadAuthData', 'createWindow', 'createMenu', 'setupAutoUpdater', 'startStaticServer'
  ]);
});

test('desktop initialization propagates asynchronous window failures to its caller', async () => {
  const { desktop, calls, ready, authentication, windowCreated } = desktopFixture();
  const error = new Error('Renderer cannot load');
  const rejected = assert.rejects(desktop.initialize(), failure => failure === error);
  ready.resolve();
  authentication.resolve();
  await nextTurn();
  assert.equal(calls.includes('createWindow'), true);
  windowCreated.reject(error);
  await rejected;
  assert.equal(calls.includes('createMenu'), false);
  assert.equal(calls.includes('setupAutoUpdater'), false);
  assert.equal(calls.includes('startStaticServer'), false);
});
