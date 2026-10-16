const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { BundledRuntime } = require('../hexo-pro-desktop/src/main/bundled-runtime');
const { createProject, prepareProject } = require('../hexo-pro-desktop/src/main/project-setup');
const HexoServerProcess = require('../hexo-pro-desktop/src/main/hexo-server-process');
const { resolveTool } = require('../hexo-pro/process-tools');

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro runtime 空格 '));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('bundled runtime requires shipped files and cannot fall back to a system installation', async t => {
  const directory = await temporary(t);
  const runtime = new BundledRuntime({ resourcesPath: directory, userDataPath: directory });
  assert.throws(() => runtime.assertReady(), /内置组件不完整/);
  assert.throws(() => runtime.run('node', ['--version']), /内置组件不完整/);
});

test('desktop command environment prefers private tools, isolates npm configuration, and preserves network settings', () => {
  for (const [platform, arch] of [['darwin', 'arm64'], ['linux', 'x64'], ['win32', 'x64'], ['win32', 'ia32']]) {
    const runtime = new BundledRuntime({ resourcesPath: '/app 中文', userDataPath: '/data', platform, arch });
    const original = { Path: '/host-tools', NODE_PATH: '/bad', NODE_OPTIONS: '--require=bad', ELECTRON_RUN_AS_NODE: '1', npm_config_prefix: '/global', HTTPS_PROXY: 'https://proxy.test' };
    const env = runtime.environment(original, '/blog 空格');
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.NODE_PATH, undefined);
    assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
    assert.equal(env.npm_config_prefix, undefined);
    assert.equal(env.Path, undefined);
    assert.equal(env.PATH.split(platform === 'win32' ? ';' : ':')[0], runtime.nodeDir);
    assert.equal(env.HTTPS_PROXY, original.HTTPS_PROXY);
    assert.equal(env.HEXOPRO_GIT_PATH, runtime.gitPath);
    assert.equal(env.NPM_CONFIG_CACHE, path.join('/data', 'npm-cache'));
    assert.deepEqual(resolveTool('npm', ['install', 'a b'], env), { command: runtime.nodePath, args: [runtime.npmPath, 'install', 'a b'] });
    assert.equal(resolveTool('git', [], env).command, runtime.gitPath);
    assert.equal(original.NODE_OPTIONS, '--require=bad');
  }
  assert.throws(() => resolveTool('git', [], { HEXOPRO_MANAGED_RUNTIME: '1' }), /内置组件不可用/);
  assert.deepEqual(resolveTool('git', ['status'], {}), { command: 'git', args: ['status'] });
});

async function fixtureTemplate(t) {
  const directory = await temporary(t);
  const templatePath = path.join(directory, 'template');
  await fs.mkdir(path.join(templatePath, 'node_modules', 'hexo'), { recursive: true });
  await fs.mkdir(path.join(templatePath, 'source', '_posts'), { recursive: true });
  await fs.writeFile(path.join(templatePath, '_config.yml'), 'title: Default\nurl: https://example.com\n');
  await fs.writeFile(path.join(templatePath, 'package.json'), JSON.stringify({ dependencies: { hexo: '8.1.2' } }));
  await fs.writeFile(path.join(templatePath, 'node_modules', 'hexo', 'package.json'), '{"version":"8.1.2"}');
  await fs.writeFile(path.join(templatePath, 'source', '_posts', 'hello.md'), 'original article');
  const calls = [];
  const runtime = { templatePath, platform: 'linux', arch: 'x64', assertReady: () => ({ node: '22.23.3' }), run: async (...args) => { calls.push(args); } };
  return { directory, runtime, calls };
}

test('new blogs are created offline, preserve titles, and reopen without dependency installation', async t => {
  const { directory, runtime, calls } = await fixtureTemplate(t);
  const project = path.join(directory, 'blog 中文');
  await createProject(project, '我的博客: "你好"', runtime);
  assert.match(await fs.readFile(path.join(project, '_config.yml'), 'utf8'), /我的博客/);
  await prepareProject(project, runtime);
  assert.deepEqual(calls, []);
  await assert.rejects(createProject(project, 'replace', runtime), /已存在/);
  assert.equal(await fs.readFile(path.join(project, 'source', '_posts', 'hello.md'), 'utf8'), 'original article');
});

test('imports install and rebuild once with the bundled environment and retain content on failure', async t => {
  const { directory, runtime, calls } = await fixtureTemplate(t);
  const project = path.join(directory, 'blog');
  await createProject(project, 'Test', runtime);
  await fs.rm(path.join(project, '.hexo-pro', 'desktop-runtime.json'));
  await Promise.all([prepareProject(project, runtime), prepareProject(project, runtime)]);
  assert.deepEqual(calls.map(call => [call[0], call[1][0]]), [['npm', 'install'], ['npm', 'rebuild']]);
  await prepareProject(project, runtime);
  assert.equal(calls.length, 2);
  await fs.writeFile(path.join(project, 'package-lock.json'), '{}');
  runtime.run = async () => { throw new Error('offline'); };
  await assert.rejects(prepareProject(project, runtime), /offline/);
  assert.equal(await fs.readFile(path.join(project, 'source', '_posts', 'hello.md'), 'utf8'), 'original article');
});

test('the blog worker uses the shipped Node executable and rejects pending work when it exits', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.send = message => {
    if (message.method === 'start') queueMicrotask(() => child.emit('message', { id: message.id, result: { url: 'http://127.0.0.1:4567', port: 4567 }, info: { url: 'http://127.0.0.1:4567', port: 4567 } }));
  };
  let launch;
  const runtime = { nodePath: '/private/node', assertReady() {}, environment: () => ({ PATH: '/private' }) };
  const server = new HexoServerProcess('/blog', runtime, { fork: (...args) => { launch = args; return child; } });
  await server.start();
  assert.equal(launch[2].execPath, '/private/node');
  assert.deepEqual(launch[2].execArgv, []);
  assert.equal(server.getPort(), 4567);
  const pending = server.generate();
  child.emit('exit', 1);
  await assert.rejects(pending, /博客服务已停止/);
  assert.equal(server.child, null);
});

test('a failed blog startup terminates its worker before a fresh retry', async () => {
  let launches = 0;
  let exits = 0;
  const runtime = { nodePath: '/private/node', assertReady() {}, environment: () => ({}) };
  const server = new HexoServerProcess('/blog', runtime, { fork: () => {
    const attempt = ++launches;
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { exits++; queueMicrotask(() => child.emit('exit', 0)); };
    child.send = ({ id }) => queueMicrotask(() => child.emit('message', attempt === 1
      ? { id, error: { message: 'Plugin could not load' } }
      : { id, result: { port: 4567 }, info: { port: 4567 } }));
    return child;
  } });
  await assert.rejects(server.start(), /Plugin could not load/);
  assert.equal(exits, 1);
  assert.equal(server.child, null);
  assert.equal((await server.start()).port, 4567);
  assert.equal(launches, 2);
  await server.forceStop();
});
