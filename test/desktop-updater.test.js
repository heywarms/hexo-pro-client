const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DesktopUpdater, STARTUP_DELAY, CHECK_INTERVAL } = require('../hexo-pro-desktop/src/main/desktop-updater');

const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(options = {}) {
  const updater = new EventEmitter();
  const calls = { check: 0, download: 0, install: 0, prepare: 0, confirm: 0, installError: 0, saved: [] };
  const timers = new Map();
  const updates = [];
  updater.checkForUpdates = async () => {
    calls.check += 1;
    updater.emit('update-available', { version: '2.1.0-beta.1' });
    return { updateInfo: { version: '2.1.0-beta.1' } };
  };
  updater.downloadUpdate = async () => {
    calls.download += 1;
    updater.emit('update-downloaded', { version: '2.1.0-beta.1' });
    return ['/cache/update.zip'];
  };
  updater.quitAndInstall = (silent, forceRun) => {
    calls.install += 1;
    assert.equal(silent, false);
    assert.equal(forceRun, true);
  };
  const controller = new DesktopUpdater({
    updater, version: '2.1.0-beta.0', isPackaged: true, platform: 'darwin',
    onState: state => updates.push(state),
    saveAutoDownload: value => calls.saved.push(value),
    confirmInstall: async () => { calls.confirm += 1; return true; },
    beforeInstall: async () => { calls.prepare += 1; },
    onInstallError: () => { calls.installError += 1; },
    timers: {
      setTimeout: (fn, ms) => { timers.set('startup', { fn, ms }); return 'startup'; },
      setInterval: (fn, ms) => { timers.set('periodic', { fn, ms }); return 'periodic'; },
      clearTimeout: key => timers.delete(key), clearInterval: key => timers.delete(key), setImmediate,
    },
    logger: { warn() {} },
    ...options,
  });
  controller.start();
  return { controller, updater, calls, timers, updates };
}

test('startup and periodic checks download automatically, but never install without a request', async () => {
  const { controller, updater, calls, timers, updates } = fixture();
  assert.equal(timers.get('startup').ms, STARTUP_DELAY);
  assert.equal(timers.get('periodic').ms, CHECK_INTERVAL);
  assert.equal(updater.autoInstallOnAppQuit, false);
  controller.start();
  assert.equal(updater.listenerCount('update-available'), 1);
  timers.get('startup').fn();
  await nextTurn();
  assert.equal(calls.check, 1);
  assert.equal(calls.download, 1);
  assert.equal(controller.state.status, 'downloaded');
  assert.equal(controller.state.progress, 100);
  assert.ok(controller.state.lastCheckedAt);
  assert.ok(updates.some(state => state.status === 'downloading' && state.progress === 0));
  timers.get('periodic').fn();
  await nextTurn();
  assert.equal(calls.check, 1, 'periodic checks must preserve a ready installer');
  assert.equal(calls.install, 0);
  controller.stop();
  assert.equal(timers.size, 0);
});

test('unsupported builds report a reason immediately and never start network requests', async () => {
  for (const [options, reason] of [
    [{ isPackaged: false }, 'development'],
    [{ updater: null }, 'missing-updater'],
    [{ platform: 'linux', appImage: '' }, 'appimage-required'],
  ]) {
    const { controller, calls, timers } = fixture(options);
    assert.equal(controller.state.status, 'disabled');
    assert.equal(controller.state.disabledReason, reason);
    for (const action of ['checkForUpdates', 'downloadUpdate', 'installUpdate']) {
      assert.deepEqual(await controller[action](), { supported: false });
    }
    assert.equal(timers.size, 0);
    assert.equal(calls.check + calls.download + calls.install, 0);
  }
  assert.equal(fixture({ platform: 'linux', appImage: '/opt/Hexo.AppImage' }).controller.state.supported, true);
});

test('stable builds exclude previews and preview builds never allow downgrades', () => {
  for (const version of ['2.1.0', '2.1.0-beta.0', '2.1.0-alpha.1', '2.1.0+build-test']) {
    const { controller, updater } = fixture({ version });
    assert.equal(updater.allowPrerelease, version.split('+')[0].includes('-'));
    assert.equal(updater.allowDowngrade, false);
    assert.equal(controller.state.channel, version.split('+')[0].split('-')[1]?.split('.')[0] || 'stable');
  }
});

test('concurrent check/download requests are coalesced and a check cannot interrupt a download', async () => {
  const { controller, updater, calls } = fixture({ autoDownload: false });
  const check = deferred();
  updater.checkForUpdates = async () => { calls.check += 1; await check.promise; updater.emit('update-available', { version: '2.2.0' }); return {}; };
  const first = controller.checkForUpdates();
  assert.equal(first, controller.checkForUpdates());
  check.resolve();
  await first;
  const download = deferred();
  updater.downloadUpdate = async () => { calls.download += 1; await download.promise; updater.emit('update-downloaded', { version: '2.2.0' }); };
  const second = controller.downloadUpdate();
  assert.equal(second, controller.downloadUpdate());
  await controller.checkForUpdates();
  assert.equal(controller.state.status, 'downloading');
  assert.equal(calls.check, 1);
  download.resolve();
  await second;
  assert.equal(calls.download, 1);
});

test('manual download mode persists across checks and can be enabled for an available update', async () => {
  const { controller, calls } = fixture({ autoDownload: false });
  await controller.checkForUpdates();
  assert.equal(calls.download, 0);
  assert.equal(controller.state.status, 'update-available');
  assert.throws(() => controller.setAutoDownload('true'), /布尔值/);
  controller.setAutoDownload(true);
  await nextTurn();
  assert.deepEqual(calls.saved, [true]);
  assert.equal(calls.download, 1);
  assert.equal(controller.state.autoDownload, true);
});

test('disabling automatic download while checking prevents a later automatic download', async () => {
  const { controller, updater, calls } = fixture();
  const check = deferred();
  updater.checkForUpdates = async () => { await check.promise; updater.emit('update-available', { version: '2.2.0' }); return {}; };
  const pending = controller.checkForUpdates();
  controller.setAutoDownload(false);
  check.resolve();
  await pending;
  assert.equal(calls.download, 0);
  assert.equal(controller.state.status, 'update-available');
});

test('checks recover after network failures and clear stale version information', async () => {
  const { controller, updater } = fixture({ autoDownload: false });
  const check = updater.checkForUpdates;
  await controller.checkForUpdates();
  updater.checkForUpdates = async () => { throw new Error('offline'); };
  await assert.rejects(controller.checkForUpdates(), /offline/);
  assert.equal(controller.state.status, 'error');
  assert.equal(controller.state.availableVersion, null);
  assert.equal(controller.state.errorStage, 'check');
  updater.checkForUpdates = check;
  await controller.checkForUpdates();
  assert.equal(controller.state.status, 'update-available');
  assert.equal(controller.state.error, null);
});

test('download failures can be retried and progress cannot escape the valid range', async () => {
  const { controller, updater } = fixture({ autoDownload: false });
  const download = updater.downloadUpdate;
  await controller.checkForUpdates();
  updater.downloadUpdate = async () => { throw new Error('checksum mismatch'); };
  await assert.rejects(controller.downloadUpdate(), /checksum/);
  assert.equal(controller.state.errorStage, 'download');
  assert.equal(controller.state.availableVersion, '2.1.0-beta.1');
  for (const [percent, expected] of [[150, 100], [-20, 0], [NaN, 0], [32.5, 32.5]]) {
    updater.emit('download-progress', { percent });
    assert.equal(controller.state.progress, expected);
  }
  controller.setState({ status: 'error', errorStage: 'download' });
  updater.downloadUpdate = download;
  await controller.downloadUpdate();
  assert.equal(controller.state.status, 'downloaded');
  assert.equal(controller.state.error, null);
});

test('no-update responses and null responses leave an actionable state', async () => {
  const { controller, updater, calls } = fixture();
  updater.checkForUpdates = async () => { updater.emit('update-not-available'); return {}; };
  await controller.checkForUpdates();
  assert.equal(controller.state.status, 'up-to-date');
  assert.equal(calls.download, 0);
  updater.checkForUpdates = async () => null;
  await assert.rejects(controller.checkForUpdates(), /无法检查更新/);
  assert.equal(controller.state.status, 'error');
});

test('installation requires a downloaded update and only one confirmation/installation can run', async () => {
  const { controller, calls } = fixture();
  await assert.rejects(controller.installUpdate(), /下载完成/);
  await assert.rejects(controller.downloadUpdate(), /先检查/);
  await controller.checkForUpdates();
  await nextTurn();
  const pending = controller.installUpdate();
  assert.equal(pending, controller.installUpdate());
  await pending;
  assert.equal(controller.state.status, 'installing');
  assert.equal(calls.confirm, 1);
  assert.equal(calls.prepare, 1);
  await nextTurn();
  assert.equal(calls.install, 1);
});

test('canceling installation or a pending-save guard leaves the ready update intact', async () => {
  for (const blockedBySave of [false, true]) {
    const { controller, calls } = fixture({
      confirmInstall: async () => blockedBySave,
      beforeInstall: async () => { throw new Error('unsaved article'); },
    });
    await controller.checkForUpdates();
    await nextTurn();
    if (blockedBySave) await assert.rejects(controller.installUpdate(), /unsaved article/);
    else assert.equal((await controller.installUpdate()).canceled, true);
    assert.equal(controller.state.status, 'downloaded');
    assert.equal(calls.install, 0);
  }
});

test('installer errors release the quitting flag and are shown as installation failures', async () => {
  for (const syncThrow of [true, false]) {
    const { controller, updater, calls } = fixture();
    updater.quitAndInstall = () => {
      if (syncThrow) throw new Error('installer unavailable');
      updater.emit('error', new Error('signature rejected'));
    };
    await controller.checkForUpdates();
    await nextTurn();
    await controller.installUpdate();
    await nextTurn();
    assert.equal(controller.state.status, 'error');
    assert.equal(controller.state.errorStage, 'install');
    assert.equal(calls.installError, 1);
  }
});

test('a check finishing during shutdown never starts a new download', async () => {
  const { controller, updater, calls } = fixture();
  const check = deferred();
  updater.checkForUpdates = async () => { await check.promise; updater.emit('update-available', { version: '2.2.0' }); return {}; };
  const pending = controller.checkForUpdates();
  controller.stop();
  check.resolve();
  await pending;
  assert.equal(calls.download, 0);
});

test('renderer subscriptions ignore a stale initial response and all responses after unmount', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../client/src/utils/desktopUpdater.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  const initial = deferred();
  const states = [];
  let listener, removed = false;
  const unsubscribe = module.exports.subscribeToUpdater({
    getState: () => initial.promise,
    onStatusChange: callback => { listener = callback; return () => { removed = true; }; },
  }, state => states.push(state));
  listener({ status: 'downloaded' });
  initial.resolve({ status: 'idle' });
  await nextTurn();
  assert.deepEqual(states, [{ status: 'downloaded' }]);
  unsubscribe();
  listener({ status: 'checking' });
  assert.equal(removed, true);
  assert.equal(states.length, 1);
});

test('welcome page supports menu checks, retry and canceled installation without opening a blog', async () => {
  const elements = new Map(['update-panel', 'update-status', 'update-check', 'update-download', 'update-install'].map(id => [id, {
    textContent: '', hidden: false, disabled: false, focus() { this.focused = true; }, scrollIntoView() {},
  }]));
  const initial = deferred();
  let onStatus, onMenu, checks = 0, downloads = 0, installs = 0;
  const bridge = {
    onOpenSettings: callback => { onMenu = callback; },
    updater: {
      onStatusChange: callback => { onStatus = callback; }, getState: () => initial.promise,
      checkForUpdates: async () => { checks += 1; },
      downloadUpdate: async () => { downloads += 1; onStatus({ status: 'downloading', supported: true, progress: 42, availableVersion: '2.2.0' }); },
      installUpdate: async () => { installs += 1; return { canceled: true }; },
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../hexo-pro-desktop/src/renderer/updater.js'), 'utf8'), {
    document: { getElementById: id => elements.get(id) }, window: { electronAPI: bridge },
  });
  onStatus({ status: 'idle', supported: true, currentVersion: '2.1.0' });
  initial.resolve({ status: 'disabled', supported: false });
  await nextTurn();
  onMenu({ action: 'check-update' });
  await nextTurn();
  assert.equal(checks, 1);
  onStatus({ status: 'error', supported: true, availableVersion: '2.2.0', errorStage: 'download', error: '<img src=x>' });
  assert.equal(elements.get('update-status').textContent, '更新失败：<img src=x>');
  assert.equal(elements.get('update-download').hidden, false);
  await elements.get('update-download').onclick();
  assert.equal(downloads, 1);
  assert.equal(elements.get('update-check').disabled, true);
  assert.match(elements.get('update-status').textContent, /42.0%/);
  onStatus({ status: 'downloaded', supported: true, availableVersion: '2.2.0' });
  onMenu({ action: 'check-update' });
  assert.equal(elements.get('update-install').focused, true);
  await elements.get('update-install').onclick();
  assert.equal(installs, 1);
  assert.equal(elements.get('update-install').hidden, false);
  assert.equal(elements.get('update-install').disabled, false);
});
