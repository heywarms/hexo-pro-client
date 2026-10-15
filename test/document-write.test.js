'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const requireCore = createRequire(path.resolve(__dirname, '../hexo-pro/package.json'));
const Hexo = requireCore('hexo');
const update = require('../hexo-pro/update');
const identity = require('../hexo-pro/document_identity');
const { revisionFor, withRevision, movePost } = require('../hexo-pro/document_write');
const registerPosts = require('../hexo-pro/post_api');
const registerPages = require('../hexo-pro/page_api');
const registerMcp = require('../hexo-pro/mcp_api');
const { createMcpToken } = require('../hexo-pro/mcp_token');

async function fixture(t) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'hexopro-write-'));
  for (const dir of ['source/_posts', 'source/_drafts', 'source/about']) await fsp.mkdir(path.join(base, dir), { recursive: true });
  await fsp.writeFile(path.join(base, 'package.json'), JSON.stringify({ name: 'write-fixture', version: '1.0.0', hexo: { version: Hexo.version } }));
  await fsp.writeFile(path.join(base, '_config.yml'), 'url: https://example.test\npermalink: :year/:month/:day/:title/\n');
  const original = '\uFEFF---\r\ntitle: Original\r\ndate: 2020-01-01\r\ncustom: Keep\r\n---\r\nOriginal body\r\n';
  await fsp.writeFile(path.join(base, 'source/_posts/original.md'), original);
  await fsp.writeFile(path.join(base, 'source/_drafts/draft.md'), '---\ntitle: Draft\ndate: 2020-01-02\n---\nDraft body\n');
  await fsp.writeFile(path.join(base, 'source/about/index.md'), '---\ntitle: About\nlayout: page\n---\nAbout body\n');
  const hexo = new Hexo(base, { silent: true, draft: true });
  hexo.extend.renderer.register('md', 'html', data => `<p>${data.text}</p>`, true);
  t.after(async () => { hexo.unwatch(); await fsp.rm(base, { recursive: true, force: true }); });
  await hexo.init(); await hexo.load();
  identity.prepareDocumentIds(hexo);
  const id = source => identity.ensureDocumentId(hexo, hexo.model(source.startsWith('_') ? 'Post' : 'Page').findOne({ source }));
  return { base, hexo, original, postId: id('_posts/original.md'), draftId: id('_drafts/draft.md'), pageId: id('about/index.md') };
}

const save = (hexo, id, input, kind = 'Post') => new Promise((resolve, reject) => update(kind, id, input, (error, value) => error ? reject(error) : resolve(value), hexo));
function routes(register, hexo, db) {
  const handlers = {};
  register(null, hexo, (name, handler) => { handlers[name] = handler; }, db);
  return handlers;
}
function request(handler, input = {}) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, setHeader() {},
      done(data) { resolve({ status: this.statusCode, data }); },
      send(status, data) { resolve({ status, data }); },
      end(raw) { resolve({ status: this.statusCode, data: JSON.parse(raw) }); } };
    try { Promise.resolve(handler({ method: 'POST', params: {}, headers: {}, body: {}, ...input }, res, reject)).catch(reject); }
    catch (error) { reject(error); }
  });
}

test('document saves reject traversal, absolute paths and state changes without changing the original', async t => {
  const { base, hexo, postId, original } = await fixture(t);
  for (const source of ['../escaped.md', '_posts/../../escaped.md', '/tmp/escaped.md', 'C:/escaped.md', '_posts\\escaped.md', '_posts/./escaped.md', '_posts//escaped.md']) {
    await assert.rejects(save(hexo, postId, { source, _content: 'Attack' }), error => error.code === 'INVALID_DOCUMENT_PATH');
  }
  await assert.rejects(save(hexo, postId, { source: '_drafts/escaped.md' }), error => error.statusCode === 403);
  const occupied = path.join(base, 'source/_posts/occupied.md');
  await fsp.writeFile(occupied, 'Another article');
  await assert.rejects(save(hexo, postId, { source: '_posts/occupied.md' }), error => error.code === 'DOCUMENT_PATH_CONFLICT');
  assert.equal(await fsp.readFile(occupied, 'utf8'), 'Another article');
  assert.equal(await fsp.readFile(path.join(base, 'source/_posts/original.md'), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(base, 'escaped.md')), false);
});

test('document saves refuse symlink parents and symlink source files', async t => {
  const { base, hexo, postId } = await fixture(t);
  const outside = path.join(base, 'outside');
  await fsp.mkdir(outside);
  const protectedFile = path.join(outside, 'protected.md');
  await fsp.writeFile(protectedFile, 'Keep outside');
  await fsp.symlink(outside, path.join(base, 'source/_posts/link'));
  await assert.rejects(save(hexo, postId, { source: '_posts/link/new.md' }), error => error.code === 'INVALID_DOCUMENT_PATH');
  await fsp.symlink(protectedFile, path.join(base, 'source/_posts/linked.md'));
  await assert.rejects(save(hexo, postId, { source: '_posts/linked.md' }), error => error.code === 'INVALID_DOCUMENT_PATH');
  await fsp.unlink(path.join(base, 'source/_posts/original.md'));
  await fsp.symlink(protectedFile, path.join(base, 'source/_posts/original.md'));
  await assert.rejects(save(hexo, postId, { _content: 'Attack' }), error => error.code === 'INVALID_DOCUMENT_PATH');
  assert.equal(await fsp.readFile(protectedFile, 'utf8'), 'Keep outside');
  assert.equal(fs.existsSync(path.join(outside, 'new.md')), false);
});

test('optimistic revision checks occur inside the document queue and preserve the winning edit', async t => {
  const { hexo, postId } = await fixture(t);
  const baseRevision = withRevision(hexo, identity.findDocument(hexo, 'Post', postId)).revision;
  const results = await Promise.allSettled([
    save(hexo, postId, { _content: 'First writer\n', baseRevision }),
    save(hexo, postId, { _content: 'Stale writer\n', baseRevision }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.code, 'REVISION_CONFLICT');
  assert.equal(results[1].reason.statusCode, 409);
  assert.equal(results[1].reason.currentRevision, results[0].value.revision);
  assert.equal(identity.findDocument(hexo, 'Post', postId)._content, 'First writer\n');
  const retried = await save(hexo, postId, { _content: 'Merged\n', baseRevision: results[0].value.revision });
  assert.notEqual(retried.revision, baseRevision);
});

test('legacy saves serialize partial updates across a rename and publishing waits for the same document', async t => {
  const { hexo, draftId } = await fixture(t);
  await Promise.all([
    save(hexo, draftId, { title: 'Renamed', source: '_drafts/renamed.md' }),
    save(hexo, draftId, { _content: 'Latest body\n' }),
    movePost(hexo, draftId, '_posts'),
  ]);
  const post = identity.findDocument(hexo, 'Post', draftId);
  assert.equal(post.source, '_posts/renamed.md');
  assert.equal(post.title, 'Renamed');
  assert.equal(post._content, 'Latest body\n');
  assert.equal(identity.ensureDocumentId(hexo, post), draftId);
});

test('a failed atomic replace or identity-index commit preserves original bytes and the original ID', async t => {
  const { base, hexo, postId, original } = await fixture(t);
  const file = path.join(base, 'source/_posts/original.md');
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === file) throw Object.assign(new Error('Disk write failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(save(hexo, postId, { _content: 'Uncommitted' }), /Disk write failure/);
  mock.mock.restore();
  assert.equal(await fsp.readFile(file, 'utf8'), original);
  assert.deepEqual((await fsp.readdir(path.dirname(file))).filter(name => name.endsWith('.tmp')), []);
  const lock = identity.storePath(hexo) + '.lock';
  await fsp.writeFile(lock, String(process.pid));
  await assert.rejects(save(hexo, postId, { source: '_posts/renamed.md', _content: 'Not committed' }), /身份索引/);
  await fsp.unlink(lock);
  assert.equal(await fsp.readFile(file, 'utf8'), original);
  assert.equal(fs.existsSync(path.join(base, 'source/_posts/renamed.md')), false);
  assert.equal(identity.findDocument(hexo, 'Post', postId).source, '_posts/original.md');
});

test('post and page APIs expose byte-exact revisions and return structured conflict responses', async t => {
  const { hexo, postId, pageId, original } = await fixture(t);
  const posts = routes(registerPosts, hexo), pages = routes(registerPages, hexo);
  const read = await request(posts['posts/:param1'], { method: 'GET', params: { param1: postId } });
  assert.equal(read.data.revision, revisionFor(Buffer.from(original)));
  const first = await request(posts['post/update/:id'], { params: { id: postId }, body: { _content: 'Changed', baseRevision: read.data.revision } });
  assert.equal(first.status, 200);
  assert.equal(first.data.revision, first.data.post.revision);
  const conflict = await request(posts['post/update/:id'], { params: { id: postId }, body: { _content: 'Stale', baseRevision: read.data.revision } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.code, 'REVISION_CONFLICT');
  assert.equal(conflict.data.currentRevision, first.data.revision);
  const page = await request(pages['pages/:id'], { method: 'GET', params: { id: pageId } });
  const edited = await request(pages['page/update'], { body: { _id: pageId, baseRevision: page.data.revision, update: { title: 'New About' } } });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.revision, edited.data.page.revision);
  assert.notEqual(edited.data.revision, page.data.revision);
});

test('MCP write scope rejects model fields and cannot publish via rawUpdate.source', async t => {
  const { hexo, draftId } = await fixture(t);
  const { token, settings } = createMcpToken({ scopes: ['read', 'write'] });
  const handlers = routes(registerMcp, hexo, { settingsDb: { findOne: (_, callback) => callback(null, settings) } });
  const headers = { 'x-hexo-pro-mcp-token': token };
  for (const rawUpdate of [{ isDraft: false }, { full_source: '/tmp/attack' }, { raw: 'Attack' }, { frontMatter: { source: '_posts/attack.md' } }, JSON.parse('{"__proto__":{"isDraft":false}}')]) {
    const result = await request(handlers['mcp/agent/posts/update'], { headers, body: { documentId: draftId, rawUpdate } });
    assert.equal(result.status, 400);
  }
  const moved = await request(handlers['mcp/agent/posts/update'], { headers, body: { documentId: draftId, rawUpdate: { source: '_posts/attack.md' } } });
  assert.equal(moved.status, 403);
  const published = await request(handlers['mcp/agent/posts/publish'], { headers, body: { documentId: draftId } });
  assert.equal(published.status, 403);
  const read = await request(handlers['mcp/agent/posts/get'], { headers, body: { documentId: draftId } });
  const valid = await request(handlers['mcp/agent/posts/update'], { headers, body: { documentId: draftId, baseRevision: read.data.data.revision,
    content: 'Safe content', rawUpdate: { title: 'Safe', source: '_drafts/safe.md' } } });
  assert.equal(valid.status, 200);
  assert.equal(valid.data.data.isDraft, true);
  assert.equal(valid.data.data.source, '_drafts/safe.md');
  assert.match(valid.data.data.revision, /^[a-f0-9]{64}$/);
});

test('page creation rejects traversal titles and symlink destinations', async t => {
  const { base, hexo } = await fixture(t);
  const handlers = routes(registerPages, hexo);
  const traversal = await request(handlers['pages/new'], { body: { title: '../escaped' } });
  assert.equal(traversal.status, 400);
  const outside = path.join(base, 'outside');
  await fsp.mkdir(outside);
  await fsp.symlink(outside, path.join(base, 'source/linked'));
  const symlink = await request(handlers['pages/new'], { body: { title: 'linked' } });
  assert.equal(symlink.status, 400);
  assert.equal(fs.existsSync(path.join(outside, 'index.md')), false);
});

test('the legacy page title endpoint keeps resources in place and cannot move outside source', async t => {
  const { base, hexo, pageId } = await fixture(t);
  const handlers = routes(registerPages, hexo);
  const original = await fsp.readFile(path.join(base, 'source/about/index.md'), 'utf8');
  const denied = await request(handlers.updatePageFrontMatter, { body: { permalink: pageId, key: 'title', value: '../../outside' } });
  assert.equal(denied.status, 400);
  assert.equal(await fsp.readFile(path.join(base, 'source/about/index.md'), 'utf8'), original);
  await fsp.writeFile(path.join(base, 'source/about/image.png'), 'Image');
  const renamed = await request(handlers.updatePageFrontMatter, { body: { permalink: pageId, key: 'title', value: 'New About' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.title, 'New About');
  assert.equal(renamed.data.source, 'about/index.md');
  assert.equal(await fsp.readFile(path.join(base, 'source/about/image.png'), 'utf8'), 'Image');
  assert.match(renamed.data.revision, /^[a-f0-9]{64}$/);
});
