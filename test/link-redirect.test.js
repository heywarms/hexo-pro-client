const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../client/src/utils/desktopUtils.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function setup({ desktop = true, href = 'http://127.0.0.1:4512/pro/settings?tab=link', stored = {} } = {}) {
  const values = new Map(Object.entries(stored));
  const opened = [];
  const events = [];
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const window = {
    location: new URL(href), isHexoProDesktop: desktop,
    open: (...args) => opened.push(args),
    dispatchEvent: event => events.push(event),
    ...(desktop ? { electronAPI: { openExternal: url => opened.push([url]) } } : {}),
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, window, localStorage, URL,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  return { utils: module.exports, values, opened, events, window };
}

test('desktop defaults use the running server port instead of a fixed 4000', () => {
  const { utils } = setup();
  assert.equal(utils.getCurrentBlogUrl(), 'http://127.0.0.1:4512');
  assert.equal(utils.getLinkRedirectSettings().domain, 'http://127.0.0.1:4512');
  assert.equal(utils.getLinkRedirectSettings().enabled, true);
  assert.equal(utils.convertDesktopLink('https://live.example/2026/hello/?q=1#part'), 'http://127.0.0.1:4512/2026/hello/?q=1#part');
});

test('explicitly disabling redirects is respected on desktop and web', () => {
  for (const desktop of [true, false]) {
    const { utils } = setup({ desktop, stored: { hexoProLinkRedirectEnabled: 'false', hexoProCustomDomain: 'http://localhost:4001' } });
    assert.equal(utils.shouldConvertLink(), false);
    assert.equal(utils.convertDesktopLink('https://live.example/post/'), 'https://live.example/post/');
    assert.equal(utils.convertDesktopLink('/'), 'http://127.0.0.1:4512/');
  }
  assert.equal(setup({ desktop: false }).utils.getLinkRedirectSettings().enabled, false);
});

test('accepts HTTP blog home addresses and rejects invalid protocols and admin links', () => {
  const { utils } = setup();
  assert.equal(utils.normalizeBlogUrl('  https://BLOG.example/blog/  '), 'https://blog.example/blog');
  assert.equal(utils.normalizeBlogUrl('http://localhost:4512'), 'http://localhost:4512');
  assert.equal(utils.normalizeBlogUrl('http://[::1]:4512/'), 'http://[::1]:4512');
  for (const value of ['', 'blog.example', 'http:/blog.example', 'javascript:alert(1)', 'file:///tmp/blog', 'ftp://blog.example', 'https://user:pass@blog.example', 'https://blog.example?q=1', 'https://blog.example/#part']) {
    assert.equal(utils.getBlogUrlError(value), 'format', value);
  }
  for (const value of ['http://localhost:4512/pro', 'https://blog.example/pro/settings', 'https://blog.example/hexopro/api', 'https://blog.example/blog/pro/']) {
    assert.equal(utils.getBlogUrlError(value), 'admin', value);
  }
});

test('invalid edits never overwrite the last saved address', () => {
  const { utils, values, events } = setup();
  utils.updateLinkRedirectSettings(true, 'https://live.example');
  assert.throws(() => utils.updateLinkRedirectSettings(true, 'wrong address'));
  assert.equal(values.get('hexoProCustomDomain'), 'https://live.example');
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.domain, 'https://live.example');
});

test('custom addresses work for the home and article paths, including subdirectories', () => {
  const { utils } = setup();
  utils.updateLinkRedirectSettings(true, 'https://live.example/blog');
  assert.equal(utils.convertDesktopLink('/'), 'https://live.example/blog/');
  assert.equal(utils.convertDesktopLink('https://old.example/2026/post/?q=1#part'), 'https://live.example/blog/2026/post/?q=1#part');
  assert.equal(utils.convertDesktopLink('/blog/2026/post/'), 'https://live.example/blog/2026/post/');
  assert.equal(utils.convertDesktopLink('2026/post/'), 'https://live.example/blog/2026/post/');
  assert.equal(utils.convertDesktopLink('//old.example/2026/post/'), 'https://live.example/blog/2026/post/');
});

test('current blog detection keeps a server subdirectory and ignores settings query parameters', () => {
  const { utils } = setup({ href: 'https://server.example/blog/pro/settings?tab=link#help' });
  assert.equal(utils.getCurrentBlogUrl(), 'https://server.example/blog');
  assert.equal(utils.convertDesktopLink('/'), 'https://server.example/blog/');
  assert.equal(utils.convertDesktopLink('/blog/post/'), 'https://server.example/blog/post/');
});

test('the displayed target and the actual desktop or browser destination match', () => {
  for (const desktop of [true, false]) {
    const { utils, opened } = setup({ desktop });
    utils.updateLinkRedirectSettings(true, 'https://live.example/blog');
    const preview = utils.convertDesktopLink('/');
    utils.openDesktopLink('/');
    assert.equal(opened[0][0], preview);
    utils.openDesktopLink('javascript:alert(1)');
    assert.equal(opened.length, 1);
    if (!desktop) assert.equal(opened[0][2], 'noopener,noreferrer');
  }
});

test('recognizes local addresses without treating online sites as localhost', () => {
  const { utils } = setup();
  for (const url of ['http://localhost:4001', 'http://127.0.0.1:4512', 'http://[::1]:4512', 'http://blog.localhost']) assert.equal(utils.isLocalBlogUrl(url), true);
  for (const url of ['https://localhost.example', 'https://blog.example', 'invalid']) assert.equal(utils.isLocalBlogUrl(url), false);
});
