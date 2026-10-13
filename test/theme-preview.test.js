const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const requireCore = createRequire(path.resolve(__dirname, '../hexo-pro/package.json'));
const Hexo = requireCore('hexo');
const registerPreviewApi = require('../hexo-pro/preview_api');
const { renderPreview } = registerPreviewApi;
const { switchTheme } = require('../hexo-pro/theme_runtime');

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'hexo-pro-preview-test-'));
  const write = async (file, content) => {
    const target = path.join(base, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };
  await write('package.json', JSON.stringify({ name: 'preview-fixture', version: '1.0.0', hexo: { version: Hexo.version } }));
  await write('_config.yml', 'title: Preview fixture\nurl: https://example.test/blog\nroot: /blog/\ntheme: next\n');
  await write('source/_posts/hello.md', '---\ntitle: Saved title\ndate: 2020-01-01\ntags: [Test]\n---\nSaved content\n');
  await write('source/_drafts/draft.md', '---\ntitle: Draft\ndate: 2020-01-02\n---\nDraft content\n');
  await write('source/about/index.md', '---\ntitle: About\nlayout: custom\n---\nAbout content\n');
  await write('scripts/renderer.js', `
    hexo.extend.renderer.register('md', 'html', data => '<p>' + data.text.trim() + '</p>', true);
    hexo.extend.renderer.register('fixture', 'html', (data, locals) => {
      if (data.text.trim() === 'layout') return '<html><head><link href="/blog/theme.css" rel="stylesheet"></head><body>' + locals.body + '</body></html>';
      return '<article data-theme="' + locals.theme.marker + '" data-layout="' + data.text.trim() + '" data-post="' + !!locals.page.__post + '" data-page="' + !!locals.page.__page + '" data-locals="' + locals.previewMarker + '"><h1>' + locals.page.title + '</h1>' + locals.page.content + '</article>';
    }, true);
    hexo.extend.tag.register('preview_test', () => '<strong>Hexo tag rendered</strong>');
  `);
  for (const name of ['next', 'fluid']) {
    await write('themes/' + name + '/_config.yml', 'marker: ' + name + '\n');
    for (const layout of ['layout', 'post', 'page', 'custom']) {
      await write('themes/' + name + '/layout/' + layout + '.fixture', layout);
    }
    await write('themes/' + name + '/scripts/filters.js', `
      hexo.extend.filter.register('after_post_render', data => { data.content += '[${name}]'; return data; });
      hexo.extend.filter.register('template_locals', locals => { locals.previewMarker = '${name}-locals'; return locals; });
      hexo.extend.filter.register('after_render:html', html => html + '<!-- html-filter -->');
      hexo.extend.injector.register('body_end', '<!-- injected -->');
    `);
  }
  const hexo = new Hexo(base, { silent: true });
  t.after(async () => {
    hexo.unwatch();
    await fs.rm(base, { recursive: true, force: true });
  });
  await hexo.init();
  await hexo.load();
  const id = document => Buffer.from(document.permalink).toString('base64');
  return { hexo, base, id };
}

test('renders unsaved content through the current theme, tags, helpers and filters without saving', async t => {
  const { hexo, base, id } = await fixture(t);
  const post = hexo.model('Post').findOne({ source: '_posts/hello.md' });
  const saved = await fs.readFile(path.join(base, 'source', post.source), 'utf8');
  const originalContent = post.content;
  const paths = hexo.route.list();
  const preview = await renderPreview(hexo, 'post', id(post), { content: 'Unsaved {% preview_test %}', title: 'Unsaved title' });
  assert.match(preview.html, /<html>/);
  assert.match(preview.html, /data-theme="next"/);
  assert.match(preview.html, /data-layout="post"/);
  assert.match(preview.html, /data-post="true"/);
  assert.match(preview.html, /Unsaved title/);
  assert.match(preview.html, /Hexo tag rendered/);
  assert.match(preview.html, /\[next\]/);
  assert.match(preview.html, /next-locals/);
  assert.match(preview.html, /injected/);
  assert.match(preview.html, /html-filter/);
  assert.equal(post.title, 'Saved title');
  assert.equal(post.content, originalContent);
  assert.equal(await fs.readFile(path.join(base, 'source', post.source), 'utf8'), saved);
  assert.deepEqual(hexo.route.list(), paths);
});

test('previews drafts without publishing and uses custom page layouts', async t => {
  const { hexo, base, id } = await fixture(t);
  const draft = hexo.model('Post').findOne({ source: '_drafts/draft.md' });
  const preview = await renderPreview(hexo, 'post', id(draft), { content: 'Draft preview' });
  assert.match(preview.html, /data-layout="post"/);
  assert.match(preview.html, /Draft preview/);
  assert.equal(draft.published, false);
  await fs.access(path.join(base, 'source/_drafts/draft.md'));
  await assert.rejects(fs.access(path.join(base, 'source/_posts/draft.md')));
  const page = hexo.model('Page').findOne({ source: 'about/index.md' });
  const pagePreview = await renderPreview(hexo, 'page', id(page), { content: 'About preview' });
  assert.match(pagePreview.html, /data-layout="custom"/);
  assert.match(pagePreview.html, /data-page="true"/);
});

test('uses the new theme after a runtime switch instead of cached preview output', async t => {
  const { hexo, id } = await fixture(t);
  const postId = id(hexo.model('Post').findOne({ source: '_posts/hello.md' }));
  await renderPreview(hexo, 'post', postId, { content: 'First version' });
  await switchTheme(hexo, { themeDir: 'fluid', configFile: '_config.fluid.yml' });
  const preview = await renderPreview(hexo, 'post', postId, { content: 'Second version' });
  assert.equal(preview.theme, 'fluid');
  assert.match(preview.html, /data-theme="fluid"/);
  assert.match(preview.html, /Second version/);
  assert.match(preview.html, /\[fluid\]/);
  assert.doesNotMatch(preview.html, /First version|\[next\]/);
});

test('validates requests and provides a local asset base URL including the blog root', async t => {
  const { hexo, id } = await fixture(t);
  let handler;
  registerPreviewApi(null, hexo, (name, fn) => { handler = fn; });
  const postId = id(hexo.model('Post').findOne({ source: '_posts/hello.md' }));
  const request = async options => {
    let response;
    await handler({ method: 'POST', params: { kind: 'post', id: postId }, headers: { host: '127.0.0.1:8001' }, body: { content: '' }, ...options }, {
      done: data => { response = { status: 200, data }; },
      send: (status, data) => { response = { status, data }; },
    });
    return response;
  };
  assert.equal((await request({ method: 'GET' })).status, 405);
  assert.equal((await request({ body: { content: null } })).status, 400);
  assert.equal((await request({ body: { content: 'a'.repeat(2 * 1024 * 1024 + 1) } })).status, 413);
  assert.equal((await request({ params: { kind: 'post', id: Buffer.from('missing').toString('base64') } })).status, 404);
  assert.equal((await request({ params: { kind: 'other', id: postId } })).status, 400);
  assert.equal((await request({ params: { kind: 'post', id: '%broken' } })).status, 400);
  const encodedId = '%' + postId.charCodeAt(0).toString(16) + encodeURIComponent(postId.slice(1));
  assert.equal((await request({ params: { kind: 'post', id: encodedId } })).status, 200);
  const result = await request({ body: { content: 'Preview' } });
  assert.equal(result.status, 200);
  assert.equal(new URL(result.data.baseURL).origin, 'http://127.0.0.1:8001');
  assert.equal(new URL(result.data.baseURL).pathname, '/blog/' + result.data.path);
});
