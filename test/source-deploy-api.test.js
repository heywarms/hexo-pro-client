const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { test } = require('node:test');
const exec = promisify(execFile);

for (const scenario of [
  { name: 'GitHub source deployment', skipGenerate: true, targets: ['github'] },
  { name: 'GitHub sources alongside static hosting', skipGenerate: true, targets: ['github', 'edgeone-pages'] },
  { name: 'static GitHub deployment', skipGenerate: false, targets: ['github'] },
  { name: 'first publication to an empty repository without global Git identity', skipGenerate: false, targets: ['github'], empty: true },
]) test(`${scenario.name} pushes the correct files through the real deployment API`, { timeout: 15000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro-deploy-api-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = path.join(root, 'blog');
  const remote = path.join(root, 'remote.git');
  await fs.mkdir(base);
  const git = args => exec('git', args, { cwd: base });
  const write = async (file, content) => {
    await fs.mkdir(path.dirname(path.join(base, file)), { recursive: true });
    await fs.writeFile(path.join(base, file), content);
  };
  await git(['init', '--bare', '--initial-branch=main', remote]);
  await git(['init', '--initial-branch=main']);
  await git(['config', 'user.name', 'Hexo Pro Test']);
  await git(['config', 'user.email', 'test@example.invalid']);
  await write('README.md', 'Source repository');
  await git(['add', '.']);
  await git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'Initialize']);
  await git(['remote', 'add', 'origin', remote]);
  if (!scenario.empty) await git(['push', 'origin', 'main']);
  const raw = '---\r\ntitle: Keep\r\nplugin: value\r\n---\r\nBody';
  const identity = '{"version":1,"documents":[]}\n';
  await write('source/_posts/post.md', raw);
  await write('.hexo-pro/document-identities.json', identity);
  await write('.hexo-pro/runtime.json', 'private-runtime');
  await write('.github/workflows/build.yml', 'name: build');
  await write('_config.custom.yml', 'theme: custom');
  await write('_config.yml', 'title: Blog\ntheme: custom\n');
  await write('.gitignore', '.hexo-pro/\n');
  await write('public/index.html', '<html>Static site</html>');
  await write('deploy_config.json', JSON.stringify({ repository: 'example/blog', branch: 'main',
    message: 'Source update', token: 'test-only-credential',
    edgeone: { projectName: 'test-project', apiToken: 'test-only-edgeone' } }));

  const commands = [];
  // Only Git runs, exclusively against temporary local repositories. Hosting/build commands are stubs.
  function localSpawn(command, args, options) {
    commands.push([command, ...args]);
    if (command === 'git') {
      const safeArgs = args.map(arg => /^https:\/\//.test(arg) ? remote : arg);
      if (safeArgs[0] === 'commit') {
        safeArgs.splice(0, 0, '-c', 'commit.gpgsign=false');
        const i = safeArgs.indexOf('-m') + 1;
        safeArgs[i] = safeArgs[i].replace(/^"|"$/g, '');
      }
      const cleanGitEnv = { ...process.env, GIT_CONFIG_GLOBAL: path.join(root, 'no-global-config'), GIT_CONFIG_NOSYSTEM: '1' };
      for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) delete cleanGitEnv[key];
      return spawn(command, safeArgs, { ...options, shell: false, env: cleanGitEnv });
    }
    assert.equal(command, 'npx');
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  }
  const filename = path.resolve('hexo-pro/deploy_api.js');
  const load = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(await fs.readFile(filename, 'utf8'), { module, exports: module.exports,
    require: name => name === 'child_process' ? { spawn: localSpawn, exec: () => assert.fail('unexpected command') } : load(name),
    console: { log() {}, error() {} }, process, setTimeout, clearTimeout }, { filename });
  const routes = new Map();
  const status = { isDeploying: false, logs: [] };
  let completed;
  const completion = new Promise(resolve => { completed = resolve; });
  const deployStatusDb = {
    findOne: (_, callback) => callback(null, { ...status }),
    update: (_, operation, options, callback) => {
      Object.assign(status, operation.$set);
      if (callback) callback(null, 1);
      if (['completed', 'failed'].includes(status.stage)) completed();
    },
  };
  module.exports({}, { base_dir: base, config: { public_dir: 'public' } },
    (name, handler) => routes.set(name, handler), { deployStatusDb });
  routes.get('deploy/save-config')({ method: 'POST', body: { message: 'Source update', edgeone: { projectName: 'test-project' } } },
    { done: value => assert.equal(value.token, '******'), send: (code, message) => assert.fail(`${code}: ${message}`) }, () => assert.fail('unexpected fallthrough'));
  assert.equal(JSON.parse(await fs.readFile(path.join(base, 'deploy_config.json'))).token, 'test-only-credential');
  routes.get('deploy/execute')({ method: 'POST', body: { skipGenerate: scenario.skipGenerate, deployTargets: scenario.targets,
    config: { repository: 'example/blog', branch: 'main', message: 'Source update', edgeone: { projectName: 'test-project' } } } },
    { done() {}, send: (code, message) => assert.fail(`${code}: ${message}`) }, () => assert.fail('unexpected route fallthrough'));
  await completion;
  assert.equal(status.stage, 'completed', status.error);
  assert.equal(JSON.parse(await fs.readFile(path.join(base, 'deploy_config.json'))).token, 'test-only-credential');
  assert.ok(commands.some(args => args.some(arg => typeof arg === 'string' && arg.includes('x-access-token:test-only-credential@github.com'))), 'Git must receive the saved credential despite a partial form submission');
  assert.ok(!status.logs.join('\n').includes('test-only-credential'), 'deployment logs must mask credentials');
  assert.ok(!status.logs.join('\n').includes('test-only-edgeone'), 'hosting logs must mask credentials');
  const { stdout } = await git(['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main']);
  const files = stdout.trim().split('\n');
  if (scenario.skipGenerate) {
    for (const file of ['.hexo-pro/document-identities.json', '.github/workflows/build.yml', '_config.custom.yml', 'source/_posts/post.md']) assert.ok(files.includes(file), file);
    assert.ok(!files.includes('public/index.html'));
    assert.equal((await git(['--git-dir', remote, 'show', 'main:.hexo-pro/document-identities.json'])).stdout, identity);
    assert.equal((await git(['--git-dir', remote, 'show', 'main:source/_posts/post.md'])).stdout, raw);
  } else assert.deepEqual(files, ['index.html']);
  assert.ok(!files.includes('.hexo-pro/runtime.json'));
  assert.ok(!files.includes('deploy_config.json'));
  assert.equal((await git(['remote', 'get-url', 'origin'])).stdout.trim(), remote);
  assert.equal(await fs.readFile(path.join(base, 'source/_posts/post.md'), 'utf8'), raw);
  assert.equal(commands.some(args => args[0] === 'npx' && args[2] === 'generate'), !scenario.skipGenerate || scenario.targets.length > 1);
});
