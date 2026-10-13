const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const requireCore = createRequire(path.resolve(__dirname, '../hexo-pro/package.json'));
const Datastore = requireCore('@seald-io/nedb');
const jwt = requireCore('jsonwebtoken');
const security = require('../hexo-pro/auth_security');
const registerSettings = require('../hexo-pro/settings_api');
const registerLogin = require('../hexo-pro/login_api');
const registerAuth = require('../hexo-pro/auth_api');

function fixture() {
  const db = { userDb: new Datastore(), settingsDb: new Datastore() };
  const routes = {};
  const use = (name, handler) => { routes[name] = handler; };
  registerSettings({}, {}, use, db);
  registerLogin({}, {}, use, db);
  registerAuth({}, {}, use, db);
  const middleware = security.createAuthMiddleware(db, ['/hexopro/api/settings/register', '/hexopro/api/settings/skip-setup']);
  const authenticate = token => new Promise(resolve => {
    const req = { originalUrl: '/hexopro/api/ai/settings/save', headers: token ? { authorization: `Bearer ${token}` } : {} };
    middleware(req, {}, error => resolve({ req, error }));
  });
  const call = (name, body = {}, auth) => new Promise((resolve, reject) => {
    const req = { method: 'POST', body, headers: {}, auth };
    const res = { done: data => resolve({ status: 200, data }), send: (status, data) => resolve({ status, data }) };
    Promise.resolve(routes[name](req, res, () => reject(new Error('Unexpected next')))).catch(reject);
  });
  return { db, routes, authenticate, call };
}

const registration = { username: 'owner', password: 'first-password', confirmPassword: 'first-password', securityQuestion: 'test', securityAnswer: 'answer' };

test('API mounts authentication even before registration and protects AI, schema and credential writes', async () => {
  const db = { userDb: new Datastore(), settingsDb: new Datastore() };
  let registered, mounted = false;
  const middleware = () => {};
  const context = { module: { exports: {} }, global: {}, console: { log() {}, error() {} }, require(name) {
    if (name === './theme_runtime') return { getLiveHexo: value => value };
    if (name === './document_identity') return { prepareDocumentIds() {} };
    if (name === './auth_security') return { createAuthMiddleware(actualDb, paths) { assert.equal(actualDb, db); registered = paths; return middleware; } };
    if (name === './database-manager') return { initialize: async () => db };
    if (name === 'crypto') return require('node:crypto');
    if (name === 'body-parser') return { json: () => () => {}, urlencoded: () => () => {} };
    if (name === 'circular-json') return JSON;
    return () => {};
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../hexo-pro/api.js'), 'utf8'), context);
  await context.module.exports({ use(route, handler) { if (handler === middleware) mounted = true; } }, { config: { root: '/' } });
  assert.equal(mounted, true);
  for (const route of ['ai/chat', 'ai/settings', 'ai/settings/save', 'theme/schema/generate', 'desktop/save-token']) {
    assert.equal(registered.includes('/hexopro/api/' + route), false);
  }
});

test('registration stores salted credentials and immediately requires a valid session', async () => {
  const f = fixture();
  assert.equal((await f.authenticate()).error.name, 'UnauthorizedError');
  const result = await f.call('settings/register', registration);
  assert.equal(result.data.code, 0);
  const user = await security.query(f.db.userDb, 'findOne', { username: 'owner' });
  assert.match(user.password, /^scrypt\$/);
  assert.match(user.securityAnswer, /^scrypt\$/);
  assert.equal(await security.verifySecret('first-password', user.password), true);
  assert.equal(await security.verifySecret('wrong', user.password), false);
  assert.notEqual(await security.hashSecret('first-password'), user.password);
  assert.equal((await f.authenticate()).error.name, 'UnauthorizedError');
  const authenticated = await f.authenticate(result.data.data.token);
  assert.equal(authenticated.error, undefined);
  assert.equal(authenticated.req.auth.userId, user._id);
  assert.equal((await f.call('auth/validate', {}, authenticated.req.auth)).data.valid, true);
});

test('legacy plaintext credentials migrate on login and existing username-only tokens remain compatible', async () => {
  const f = fixture();
  await security.query(f.db.userDb, 'insert', { username: 'legacy', password: 'legacy-pass', resetToken: 'answer' });
  const secret = await security.ensureJwtSecret(f.db.settingsDb);
  const legacyToken = jwt.sign({ username: 'legacy' }, secret, { expiresIn: '1d' });
  assert.equal((await f.authenticate(legacyToken)).error, undefined);
  const result = await f.call('login', { username: 'legacy', password: 'legacy-pass' });
  assert.equal(result.data.code, 0);
  const user = await security.query(f.db.userDb, 'findOne', { username: 'legacy' });
  assert.match(user.password, /^scrypt\$/);
  assert.match(user.securityAnswer, /^scrypt\$/);
  assert.equal(user.resetToken, undefined);
  assert.equal(await security.verifySecret('answer', user.securityAnswer), true);
  const authenticated = await f.authenticate(result.data.token);
  const refreshed = await f.call('auth/refresh', {}, authenticated.req.auth);
  assert.equal((await f.authenticate(refreshed.data.token)).error, undefined);
});

test('password changes and recovery revoke old sessions without rotating the server secret', async () => {
  const f = fixture();
  const first = (await f.call('settings/register', registration)).data.data.token;
  const auth = (await f.authenticate(first)).req.auth;
  const secret = await security.ensureJwtSecret(f.db.settingsDb);
  const changed = await f.call('settings/update', { password: 'second-password', confirmPassword: 'second-password' }, auth);
  assert.equal(changed.data.code, 0);
  assert.equal((await f.authenticate(first)).error.name, 'UnauthorizedError');
  assert.equal((await f.authenticate(changed.data.data.token)).error, undefined);
  assert.equal(await security.ensureJwtSecret(f.db.settingsDb), secret);
  const reset = await f.call('auth/reset-password', { username: 'owner', securityAnswer: 'answer', newPassword: 'third-password', confirmPassword: 'third-password' });
  assert.equal(reset.data.code, 0);
  assert.equal((await f.authenticate(changed.data.data.token)).error.name, 'UnauthorizedError');
  assert.equal((await f.call('login', { username: 'owner', password: 'second-password' })).data.code, -1);
  const loggedIn = await f.call('login', { username: 'owner', password: 'third-password' });
  assert.equal(loggedIn.data.code, 0);
  const user = await security.query(f.db.userDb, 'findOne', { username: 'owner' });
  assert.match(user.password, /^scrypt\$/);
  assert.match(user.securityAnswer, /^scrypt\$/);
});

test('temporary accounts work with authenticated APIs and become protected formal accounts', async () => {
  const f = fixture();
  const temp = (await f.call('settings/skip-setup')).data.data;
  assert.equal(temp.isTemporary, true);
  const authenticated = await f.authenticate(temp.token);
  assert.equal(authenticated.error, undefined);
  assert.equal((await f.call('settings', {}, authenticated.req.auth)).data.code, 0);
  const changed = await f.call('settings/update', { username: 'owner', password: 'new-password', confirmPassword: 'new-password' }, authenticated.req.auth);
  assert.equal(changed.data.code, 0);
  assert.equal((await f.authenticate(temp.token)).error.name, 'UnauthorizedError');
  assert.equal((await f.authenticate(changed.data.data.token)).error, undefined);
  assert.equal((await f.call('settings/skip-setup')).data.code, 403);
  assert.equal((await f.call('settings/register', registration)).data.code, 403);
});

test('registration replaces temporary sessions and rejects concurrent initialization', async () => {
  const f = fixture();
  const temp = (await f.call('settings/skip-setup')).data.data.token;
  const results = await Promise.all([f.call('settings/register', registration), f.call('settings/register', { ...registration, username: 'other' })]);
  assert.deepEqual(results.map(r => r.data.code).sort((a, b) => a - b), [0, 409]);
  assert.equal((await f.authenticate(temp)).error.name, 'UnauthorizedError');
  assert.equal(await security.query(f.db.userDb, 'count', {}), 1);
});

function aiFixture() {
  const routes = {};
  let settings = { type: 'ai', url: 'https://custom.example.test/v1/chat/completions', model: 'test', apiKey: 'TEST_SECRET' };
  let outgoing;
  const context = { module: { exports: {} }, URL, Buffer, console: { log() {}, error() {} }, require(name) {
    assert.equal(name, 'axios');
    return async request => { outgoing = request; return { status: 200, data: { ok: true } }; };
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../hexo-pro/ai_api.js'), 'utf8'), context);
  context.module.exports({}, {}, (name, fn) => routes[name] = fn, { settingsDb: {
    findOne(query, callback) { callback(null, settings); },
    update(query, update, options, callback) { settings = { ...settings, ...update.$set }; callback(null); }
  } });
  const call = (name, body) => new Promise((resolve, reject) => {
    Promise.resolve(routes[name]({ body }, { done: data => resolve({ status: 200, data }), send: (status, data) => resolve({ status, data }) })).catch(reject);
  });
  return { call, outgoing: () => outgoing, settings: () => settings };
}

test('AI endpoint changes reject reuse of stored or masked credentials', async () => {
  const f = aiFixture();
  for (const apiKey of [undefined, '', '****CRET']) {
    const result = await f.call('ai/settings/save', { url: 'https://different.example.test/chat', model: 'test', apiKey });
    assert.equal(result.status, 400);
    assert.equal(f.settings().url, 'https://custom.example.test/v1/chat/completions');
  }
  const retained = await f.call('ai/settings/save', { url: 'https://custom.example.test/v1/chat/completions', model: 'test', apiKey: '****CRET' });
  assert.equal(retained.status, 200);
  await f.call('ai/chat', { messages: [{ role: 'user', content: 'test' }] });
  assert.equal(f.outgoing().headers.Authorization, 'Bearer TEST_SECRET');
  assert.equal(f.outgoing().maxRedirects, 0);
});

test('AI accepts explicit custom endpoints with new credentials and rejects unsafe URL schemes', async () => {
  const f = aiFixture();
  const changed = await f.call('ai/settings/save', { url: 'http://127.0.0.1:1234/v1/chat/completions', model: 'local', apiKey: 'NEW_KEY' });
  assert.equal(changed.status, 200);
  await f.call('ai/chat', { messages: [{ role: 'user', content: 'test' }] });
  assert.equal(f.outgoing().headers.Authorization, 'Bearer NEW_KEY');
  assert.equal(f.outgoing().url, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal((await f.call('ai/settings/save', { url: 'file:///private/config', apiKey: 'new' })).status, 400);
  assert.equal((await f.call('ai/settings/save', { url: 'https://user:pass@example.test/chat', apiKey: 'new' })).status, 400);
});

test('Connect preserves originalUrl for public route matching at root and nested API mounts', async t => {
  const connect = requireCore('connect');
  const http = require('node:http');
  const db = { userDb: new Datastore(), settingsDb: new Datastore() };
  const user = await security.query(db.userDb, 'insert', { username: 'mounted', tokenVersion: 0 });
  const token = security.signUserToken(user, await security.ensureJwtSecret(db.settingsDb));
  const app = connect();
  const prefixes = ['/hexopro/api', '/blog/hexopro/api'];
  for (const prefix of prefixes) {
    app.use(prefix, security.createAuthMiddleware(db, [prefix + '/login']));
    app.use(prefix, (req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ url: req.url, originalUrl: req.originalUrl, auth: req.auth })); });
  }
  app.use((error, req, res, next) => { res.statusCode = error.statusCode || 500; res.end(error.message); });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const prefix of prefixes) {
    const publicResponse = await fetch(base + prefix + '/login?from=test');
    assert.equal(publicResponse.status, 200);
    const publicBody = await publicResponse.json();
    assert.equal(publicBody.url, '/login?from=test');
    assert.equal(publicBody.originalUrl, prefix + '/login?from=test');
    assert.equal((await fetch(base + prefix + '/ai/settings')).status, 401);
    const protectedResponse = await fetch(base + prefix + '/ai/settings', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(protectedResponse.status, 200);
    assert.equal((await protectedResponse.json()).auth.userId, user._id);
  }
});

test('initial accounts imported from Hexo config are hashed before entering the database', async () => {
  const manager = require('../hexo-pro/database-manager');
  const db = { userDb: new Datastore(), settingsDb: new Datastore() };
  const config = { hexo_pro: { username: 'imported', password: 'configuration-password' } };
  await manager._initializeUserAndSettings(db.userDb, db.settingsDb, { config });
  const user = await security.query(db.userDb, 'findOne', { username: 'imported' });
  assert.match(user.password, /^scrypt\$/);
  assert.equal(await security.verifySecret('configuration-password', user.password), true);
  assert.equal(user.tokenVersion, 0);
  assert.equal(config.hexo_pro.password, 'configuration-password');
});
