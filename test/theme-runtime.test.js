const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { createRequire } = require('node:module');

const requireCore = createRequire(path.resolve(__dirname, '../hexo-pro/package.json'));
const Hexo = requireCore('hexo');
const yaml = requireCore('js-yaml');
const { getLiveHexo, switchTheme } = require('../hexo-pro/theme_runtime');
const registerThemeApi = require('../hexo-pro/theme_api');

const themes = {
  alpha: { themeDir: 'next', configFile: '_config.next.yml' },
  beta: { themeDir: 'fluid', configFile: '_config.fluid.yml' },
};

async function fixture(t, { watch = false } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'hexo-pro-theme-test-'));
  const write = async (file, content) => {
    await fs.mkdir(path.dirname(path.join(base, file)), { recursive: true });
    await fs.writeFile(path.join(base, file), content);
  };
  await write('package.json', JSON.stringify({ name: 'theme-fixture', version: '1.0.0', hexo: { version: Hexo.version } }));
  await write('_config.yml', 'title: Theme fixture\nurl: https://example.test\ntheme: next\ntheme_config:\n  sitePriority: site\n');
  await write('source/_posts/hello.md', '---\ntitle: Hello\ndate: 2020-01-01\n---\nHello world\n');
  await write('scripts/renderer.js', `
    hexo.extend.renderer.register('md', 'html', data => '<p>' + data.text.trim() + '</p>', true);
    hexo.extend.renderer.register('fixture', 'html', (data, locals) => {
      if (data.text.includes('BROKEN_TEMPLATE')) throw new Error('Broken template');
      return JSON.stringify({
        template: data.text.trim(), theme: locals.theme, helper: locals.theme_marker(),
        posts: locals.site.posts.toArray().map(post => post.content)
      });
    }, true);
  `);
  for (const [marker, theme] of Object.entries(themes)) {
    await write(`themes/${theme.themeDir}/_config.yml`, `marker: ${marker}\nsitePriority: theme\n${marker}Only: true\n`);
    await write(`themes/${theme.themeDir}/layout/index.fixture`, marker);
    await write(`themes/${theme.themeDir}/source/${marker}.css`, `/* ${marker} */`);
    await write(`themes/${theme.themeDir}/lib/marker.js`, `module.exports = '${marker}';`);
    await write(`themes/${theme.themeDir}/scripts/theme.js`, `
      const marker = require('../lib/marker');
      hexo.extend.helper.register('theme_marker', () => marker);
      hexo.extend.filter.register('after_post_render', data => {
        data.content += '[${marker}]';
        return data;
      });
      hexo.extend.generator.register('fixture', () => [
        { path: 'index.html', layout: 'index', data: {} },
        { path: '${marker}-only/index.html', layout: 'index', data: {} }
      ]);
    `);
  }
  await write('_config.fluid.yml', 'marker: custom-beta\nsitePriority: override\nbetaOnly: true\n');

  const original = new Hexo(base, { silent: true });
  const live = getLiveHexo(original);
  let server;
  t.after(async () => {
    const watchers = [live.source.watcher, live.theme.watcher].filter(Boolean);
    original.unwatch();
    await Promise.all(watchers.map(watcher => watcher.close()));
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await fs.rm(base, { recursive: true, force: true });
  });
  await original.init();
  await original.call('generate', { force: true, bail: true });
  if (watch) await original.watch();
  // Like hexo-server, the HTTP middleware holds the original route object.
  const route = original.route;
  server = http.createServer((req, res) => {
    const stream = route.get(route.format(req.url));
    if (!stream) {
      res.writeHead(404).end();
      return;
    }
    stream.on('error', error => res.destroy(error));
    stream.pipe(res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const page = async () => (await fetch(url)).json();
  return { base, live, original, write, page, url };
}

test('switches a running server repeatedly with fresh templates, filters, config and output', async t => {
  const { base, live, original, page, url } = await fixture(t);
  assert.equal((await page()).helper, 'alpha');
  // Persist the old rendered post to verify it cannot leak through db.json.
  await original.database.save();

  const result = await switchTheme(live, themes.beta);
  assert.equal(result.needRestart, false);
  const beta = await page();
  assert.equal(beta.template, 'beta');
  assert.equal(beta.helper, 'beta');
  assert.equal(beta.theme.marker, 'custom-beta');
  assert.equal(beta.theme.sitePriority, 'site');
  assert.equal(beta.theme.alphaOnly, undefined);
  assert.deepEqual(beta.posts, ['<p>Hello world</p>[beta]']);
  assert.equal((await fetch(url + '/alpha-only/')).status, 404);
  assert.equal((await fetch(url + '/beta-only/')).status, 200);
  assert.equal(live.config.theme, 'fluid');
  assert.equal(live.model('Post').toArray()[0].content, beta.posts[0]);
  await assert.rejects(fs.access(path.join(base, 'public/alpha.css')));
  assert.equal(JSON.parse(await fs.readFile(path.join(base, 'public/index.html'), 'utf8')).template, 'beta');

  await switchTheme(live, themes.alpha);
  const alpha = await page();
  assert.equal(alpha.template, 'alpha');
  assert.deepEqual(alpha.posts, ['<p>Hello world</p>[alpha]']);
  assert.equal(alpha.theme.betaOnly, undefined);
  assert.equal((await fetch(url + '/beta-only/')).status, 404);
  // Existing callers of the original instance must use the active runtime too.
  await original.call('generate', { force: true, bail: true });
  assert.equal(JSON.parse(await fs.readFile(path.join(base, 'public/index.html'), 'utf8')).template, 'alpha');
});

test('rolls back a rendering failure and remains able to switch again', async t => {
  const { base, live, write, page } = await fixture(t, { watch: true });
  const configBefore = await fs.readFile(path.join(base, '_config.yml'), 'utf8');
  await fs.rm(path.join(base, '_config.fluid.yml'));
  await write('themes/fluid/layout/index.fixture', 'BROKEN_TEMPLATE');
  await assert.rejects(switchTheme(live, themes.beta), /Broken template/);
  assert.equal(await fs.readFile(path.join(base, '_config.yml'), 'utf8'), configBefore);
  await assert.rejects(fs.access(path.join(base, '_config.fluid.yml')));
  assert.equal(live.config.theme, 'next');
  assert.equal((await page()).helper, 'alpha');
  assert.equal(live.source.isWatching(), true);
  assert.equal(JSON.parse(await fs.readFile(path.join(base, 'public/index.html'), 'utf8')).template, 'alpha');
  assert.deepEqual((await fs.readdir(base)).filter(name => name.startsWith('.hexo-pro-theme-')), []);

  await write('themes/fluid/layout/index.fixture', 'beta-fixed');
  assert.equal((await switchTheme(live, themes.beta)).configCopied, true);
  assert.equal((await page()).template, 'beta-fixed');
});

test('keeps watching the new theme and stops the old theme watcher', async t => {
  const { live, original, write, page } = await fixture(t, { watch: true });
  const oldTheme = live.theme;
  await switchTheme(live, themes.beta);
  assert.equal(oldTheme.isWatching(), false);
  assert.equal(live.source.isWatching(), true);
  assert.equal(live.theme.isWatching(), true);
  const generated = once(live, 'generateAfter');
  await write('themes/fluid/layout/index.fixture', 'beta-edited');
  await Promise.race([
    generated,
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('New theme was not watched')), 5000);
      timeout.unref();
      generated.finally(() => clearTimeout(timeout));
    }),
  ]);
  assert.equal((await page()).template, 'beta-edited');
  original.unwatch();
  assert.equal(live.theme.isWatching(), false);
});

test('activates a theme already saved on disk and rejects concurrent switches', async t => {
  const { base, live, write, page } = await fixture(t);
  const config = yaml.load(await fs.readFile(path.join(base, '_config.yml'), 'utf8'));
  config.theme = 'fluid';
  await write('_config.yml', yaml.dump(config));
  // Reproduce the old API's misleading in-memory theme name.
  live.config.theme = 'fluid';
  const switching = switchTheme(live, themes.beta);
  await assert.rejects(switchTheme(live, themes.alpha), error => error.statusCode === 409);
  await switching;
  assert.equal((await page()).helper, 'beta');
  assert.equal((await switchTheme(live, themes.beta)).message, '已经是当前主题');
});

test('reloads nested theme modules when switching back and rejects incomplete installations', async t => {
  const { base, live, write, page } = await fixture(t);
  await switchTheme(live, themes.beta);
  await write('themes/next/lib/marker.js', "module.exports = 'alpha-reloaded';");
  await switchTheme(live, themes.alpha);
  assert.equal((await page()).helper, 'alpha-reloaded');
  await fs.rm(path.join(base, 'themes/fluid/layout'), { recursive: true });
  await assert.rejects(switchTheme(live, themes.beta), /没有可用的页面模板/);
  assert.equal(live.config.theme, 'next');
  assert.equal((await page()).helper, 'alpha-reloaded');
});

test('theme API reports the active theme and rejects unsupported methods and missing themes', async t => {
  const { live, page } = await fixture(t);
  const handlers = {};
  registerThemeApi(null, live, (name, handler) => { handlers[name] = handler; });
  const request = async (name, req) => {
    let response;
    await handlers[name](req, {
      done: data => { response = { status: 200, data }; },
      send: (status, message) => { response = { status, message }; },
    });
    return response;
  };
  assert.equal((await request('theme/switch', { method: 'GET' })).status, 405);
  assert.equal((await request('theme/switch', { method: 'POST', body: { themeId: 'butterfly' } })).status, 400);
  const switched = await request('theme/switch', { method: 'POST', body: { themeId: 'fluid' } });
  assert.equal(switched.status, 200);
  assert.equal(switched.data.needRestart, false);
  assert.equal((await page()).helper, 'beta');
  assert.equal((await request('theme/current', {})).data.name, 'fluid');
  assert.equal((await request('theme/installed', { query: { themeId: 'fluid' } })).data.isCurrent, true);
  assert.equal((await request('theme/installed', { query: { themeId: 'next' } })).data.isCurrent, false);
});

test('local themes have configuration, bundled schemas, snapshots and hot updates', async t => {
  const {base, live, write, page} = await fixture(t);
  await fs.cp(path.join(base, 'themes/next'), path.join(base, 'themes/cabinet'), {recursive:true});
  await write('themes/cabinet/package.json', JSON.stringify({displayName:'Cabinet',description:'Local theme'}));
  await write('themes/cabinet/_config.yml', 'marker: cabinet\nsitePriority: theme\nappearance:\n  accent: blue\n  toggle: true\n');
  await write('themes/cabinet/_config.schema.json', JSON.stringify({appearance:{label:'外观'}}));
  const handlers = {};
  registerThemeApi(null, live, (name, handler) => { handlers[name] = handler; });
  const request = (name, data = {}, method = 'GET') => new Promise((resolve, reject) => {
    Promise.resolve(handlers[name]({method, query:data, body:data}, {
      done: data => resolve({status:200, data}),
      send: (status, message) => resolve({status, message}),
    })).catch(reject);
  });
  const local = (await request('theme/list')).data.find(item => item.id === 'cabinet');
  assert.equal(local.local, true);
  assert.equal(local.name, 'Cabinet');
  assert.equal((await request('theme/installed', {themeId:'cabinet'})).data.installed, true);
  assert.match((await request('theme/config', {themeId:'cabinet'})).data.content, /marker: cabinet/);
  assert.equal((await request('theme/schema', {themeId:'cabinet'})).data.schema.appearance.label, '外观');
  await write('_config.cabinet.schema.json', JSON.stringify({appearance:{label:'自定义外观'}}));
  assert.equal((await request('theme/schema', {themeId:'cabinet'})).data.schema.appearance.label, '自定义外观');
  assert.equal((await request('theme/install', {themeId:'cabinet'}, 'POST')).status, 404);
  assert.equal((await request('theme/switch', {themeId:'cabinet'}, 'POST')).status, 200);
  assert.equal((await request('theme/current')).data.themeInfo.name, 'Cabinet');
  assert.equal((await request('theme/current')).data.builtin, false);
  const save = async content => {
    const generated = once(live, 'generateAfter', {signal:AbortSignal.timeout(5000)});
    const response = await request('theme/config/save', {themeId:'cabinet',content}, 'POST');
    assert.equal(response.status, 200);
    await generated;
    return response;
  };
  await save('marker: edited\nsitePriority: override\nappearance:\n  toggle: false\ntemporary: present\n');
  let output = await page();
  assert.equal(output.theme.marker, 'edited');
  assert.equal(output.theme.appearance.accent, 'blue');
  assert.equal(output.theme.appearance.toggle, false);
  assert.equal(output.theme.sitePriority, 'site');
  await save('appearance:\n  accent: red\n');
  output = await page();
  assert.equal(output.theme.marker, 'cabinet');
  assert.equal(output.theme.temporary, undefined);
  assert.equal(output.theme.appearance.toggle, true);
  assert.equal(output.theme.appearance.accent, 'red');
  const snapshots = (await request('theme/config/snapshots', {themeId:'cabinet'})).data.snapshots;
  assert.ok(snapshots.length >= 2);
  assert.match(await fs.readFile(path.join(base, '_config.cabinet.yml'), 'utf8'), /accent: red/);
  assert.match(await fs.readFile(path.join(base, 'themes/cabinet/_config.yml'), 'utf8'), /accent: blue/);
  for (const themeId of ['../cabinet', '../../_config', '/tmp/theme', '..']) {
    assert.equal((await request('theme/config', {themeId})).status, 404);
    assert.equal((await request('theme/schema', {themeId})).status, 404);
    assert.equal((await request('theme/config/save', {themeId,content:'a: b'}, 'POST')).status, 404);
  }
});
