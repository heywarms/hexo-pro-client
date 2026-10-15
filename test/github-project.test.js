const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { queryGitHub, validateConnection, importGitHubProject } = require('../hexo-pro-desktop/src/main/github-project');
const { runCommandDefault } = require('../hexo-pro/sync_service');

const config = { repository: 'test/blog', branch: 'writing/posts', githubToken: 'fixture-token-only' };
const response = (data, next = false) => ({ ok: true, json: async () => data, headers: { get: () => next ? '<https://api.github.com/user/repos?page=2>; rel="next"' : null } });

test('repository picker preserves private repos, pagination, and non-main default branches', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/user/repos')) return response([{ full_name: 'test/blog', default_branch: 'writing/posts', private: true }], true);
    if (url.endsWith('/test/blog')) return response({ default_branch: 'writing/posts' });
    return response([{ name: 'writing/posts' }, { name: 'gh-pages' }], true);
  };
  const repos = await queryGitHub({ action: 'repositories', githubToken: config.githubToken }, fetch);
  assert.deepEqual(repos, { items: [{ name: 'test/blog', defaultBranch: 'writing/posts', private: true }], nextPage: 2 });
  await queryGitHub({ action: 'repositories', githubToken: config.githubToken, page: 2 }, fetch);
  assert.match(calls[1].url, /page=2$/);
  const branches = await queryGitHub({ ...config, action: 'branches' }, fetch);
  assert.equal(branches.defaultBranch, 'writing/posts');
  assert.equal(branches.nextPage, 2);
  assert.deepEqual(branches.items.map(item => item.name), ['writing/posts', 'gh-pages']);
  assert.ok(calls.every(call => call.url.startsWith('https://api.github.com/')));
  assert.ok(calls.every(call => !call.url.includes(config.githubToken)));
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${config.githubToken}`);
});

test('picker rejects invalid credentials and arbitrary hosts without exposing secrets', async () => {
  assert.throws(() => validateConnection({ ...config, repository: 'https://evil.invalid/repo' }), /源码仓库/);
  assert.throws(() => validateConnection({ ...config, branch: '--upload-pack=bad' }), /分支/);
  await assert.rejects(queryGitHub({ ...config, action: 'repositories' }, async () => { throw new Error(config.githubToken); }), error => !error.message.includes(config.githubToken));
  for (const status of [401, 403, 404]) {
    await assert.rejects(queryGitHub({ ...config, action: 'repositories' }, async () => ({ ok: false, status })), /凭据|授权|权限/);
  }
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro-import-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'remote.git'), writer = path.join(root, 'writer'), target = path.join(root, 'imported');
  const git = (cwd, args) => runCommandDefault('git', args, { cwd });
  await git(root, ['init', '--bare', repo]);
  await fs.mkdir(writer);
  await git(writer, ['init', '--initial-branch', config.branch]);
  await fs.mkdir(path.join(writer, 'source/_posts'), { recursive: true });
  await fs.writeFile(path.join(writer, 'source/_posts/remote.md'), '---\r\ntitle: Remote\r\n---\r\nExact source');
  await fs.writeFile(path.join(writer, '_config.yml'), 'title: Restored\ntheme: landscape\n');
  await fs.writeFile(path.join(writer, 'package.json'), JSON.stringify({ dependencies: { hexo: '^8.0.0' } }));
  await git(writer, ['add', '.']);
  await git(writer, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Initial blog']);
  await git(writer, ['push', repo, `HEAD:refs/heads/${config.branch}`]);
  const calls = [];
  const runCommand = (command, args, options) => {
    calls.push(args);
    return runCommandDefault(command, args.map(arg => arg === 'https://github.com/test/blog.git' ? repo : arg), options);
  };
  return { root, target, repo, git, calls, cloudOptions: { runCommand } };
}

test('imports a GitHub source branch directly, persists sync setup, and makes no remote commit', async t => {
  const f = await fixture(t);
  const head = await f.git(f.root, ['--git-dir', f.repo, 'rev-parse', config.branch]);
  const result = await importGitHubProject(f.target, config, { cloudOptions: f.cloudOptions });
  assert.equal(result.uploaded, 0);
  assert.equal(await fs.readFile(path.join(f.target, 'source/_posts/remote.md'), 'utf8'), '---\r\ntitle: Remote\r\n---\r\nExact source');
  await assert.rejects(fs.access(path.join(f.target, 'source/_posts/hello-world.md')));
  const saved = JSON.parse(await fs.readFile(path.join(f.target, 'sync_config.json')));
  assert.equal(saved.branch, config.branch);
  assert.equal(saved.repository, config.repository);
  assert.equal(saved.githubToken, config.githubToken);
  assert.equal(saved.lastSyncTime, result.lastSyncTime);
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(f.target, 'sync_config.json'))).mode & 0o777, 0o600);
  assert.equal(await f.git(f.root, ['--git-dir', f.repo, 'rev-parse', config.branch]), head);
  assert.equal(f.calls.some(args => args[0] === 'push'), false);
});

test('failed import removes only its own new folder; an existing folder is never overwritten', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro-import-failure-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'blog');
  const fail = () => ({ preview: async () => { throw new Error('network unavailable'); } });
  await assert.rejects(importGitHubProject(target, config, { createCloudSync: fail }), /network unavailable/);
  await assert.rejects(fs.access(target));
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'keep.txt'), 'Existing work');
  await assert.rejects(importGitHubProject(target, config, { createCloudSync: fail }), { code: 'EEXIST' });
  assert.equal(await fs.readFile(path.join(target, 'keep.txt'), 'utf8'), 'Existing work');
});
