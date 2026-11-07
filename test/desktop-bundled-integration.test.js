const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { BundledRuntime } = require('../hexo-pro-desktop/src/main/bundled-runtime');
const { createProject, prepareProject } = require('../hexo-pro-desktop/src/main/project-setup');
const HexoServerProcess = require('../hexo-pro-desktop/src/main/hexo-server-process');
const { pathToFileURL } = require('node:url');

test('shipped runtime creates, previews, imports and publishes a blog without host Node/npm/Git', {
  skip: process.env.HEXOPRO_RUNTIME_INTEGRATION !== '1', timeout: 120000
}, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro bundled 中文 '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = new BundledRuntime({
    resourcesPath: process.env.HEXOPRO_BUNDLED_RESOURCES || path.resolve(__dirname, '../hexo-pro-desktop/resources'),
    userDataPath: path.join(root, 'private-data')
  });
  const environment = runtime.environment.bind(runtime);
  runtime.environment = (base, project) => environment({
    ...base, PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin',
    HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', NO_PROXY: 'localhost,127.0.0.1'
  }, project);
  assert.match((await runtime.run('node', ['-p', 'process.execPath'])).stdout, /runtime/);
  assert.match((await runtime.run('npm', ['--version'])).stdout, /10\.9\.9/);
  assert.match((await runtime.run('git', ['--version'])).stdout, /2\.53\.0/);
  const project = path.join(root, '我的博客 with spaces');
  await createProject(project, '离线博客', runtime);
  const run = runtime.run.bind(runtime);
  runtime.run = () => assert.fail('Creating and reopening a built-in blog must not install anything');
  await prepareProject(project, runtime);
  runtime.run = run;

  const server = new HexoServerProcess(project, runtime, { workerPath: process.env.HEXOPRO_WORKER_PATH });
  t.after(() => server.forceStop());
  const info = await server.start();
  assert.equal((await fetch(`${info.url}/hexopro/api/desktop/status`)).status, 200);
  const response = await fetch(info.url);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /离线博客/);
  assert.match(html, /你好，世界/);
  assert.doesNotMatch(html, /(?:src|href)=["']https:\/\/cdn\./);
  await server.generate();
  assert.match(await fs.readFile(path.join(project, 'public', 'index.html'), 'utf8'), /你好，世界/);
  await server.stop();

  // Exercise the actual theme-install route, mapping its public URL to a local
  // repository so the smoke test never depends on GitHub or changes a real site.
  const themeSource = path.join(root, 'theme source');
  await fs.mkdir(themeSource);
  await fs.writeFile(path.join(themeSource, '_config.yml'), 'offline_test: true\n');
  await run('git', ['init', '-b', 'master'], { cwd: themeSource });
  await run('git', ['add', '.'], { cwd: themeSource });
  await run('git', ['-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.test', 'commit', '-m', 'Theme'], { cwd: themeSource });
  const previousEnv = { ...process.env };
  const themeEnv = runtime.environment(process.env, project);
  themeEnv.GIT_CONFIG_COUNT = '1';
  themeEnv.GIT_CONFIG_KEY_0 = `url.${pathToFileURL(themeSource).href}.insteadOf`;
  themeEnv.GIT_CONFIG_VALUE_0 = 'https://github.com/fluid-dev/hexo-theme-fluid.git';
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, themeEnv);
    const corePath = process.env.HEXOPRO_WORKER_PATH
      ? path.join(path.dirname(process.env.HEXOPRO_WORKER_PATH), 'hexo-pro-core', 'theme_api.js')
      : path.resolve(__dirname, '../hexo-pro-desktop/src/main/hexo-pro-core/theme_api.js');
    const routes = new Map();
    const fakeHexo = { base_dir: project, config: {}, log: { info() {}, error() {} }, call() {}, load() {}, watch() {}, unwatch() {}, exit() {} };
    require(corePath)(null, fakeHexo, (route, handler) => routes.set(route, handler));
    const result = await new Promise((resolve, reject) => routes.get('theme/install')({ method: 'POST', body: { themeId: 'fluid' } }, {
      done: resolve, send: (code, message) => reject(new Error(`${code}: ${message}`))
    }));
    assert.equal(result.success, true);
    assert.match(await fs.readFile(path.join(project, '_config.fluid.yml'), 'utf8'), /offline_test/);
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }

  // Reimport an ordinary existing project using the shipped npm. Offline makes
  // an accidental download fail rather than passing on the developer's network.
  await fs.rm(path.join(project, '.hexo-pro', 'desktop-runtime.json'));
  const calls = [];
  runtime.run = (tool, args, options) => { calls.push(args[0]); return run(tool, [...args, '--offline', '--omit=optional'], options); };
  await prepareProject(project, runtime);
  assert.deepEqual(calls, ['install', 'rebuild']);
  runtime.run = run;
  assert.match(await fs.readFile(path.join(project, 'source', '_posts', 'hello-world.md'), 'utf8'), /你好，世界/);

  const bare = path.join(root, 'published.git');
  await run('git', ['init', '--bare', bare]);
  const output = path.join(project, 'public');
  await run('git', ['init', '-b', 'main'], { cwd: output });
  await run('git', ['add', '.'], { cwd: output });
  await run('git', ['-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.test', 'commit', '-m', 'First post'], { cwd: output });
  await run('git', ['push', bare, 'main'], { cwd: output });
  assert.match((await run('git', ['--git-dir', bare, 'show', 'main:index.html'])).stdout, /你好，世界/);
});
