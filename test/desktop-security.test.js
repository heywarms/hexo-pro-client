const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const desktopDir = path.resolve(__dirname, '../hexo-pro-desktop');
const mainDir = path.join(desktopDir, 'src/main');
const security = require(path.join(mainDir, 'desktop-security'));
const copy = require(path.join(desktopDir, 'scripts/copy-hexo-pro'));

function loadIsolated(filename, mocks, extra = {}) {
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  const logs = [];
  const context = {
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : realRequire(name),
    module, exports: module.exports, __dirname: path.dirname(filename), __filename: filename,
    Buffer, URL, process, setTimeout, clearTimeout, setInterval, clearInterval,
    console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => logs.push(args)])),
    ...extra
  };
  context.global = context;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { value: module.exports, logs, context };
}

function memoryStore(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    get: (key, fallback) => Object.hasOwn(data, key) ? data[key] : fallback,
    set: (key, value) => { data[key] = structuredClone(value); },
    delete: key => { delete data[key]; }
  };
}

function encryptedStorage() {
  const key = crypto.randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'test-keyring',
    encryptString: text => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decryptString: bytes => {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    }
  };
}

function authFixture(initial = {}, secure = encryptedStorage(), axios = {}) {
  const store = memoryStore(initial);
  const loaded = loadIsolated(path.join(mainDir, 'auth-manager.js'), {
    electron: { app: { getPath: () => '/test/userData' }, safeStorage: secure }, axios
  });
  return { auth: new loaded.value(store), AuthManager: loaded.value, store, logs: loaded.logs, secure };
}

function legacyPassword(value, userPath = '/test/userData') {
  const key = Buffer.from(userPath).toString('base64');
  let text = '';
  for (let index = 0; index < value.length; index++) text += String.fromCharCode(value.charCodeAt(index) ^ key.charCodeAt(index % key.length));
  return Buffer.from(text).toString('base64');
}

const token = 'header.payload.signature';
const password = 'secret-password-秘密';

test('desktop credentials migrate to encrypted storage, reload, and never enter logs', async () => {
  const { auth, AuthManager, store, logs } = authFixture({
    tokens: { '/blog': token }, tokensUpdatedAt: 'legacy',
    credentials: { '/blog': { username: 'writer', password: legacyPassword(password), rememberPassword: true } }
  });
  assert.equal(await auth.loadAuthData(), true);
  assert.equal(auth.getToken('/blog'), token);
  assert.equal((await auth.getStoredCredentials('/blog')).password, password);
  for (const key of ['tokens', 'credentials', 'tokensUpdatedAt']) assert.equal(store.get(key), undefined);
  const serialized = JSON.stringify(store.data);
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes(password), false);
  assert.equal(JSON.stringify(logs).includes(token), false);
  const reloaded = new AuthManager(store);
  await reloaded.loadAuthData();
  assert.equal(reloaded.getToken('/blog'), token);
  assert.equal((await reloaded.getStoredCredentials('/blog')).password, password);
  await reloaded.saveCredentials('/blog', 'writer', password, false);
  assert.equal((await reloaded.getStoredCredentials('/blog')).password, null);
  await reloaded.clearAll();
  assert.deepEqual(store.data, {});
});

test('desktop storage fails closed without a keyring or with Linux basic_text', async () => {
  for (const mode of ['unavailable', 'basic_text', 'encrypt-error']) {
    const secure = encryptedStorage();
    if (mode === 'unavailable') secure.isEncryptionAvailable = () => false;
    if (mode === 'basic_text') secure.getSelectedStorageBackend = () => 'basic_text';
    if (mode === 'encrypt-error') secure.encryptString = () => { throw new Error(`sensitive ${password}`); };
    const { auth, store, logs } = authFixture({ tokens: { '/blog': token }, credentials: {
      '/blog': { username: 'writer', password: legacyPassword(password), rememberPassword: true }
    } }, secure);
    assert.equal(await auth.loadAuthData(), false);
    assert.equal(auth.getToken('/blog'), null);
    assert.equal(store.get('tokens'), undefined);
    assert.equal(store.get('credentials'), undefined);
    await assert.rejects(auth.setToken('/blog', token));
    await assert.rejects(auth.saveCredentials('/blog', 'writer', password, true));
    assert.equal(auth.getToken('/blog'), null);
    assert.equal(store.get('secureAuth'), undefined);
    assert.equal(JSON.stringify(logs).includes(password), false);
  }
});

test('desktop decrypt failures preserve ciphertext without exposing a secret or falling back to legacy data', async () => {
  const { auth, AuthManager, store, secure, logs } = authFixture();
  await auth.setToken('/blog', token);
  const ciphertext = structuredClone(store.data.secureAuth);
  store.set('tokens', { '/blog': 'different.old.token' });
  secure.decryptString = () => { throw new Error(token); };
  const reloaded = new AuthManager(store);
  assert.equal(await reloaded.loadAuthData(), false);
  assert.equal(reloaded.getToken('/blog'), null);
  assert.deepEqual(store.data.secureAuth, ciphertext);
  assert.equal(store.get('tokens'), undefined);
  assert.equal(JSON.stringify(logs).includes(token), false);
});

test('desktop token validation rejects server errors, timeouts, and non-auth success responses', async () => {
  const axios = { get: async () => ({ status: 200, data: { valid: true } }) };
  const { auth } = authFixture({}, encryptedStorage(), axios);
  assert.equal(await auth.validateToken('http://127.0.0.1:4000', token), true);
  axios.get = async () => ({ status: 200, data: { code: 500 } });
  assert.equal(await auth.validateToken('http://127.0.0.1:4000', token), false);
  axios.get = async () => { throw new Error('timeout'); };
  assert.equal(await auth.validateToken('http://127.0.0.1:4000', token), false);
});

function desktopFixture() {
  const windows = [];
  class FakeWindow extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = options;
      this.destroyed = false;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.setWindowOpenHandler = callback => { this.openHandler = callback; };
      this.webContents.send = (channel, ...args) => this.webContents.emit(channel, ...args);
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    async loadURL(url) { this.webContents.mainFrame.url = url; this.html = url.startsWith('data:') ? decodeURIComponent(url.slice(url.indexOf(',') + 1)) : ''; }
    async loadFile(file) { return this.loadURL(pathToFileURL(file).href); }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const ipcMain = new EventEmitter();
  const handlers = new Map();
  ipcMain.handle = (channel, callback) => handlers.set(channel, callback);
  const opened = [];
  const electron = {
    BrowserWindow: FakeWindow, ipcMain, Menu: {},
    app: { getVersion: () => '2.0.0', getPath: () => '/test/userData' },
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    shell: { openExternal: async url => opened.push(url) }
  };
  const loaded = loadIsolated(path.join(mainDir, 'main.js'), {
    electron, 'electron-updater': { autoUpdater: null }, './hexo-server': {}, './auth-manager': {}
  });
  const desktop = Object.create(loaded.value.prototype);
  desktop.mainWindow = new FakeWindow();
  desktop.mainWindow.webContents.mainFrame.url = 'http://127.0.0.1:4000/pro';
  desktop.hexoServer = { getUrl: () => 'http://127.0.0.1:4000' };
  desktop.currentProjectPath = '/blog';
  const event = window => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  return { desktop, windows, FakeWindow, ipcMain, handlers, event, opened, logs: loaded.logs };
}

function assertSandbox(window) {
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(path.basename(window.options.webPreferences.preload), 'dialog-preload.js');
  assert.doesNotMatch(window.html, /require\(['"]electron['"]\)/);
}

test('project-name dialog keeps create/cancel working and rejects forged windows, subframes, and unsafe names', async () => {
  const { desktop, windows, ipcMain, event } = desktopFixture();
  const pending = desktop.showProjectNameDialog();
  const window = windows.at(-1);
  assertSandbox(window);
  ipcMain.emit('project-name-result', event(desktop.mainWindow), { success: true, projectName: 'hijacked' });
  ipcMain.emit('project-name-result', { ...event(window), senderFrame: { url: window.webContents.getURL() } }, { success: true, projectName: 'iframe' });
  ipcMain.emit('project-name-result', event(window), { success: true, projectName: '../other;command' });
  assert.equal(window.isDestroyed(), false);
  ipcMain.emit('project-name-result', event(window), { success: true, projectName: 'my-blog_2' });
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.projectName, 'my-blog_2');
  const cancelled = desktop.showProjectNameDialog();
  ipcMain.emit('project-name-result', event(windows.at(-1)), { success: false });
  assert.equal((await cancelled).success, false);
  assert.equal(ipcMain.listenerCount('project-name-result'), 0);
});

test('confirmation dialog escapes all dynamic content, respects exact sender, and resolves confirm before closing', async () => {
  const { desktop, windows, ipcMain, event } = desktopFixture();
  const unsafe = '<img src=x onerror=alert(1)>"&';
  const pending = desktop.showCustomConfirmDialog({ title: unsafe, message: unsafe, detail: unsafe, confirmLabel: unsafe, cancelLabel: unsafe });
  const window = windows.at(-1);
  assertSandbox(window);
  assert.equal(window.html.includes(unsafe), false);
  assert.ok(window.html.includes(security.escapeHtml(unsafe)));
  ipcMain.emit('custom-confirm-result', event(desktop.mainWindow), { confirmed: true });
  assert.equal(window.isDestroyed(), false);
  ipcMain.emit('custom-confirm-result', event(window), { confirmed: true });
  assert.equal((await pending).confirmed, true);
  const cancelled = desktop.showCustomConfirmDialog();
  windows.at(-1).close();
  assert.equal((await cancelled).confirmed, false);
  assert.equal(ipcMain.listenerCount('custom-confirm-result'), 0);
});

test('project loading and closing windows are sandboxed and project HTML stays inert', () => {
  const { desktop, windows } = desktopFixture();
  const unsafe = '<img src=x onerror=alert(1)>';
  desktop.showProjectLoadingWindow(`/blogs/${unsafe}`);
  const window = windows.at(-1);
  assertSandbox(window);
  assert.equal(window.html.includes(unsafe), false);
  assert.ok(window.html.includes(security.escapeHtml(unsafe)));
  let prevented = false;
  window.webContents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://example.test');
  assert.equal(prevented, true);
  window.close();
  desktop.showProjectClosingWindow();
  assertSandbox(windows.at(-1));
});

test('progress bridge renders unsafe errors as text and accepts close only from its own window', async () => {
  const { desktop, windows, ipcMain, event } = desktopFixture();
  desktop.performProjectCreation = async () => {};
  await desktop.createProjectWithProgress('/blog', 'blog');
  const window = windows.at(-1);
  assertSandbox(window);
  const elements = new Map();
  const element = () => ({ style: {}, children: [], textContent: '',
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; }
  });
  const document = {
    getElementById: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: () => element(), createTextNode: text => ({ textContent: text })
  };
  let update;
  const sandbox = { document, window: { desktopDialog: { onProgress: callback => { update = callback; return () => {}; } }, addEventListener: () => {} } };
  vm.runInNewContext(window.html.match(/<script>([\s\S]*?)<\/script>/)[1], sandbox);
  const unsafe = '<img src=x onerror=alert(1)>';
  update({ step: unsafe, result: { success: false, message: unsafe } });
  assert.equal(elements.get('currentStep').children[1].textContent, unsafe);
  assert.equal(elements.get('resultMessage').children[0].textContent, unsafe);
  ipcMain.emit('close-progress-window', event(desktop.mainWindow));
  assert.equal(window.isDestroyed(), false);
  ipcMain.emit('close-progress-window', event(window));
  assert.equal(window.isDestroyed(), true);
  assert.equal(ipcMain.listenerCount('close-progress-window'), 0);
});

test('IPC denies unknown origins and frames, constrains external protocols, and validates saved tokens', async () => {
  const { desktop, handlers, event, opened } = desktopFixture();
  let saved = null;
  desktop.authManager = { validateToken: async (_url, candidate) => candidate === token, setToken: async (_path, candidate) => { saved = candidate; }, clearToken: async () => { saved = null; } };
  desktop.setupIPC();
  const caller = event(desktop.mainWindow);
  assert.throws(() => handlers.get('open-external')({ ...caller, senderFrame: { url: 'https://bad.test' } }, 'https://example.test'));
  desktop.mainWindow.webContents.mainFrame.url = 'https://bad.test';
  assert.throws(() => handlers.get('auth-save-token')(caller, token));
  desktop.mainWindow.webContents.mainFrame.url = 'http://127.0.0.1:4000/blog/post';
  assert.throws(() => handlers.get('auth-save-token')(caller, token));
  desktop.mainWindow.webContents.mainFrame.url = 'http://127.0.0.1:4000/pro/login';
  for (const url of ['javascript:alert(1)', 'file:///tmp/private', 'data:text/html,hello', 'custom:execute']) {
    await assert.rejects(handlers.get('open-external')(caller, url));
  }
  await handlers.get('open-external')(caller, 'https://example.test/path');
  assert.deepEqual(opened, ['https://example.test/path']);
  assert.equal((await handlers.get('auth-save-token')(caller, 'fake.token.value')).success, false);
  assert.equal(saved, null);
  assert.equal((await handlers.get('auth-save-token')(caller, token)).success, true);
  assert.equal(saved, token);
  await handlers.get('auth-clear-token')(caller);
  assert.equal(saved, null);
});

test('logout invalidates in-flight persistence and a project switch cannot save into another project', async () => {
  const { desktop, handlers, event } = desktopFixture();
  let complete;
  let saves = 0;
  desktop.authManager = { validateToken: () => new Promise(resolve => { complete = resolve; }), setToken: async () => { saves++; }, clearToken: async () => {} };
  desktop.setupIPC();
  const caller = event(desktop.mainWindow);
  const pending = handlers.get('auth-save-token')(caller, token);
  await handlers.get('auth-clear-token')(caller);
  complete(true);
  assert.equal((await pending).success, false);
  const next = handlers.get('auth-save-token')(caller, token);
  desktop.currentProjectPath = '/other';
  complete(true);
  assert.equal((await next).success, false);
  assert.equal(saves, 0);
});

test('dialog preload exposes only fixed channels and hides raw IPC events', () => {
  const ipcRenderer = new EventEmitter();
  const sends = [];
  ipcRenderer.send = (...args) => sends.push(args);
  let bridge;
  loadIsolated(path.join(mainDir, 'dialog-preload.js'), { electron: {
    ipcRenderer, contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }
  } });
  bridge.submitProjectName('my-blog');
  bridge.cancelProjectName();
  bridge.confirm(true);
  assert.equal(sends[0][0], 'project-name-result');
  assert.equal(sends[0][1].projectName, 'my-blog');
  assert.equal(sends[1][1].success, false);
  assert.equal(sends[2][1].confirmed, true);
  assert.equal(bridge.send, undefined);
  let received;
  const unsubscribe = bridge.onLoadingStep((...args) => { received = args; });
  ipcRenderer.emit('loading-step-update', { sensitive: 'event' }, 2, true);
  assert.deepEqual(received, [2, true]);
  unsubscribe();
  assert.equal(ipcRenderer.listenerCount('loading-step-update'), 0);
});

test('copy-core resolves a clean checkout and copies new helpers without stale files', async t => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hexopro-desktop-build-'));
  t.after(() => fsp.rm(temp, { recursive: true, force: true }));
  const sourceDir = path.join(temp, 'client/hexo-pro');
  const scriptDir = path.join(temp, 'client/hexo-pro-desktop/scripts');
  const targetDir = path.join(temp, 'output');
  await fsp.mkdir(path.join(sourceDir, 'www'), { recursive: true });
  await fsp.mkdir(scriptDir, { recursive: true });
  await fsp.mkdir(targetDir);
  await fsp.writeFile(path.join(sourceDir, 'package.json'), '{"name":"hexo-pro"}');
  await fsp.writeFile(path.join(sourceDir, 'api.js'), 'module.exports = {};');
  await fsp.writeFile(path.join(sourceDir, 'new_security_helper.js'), 'module.exports = {};');
  await fsp.writeFile(path.join(sourceDir, 'credentials.json'), '{"private":"do not package"}');
  await fsp.writeFile(path.join(sourceDir, 'www/index.html'), '<html>fresh build</html>');
  await fsp.writeFile(path.join(targetDir, 'old.js'), 'stale');
  assert.equal(copy.findHexoProDirectory(scriptDir, ''), sourceDir);
  await copy.copyHexoProCore({ sourceDir, targetDir, requiredFiles: ['api.js'] });
  assert.equal(await fsp.readFile(path.join(targetDir, 'new_security_helper.js'), 'utf8'), 'module.exports = {};');
  await assert.rejects(fsp.access(path.join(targetDir, 'old.js')));
  await assert.rejects(fsp.access(path.join(targetDir, 'credentials.json')));
  assert.equal(await fsp.readFile(path.join(targetDir, 'www/index.html'), 'utf8'), '<html>fresh build</html>');
  await fsp.unlink(path.join(sourceDir, 'api.js'));
  await assert.rejects(copy.copyHexoProCore({ sourceDir, targetDir, requiredFiles: ['api.js'] }), /api\.js/);
  assert.equal(await fsp.readFile(path.join(targetDir, 'api.js'), 'utf8'), 'module.exports = {};');
  await assert.rejects(copy.copyHexoProCore({ sourceDir, targetDir, requiredFiles: ['missing.js'] }), /missing\.js/);
});

test('logout removes saved sessions if a locked keyring prevents rewriting the remaining entries', async () => {
  const { auth, store, secure } = authFixture();
  await auth.setToken('/blog', token);
  await auth.setToken('/second', 'second.saved.token');
  secure.isEncryptionAvailable = () => false;
  await auth.clearToken('/blog');
  assert.equal(store.get('secureAuth'), undefined);
  assert.equal(auth.getToken('/blog'), null);
});

test('main preload runs with only Electron in the sandbox and preserves its public event API', async () => {
  const ipcRenderer = new EventEmitter();
  const calls = [];
  ipcRenderer.invoke = async (...args) => { calls.push(args); return { success: true }; };
  let bridge;
  loadIsolated(path.join(mainDir, 'preload.js'), { electron: {
    ipcRenderer, contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'electronAPI'); bridge = value; } }
  } }, { process: { argv: ['electron', '--hexo-pro-version=2.1.0'], platform: 'linux' } });
  assert.equal(bridge.getAppVersion(), '2.1.0');
  await bridge.auth.saveToken(token);
  await bridge.auth.clearToken();
  assert.deepEqual(calls, [['auth-save-token', token], ['auth-clear-token']]);
  let payload;
  const unsubscribe = bridge.onProjectLoaded(value => { payload = value; });
  ipcRenderer.emit('project-loaded', { sender: 'must not leak' }, { projectPath: '/blog' });
  assert.deepEqual(payload, { projectPath: '/blog' });
  unsubscribe();
  assert.equal(ipcRenderer.listenerCount('project-loaded'), 0);
});

test('dialog scripts use the preload bridge for form submit, cancel, and confirmation', async () => {
  const { desktop, windows } = desktopFixture();
  const pendingName = desktop.showProjectNameDialog();
  const nameWindow = windows.at(-1);
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, disabled: false, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } });
    return elements.get(id);
  };
  const calls = [];
  const context = vm.createContext({ document: { getElementById: get }, window: { desktopDialog: {
    submitProjectName: name => calls.push(['submit', name]), cancelProjectName: () => calls.push(['cancel'])
  } } });
  vm.runInContext(nameWindow.html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  get('projectName').value = 'my-blog';
  get('projectForm').listeners.submit({ preventDefault() {} });
  vm.runInContext('cancel()', context);
  assert.deepEqual(calls, [['submit', 'my-blog'], ['cancel']]);
  nameWindow.close();
  await pendingName;
  const pendingConfirm = desktop.showCustomConfirmDialog();
  const confirmWindow = windows.at(-1);
  const confirmContext = vm.createContext({ document: { addEventListener() {} }, window: { desktopDialog: { confirm: value => calls.push(['confirm', value]) } } });
  vm.runInContext(confirmWindow.html.match(/<script>([\s\S]*?)<\/script>/)[1], confirmContext);
  vm.runInContext('confirm(); cancel();', confirmContext);
  assert.deepEqual(calls.slice(-2), [['confirm', true], ['confirm', false]]);
  confirmWindow.close();
  await pendingConfirm;
});

test('desktop token preparation, navigation, renderer injection and failure logs contain no credentials', async () => {
  const { desktop, logs } = desktopFixture();
  const secret = 'privateTokenPayload.sensitiveLoginCredential.hiddenSignature';
  const previous = 'previousToken.payload.signature';
  desktop.authManager = { getToken: () => secret, tokens: new Map([['/blog', secret]]) };
  assert.equal(await desktop.prepareTokenInjection(), secret);
  desktop.prepareAndValidateToken = async () => secret;
  desktop.cleanupInvalidTokens = async () => true;
  desktop.injectDesktopFeatures = async () => {};
  desktop.pageLoadCount = 0;
  desktop.tokenInjectionAttempts = 0;
  desktop.maxTokenInjectionAttempts = 2;
  desktop.lastTokenInjected = previous;
  const localStorage = {
    value: previous,
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; }
  };
  const rendererConsole = Object.fromEntries(['log', 'error', 'warn'].map(level => [level, (...args) => logs.push(args)]));
  desktop.mainWindow.webContents.executeJavaScript = async script => vm.runInNewContext(script, { localStorage, console: rendererConsole });
  desktop.mainWindow.webContents.loadURL = async () => {};
  await desktop.loadWebInterface();
  assert.equal(desktop.lastTokenInjected, secret);
  assert.equal(localStorage.value, secret);
  localStorage.setItem = () => { throw new Error(secret); };
  assert.equal(await desktop.injectToken(secret), false);
  assert.equal(JSON.stringify(logs).includes(secret), false);
  assert.equal(JSON.stringify(logs).includes(previous), false);
  assert.equal(logs.some(args => args.some(value => value instanceof Error)), false);
});

test('copy-core requires the authentication and document-write security helpers before changing output', async t => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hexopro-required-security-'));
  t.after(() => fsp.rm(temp, { recursive: true, force: true }));
  const sourceDir = path.join(temp, 'core');
  const targetDir = path.join(temp, 'output');
  await fsp.mkdir(path.join(sourceDir, 'www'), { recursive: true });
  await fsp.writeFile(path.join(sourceDir, 'www/index.html'), '<html>test</html>');
  for (const name of copy.REQUIRED_CORE_FILES.filter(name => !['auth_security.js', 'document_write.js'].includes(name))) {
    await fsp.writeFile(path.join(sourceDir, name), 'module.exports = {};');
  }
  await assert.rejects(copy.copyHexoProCore({ sourceDir, targetDir }), error =>
    error.message.includes('auth_security.js') && error.message.includes('document_write.js'));
  await assert.rejects(fsp.access(targetDir));
});

test('GitHub project dialog isolates queries and submissions to its own top-level frame and cleans up on cancel', async () => {
  const { desktop, windows, FakeWindow, ipcMain, event } = desktopFixture();
  const queries = [];
  const dialog = loadIsolated(path.join(mainDir, 'project-source-dialog.js'), {
    electron: { BrowserWindow: FakeWindow, ipcMain },
    './github-project': {
      queryGitHub: async request => { queries.push(request); return { items: [] }; },
      validateConnection: input => ({ repository: input.repository, branch: input.branch, githubToken: input.githubToken })
    }
  }).value;
  const pending = dialog.showProjectSourceDialog(desktop.mainWindow);
  const window = windows.at(-1);
  assertSandbox(window);
  ipcMain.emit('project-source-query', event(desktop.mainWindow), { id: 1, githubToken: 'test' });
  ipcMain.emit('project-source-query', { ...event(window), senderFrame: { url: window.webContents.getURL() } }, { id: 2 });
  assert.equal(queries.length, 0);
  const reply = new Promise(resolve => window.webContents.once('project-source-response', resolve));
  ipcMain.emit('project-source-query', event(window), { id: 3, action: 'repositories', githubToken: 'test' });
  assert.equal((await reply).id, 3);
  assert.equal(queries.length, 1);
  ipcMain.emit('project-source-result', event(desktop.mainWindow), { success: false });
  ipcMain.emit('project-source-result', event(window), { success: true, source: 'github', projectName: '../outside' });
  assert.equal(window.isDestroyed(), false);
  ipcMain.emit('project-source-result', event(window), { success: true, source: 'github', projectName: 'my-blog', repository: 'test/blog', branch: 'writing', githubToken: 'test' });
  assert.equal((await pending).branch, 'writing');
  assert.equal(ipcMain.listenerCount('project-source-query'), 0);
  assert.equal(ipcMain.listenerCount('project-source-result'), 0);
  const cancelled = dialog.showProjectSourceDialog(desktop.mainWindow);
  ipcMain.emit('project-source-result', event(windows.at(-1)), { success: false });
  assert.equal((await cancelled).success, false);
  assert.equal(ipcMain.listenerCount('project-source-query'), 0);
});

test('new-project flow imports the chosen branch without requiring Hexo CLI and never overwrites an existing directory', async () => {
  const calls = [];
  let selection = { success: true, source: 'github', projectName: 'blog', repository: 'test/blog', branch: 'writing', githubToken: 'test' };
  let exists = false;
  const loaded = loadIsolated(path.join(mainDir, 'main.js'), {
    electron: { dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: ['/parent'] }),
      showMessageBox: async () => { calls.push('existing-directory'); },
      showErrorBox: (...args) => { throw new Error(args.join(' ')); }
    } },
    'fs-extra': { pathExists: async () => exists },
    'electron-updater': { autoUpdater: null }, './hexo-server': {}, './auth-manager': {},
    './project-source-dialog': { showProjectSourceDialog: async () => selection }
  });
  const desktop = Object.create(loaded.value.prototype);
  desktop.checkSystemDependencies = async () => { throw new Error('GitHub import should not require global Hexo CLI'); };
  desktop.createProjectWithProgress = async (...args) => calls.push(args);
  await desktop.createNewProject();
  assert.equal(calls[0][0], path.join('/parent', 'blog'));
  assert.equal(calls[0][2].branch, 'writing');
  assert.equal(desktop.isCreatingProject, false);
  exists = true;
  await desktop.createNewProject();
  assert.equal(calls.at(-1), 'existing-directory');
  assert.equal(calls.length, 2);
  selection = { success: false };
  await desktop.createNewProject();
  assert.equal(calls.length, 2);
});
