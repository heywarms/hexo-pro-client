const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const requireCore = createRequire(path.resolve(__dirname, '../hexo-pro/package.json'));
const Hexo = requireCore('hexo');
const identity = require('../hexo-pro/document_identity');
const update = require('../hexo-pro/update');
const registerPosts = require('../hexo-pro/post_api');
const registerPages = require('../hexo-pro/page_api');
const registerRecycle = require('../hexo-pro/recycle_api');
const registerMcp = require('../hexo-pro/mcp_api');
const { createMcpToken } = require('../hexo-pro/mcp_token');

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'hexo-pro-identity-'));
  const instances = [];
  const write = async (file, data) => {
    await fs.mkdir(path.dirname(path.join(base, file)), { recursive: true });
    await fs.writeFile(path.join(base, file), data);
  };
  const original = '---\r\n# Keep this comment\r\ntitle: "Original"\r\ndate: 2020-01-01\r\nid: plugin-owned-id\r\nabbrlink: abc123\r\ncustom: Keep this\r\n---\r\nOriginal content\r\n';
  const about = ';;;\n"title": "About",\n"layout": "page",\n"custom": "JSON front matter"\n;;;\nAbout body\n';
  await write('package.json', JSON.stringify({ name: 'identity-fixture', version: '1.0.0', hexo: { version: Hexo.version } }));
  await write('_config.yml', 'url: https://example.test\npermalink: :year/:month/:day/:title/\n');
  await write('source/_posts/original.md', original);
  await write('source/about/index.md', about);
  await write('scaffolds/draft.md', '---\ntitle: {{ title }}\ndate: {{ date }}\n---\n');
  const load = async () => {
    const hexo = new Hexo(base, { silent: true, draft: true });
    instances.push(hexo);
    hexo.extend.renderer.register('md', 'html', data => '<p>' + data.text + '</p>', true);
    await hexo.init();
    await hexo.load();
    return hexo;
  };
  t.after(async () => {
    for (const hexo of instances) hexo.unwatch();
    await fs.rm(base, { force: true, recursive: true });
  });
  const hexo = await load();
  return { hexo, base, load, write, original, about };
}

function routes(register, hexo, db) {
  const handlers = {};
  register(null, hexo, (route, handler) => { handlers[route] = handler; }, db);
  return handlers;
}

function request(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      done: resolve,
      send: (status, message) => reject(Object.assign(new Error(typeof message === 'string' ? message : JSON.stringify(message)), { statusCode: status }))
    };
    try { Promise.resolve(handler({ method: 'GET', body: {}, params: {}, headers: {}, ...req }, res, reject)).catch(reject); }
    catch (error) { reject(error); }
  });
}

const save = (hexo, kind, id, changes) => new Promise((resolve, reject) => {
  update(kind, id, changes, (error, result) => error ? reject(error) : resolve(result), hexo);
});

test('identities survive restart, cache reset, domain and permalink changes without altering any article bytes', async t => {
  const { hexo, base, load, write, original, about } = await fixture(t);
  const post = hexo.model('Post').toArray()[0];
  const page = hexo.model('Page').toArray()[0];
  const legacy = Buffer.from(post.permalink).toString('base64');
  const internalId = post._id;
  const oldStat = await fs.stat(path.join(base, 'source/_posts/original.md'));
  const postId = identity.ensureDocumentId(hexo, post);
  const pageId = identity.ensureDocumentId(hexo, page);
  assert.match(postId, /^[a-f0-9-]{36}$/);
  assert.notEqual(postId, pageId);
  assert.equal(await fs.readFile(path.join(base, 'source/_posts/original.md'), 'utf8'), original);
  assert.equal(await fs.readFile(path.join(base, 'source/about/index.md'), 'utf8'), about);
  assert.equal((await fs.stat(path.join(base, 'source/_posts/original.md'))).mtimeMs, oldStat.mtimeMs);
  const registryBefore = await fs.readFile(identity.storePath(hexo), 'utf8');
  identity.prepareDocumentIds(hexo);
  assert.equal(await fs.readFile(identity.storePath(hexo), 'utf8'), registryBefore);
  await hexo.database.save();
  await fs.rm(path.join(base, 'db.json'), { force: true });
  await write('_config.yml', 'url: http://localhost:4999\npermalink: :year/:month/:day/:title/\n');
  const restarted = await load();
  identity.prepareDocumentIds(restarted);
  const reloaded = identity.findDocument(restarted, 'Post', postId);
  assert.notEqual(reloaded._id, internalId);
  assert.equal(identity.ensureDocumentId(restarted, reloaded), postId);
  assert.equal(identity.findDocument(restarted, 'Post', encodeURIComponent(legacy)).source, reloaded.source);
  restarted.config.permalink = 'plugins/:abbrlink/';
  assert.equal(identity.findDocument(restarted, 'Post', postId).permalink, 'http://localhost:4999/plugins/abc123/');
  assert.equal(identity.findDocument(restarted, 'Page', pageId).source, 'about/index.md');
  assert.equal(await fs.readFile(path.join(base, 'source/_posts/original.md'), 'utf8'), original);
  assert.equal(await fs.readFile(path.join(base, 'source/about/index.md'), 'utf8'), about);
});

test('editing, renaming, publishing, removing and restoring retain the same identity through the APIs', async t => {
  const { hexo, base } = await fixture(t);
  const posts = routes(registerPosts, hexo);
  const post = hexo.model('Post').toArray()[0];
  const id = identity.ensureDocumentId(hexo, post);
  const renamed = await save(hexo, 'Post', id, { title: 'Renamed', source: '_posts/renamed.md', _content: 'Unique search phrase\n' });
  assert.equal(identity.ensureDocumentId(hexo, renamed), id);
  assert.equal(identity.parseRaw(await fs.readFile(renamed.full_source, 'utf8')).id, 'plugin-owned-id');
  assert.equal(identity.parseRaw(await fs.readFile(renamed.full_source, 'utf8')).hexo_pro_id, undefined);
  const search = await request(posts['blog/search'], { method: 'POST', body: { searchPattern: 'Unique search' } });
  assert.equal(search.data[0].documentId, id);
  const draft = await request(posts['posts/:param1/:param2'], { params: { param1: id, param2: 'unpublish' } });
  assert.equal(draft.documentId, id);
  assert.equal(draft.isDraft, true);
  const published = await request(posts['posts/:param1/:param2'], { params: { param1: id, param2: 'publish' } });
  assert.equal(published.documentId, id);
  assert.equal(published.source, '_posts/renamed.md');
  const originalSource = published.source;
  const removed = await request(posts['posts/:param1/:param2'], { params: { param1: id, param2: 'remove' } });
  assert.equal(removed.documentId, id);
  assert.equal(identity.findDocument(hexo, 'Post', id), null);
  const recycleDoc = { _id: 'recycle-entry', type: 'post', documentId: id, originalSource, discardedPath: removed.source };
  const recycle = routes(registerRecycle, hexo, { recycleDb: {
    findOne: (_, cb) => cb(null, recycleDoc),
    remove: (_, __, cb) => cb(null, 1)
  } });
  await request(recycle['recycle/restore'], { method: 'POST', body: { id: recycleDoc._id } });
  const restored = identity.findDocument(hexo, 'Post', id);
  assert.equal(restored.source, originalSource);
  await save(hexo, 'Post', id, { _content: 'Edited after restoring\n' });
  assert.equal(identity.findDocument(hexo, 'Post', id)._content, 'Edited after restoring\n');
  const registry = JSON.parse(await fs.readFile(identity.storePath(hexo), 'utf8'));
  assert.equal(registry.documents.filter(record => record.documentId === id).length, 1);
});

test('external moves preserve identity while copies and ambiguous moves cannot capture another article identity', async t => {
  const { hexo, base } = await fixture(t);
  const id = identity.ensureDocumentId(hexo, hexo.model('Post').toArray()[0]);
  await fs.rename(path.join(base, 'source/_posts/original.md'), path.join(base, 'source/_posts/moved.md'));
  await hexo.source.process();
  assert.equal(identity.findDocument(hexo, 'Post', id).source, '_posts/moved.md');
  await fs.copyFile(path.join(base, 'source/_posts/moved.md'), path.join(base, 'source/_posts/copied.md'));
  await hexo.source.process();
  const copy = hexo.model('Post').findOne({ source: '_posts/copied.md' });
  assert.notEqual(identity.ensureDocumentId(hexo, copy), id);
  assert.equal(identity.findDocument(hexo, 'Post', id).source, '_posts/moved.md');
  await fs.rename(path.join(base, 'source/_posts/moved.md'), path.join(base, 'source/_posts/ambiguous-a.md'));
  await fs.copyFile(path.join(base, 'source/_posts/ambiguous-a.md'), path.join(base, 'source/_posts/ambiguous-b.md'));
  await hexo.source.process();
  assert.equal(identity.findDocument(hexo, 'Post', id), null);
  const a = hexo.model('Post').findOne({ source: '_posts/ambiguous-a.md' });
  const b = hexo.model('Post').findOne({ source: '_posts/ambiguous-b.md' });
  assert.notEqual(identity.ensureDocumentId(hexo, a), identity.ensureDocumentId(hexo, b));
});

test('new posts, pages, metadata and MCP operations use the external identity and preserve plugin fields', async t => {
  const { hexo } = await fixture(t);
  const posts = routes(registerPosts, hexo);
  const pages = routes(registerPages, hexo);
  const newPost = await request(posts['posts/new'], { method: 'POST', body: { title: 'New draft' } });
  const newPage = await request(pages['pages/new'], { method: 'POST', body: { title: 'New page' } });
  assert.notEqual(newPost.documentId, newPage.documentId);
  assert.ok(identity.findDocument(hexo, 'Post', newPost.documentId));
  assert.ok(identity.findDocument(hexo, 'Page', newPage.documentId));
  await fs.unlink(path.join(hexo.source_dir, newPost.source));
  await hexo.source.process();
  const replacement = await request(posts['posts/new'], { method: 'POST', body: { title: 'New draft' } });
  assert.notEqual(replacement.documentId, newPost.documentId);
  assert.equal(identity.findDocument(hexo, 'Post', newPost.documentId), null);
  const page = hexo.model('Page').findOne({ source: 'about/index.md' });
  const pageId = identity.ensureDocumentId(hexo, page);
  await save(hexo, 'Page', pageId, { title: 'New About', source: 'new-about/index.md', _content: 'Page after moving\n' });
  assert.equal(identity.findDocument(hexo, 'Page', pageId)._content, 'Page after moving\n');
  const post = hexo.model('Post').findOne({ source: '_posts/original.md' });
  const postId = identity.ensureDocumentId(hexo, post);
  const excluded = await request(posts['posts/check-title'], { query: { title: post.title, excludeId: postId } });
  assert.equal(excluded.exists, false);
  const { settings, token } = createMcpToken();
  const mcp = routes(registerMcp, hexo, { settingsDb: { findOne: (_, cb) => cb(null, settings) } });
  const headers = { 'x-hexo-pro-mcp-token': token };
  const result = await request(mcp['mcp/agent/posts/update'], { method: 'POST', headers, body: { documentId: postId, content: 'Agent content\n' } });
  assert.equal(result.data.documentId, postId);
  const byId = await request(mcp['mcp/agent/posts/get'], { method: 'POST', headers, body: { documentId: postId } });
  const byUrl = await request(mcp['mcp/agent/posts/get'], { method: 'POST', headers, body: { permalink: post.permalink } });
  assert.equal(byId.data.documentId, byUrl.data.documentId);
  assert.equal(byId.data.id, 'plugin-owned-id');
});

test('corrupt or missing registries fail visibly instead of silently generating replacement IDs', async t => {
  const { hexo } = await fixture(t);
  const post = hexo.model('Post').toArray()[0];
  const id = identity.ensureDocumentId(hexo, post);
  const file = identity.storePath(hexo);
  const saved = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, '{broken');
  assert.throws(() => identity.findDocument(hexo, 'Post', id), /身份索引损坏/);
  await fs.writeFile(file, saved);
  assert.equal(identity.findDocument(hexo, 'Post', id).source, post.source);
  await fs.unlink(file);
  assert.throws(() => identity.ensureDocumentId(hexo, post), /身份索引丢失/);
  await fs.writeFile(file, saved);
  assert.equal(identity.ensureDocumentId(hexo, post), id);
});
