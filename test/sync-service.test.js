const assert = require('assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const {
  DEFAULT_SYNC_IGNORE,
  buildAuthenticatedRepoUrl,
  maskSyncConfig,
  parseGitStatus,
  runCommandDefault
} = require('../hexo-pro/sync_service');

test('runCommandDefault preserves Git identities and commit messages containing spaces', async (t) => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro-sync-command-'));
  t.after(() => fs.rm(baseDir, { recursive: true, force: true }));
  const runGit = (args) => runCommandDefault('git', args, { cwd: baseDir });

  await runGit(['init']);
  await runGit(['config', 'user.name', 'Hexo Pro']);
  await runGit(['config', 'user.email', 'hexo-pro@users.noreply.github.com']);
  assert.strictEqual(await runGit(['config', 'user.name']), 'Hexo Pro');

  await fs.writeFile(path.join(baseDir, 'post.md'), 'Blog draft');
  await runGit(['add', 'post.md']);
  const commitMessage = "Sync blog: today's draft";
  await runGit(['-c', 'commit.gpgsign=false', 'commit', '-m', commitMessage]);
  assert.strictEqual(await runGit(['log', '-1', '--format=%s']), commitMessage);
});

test('maskSyncConfig hides GitHub personal access tokens', () => {
  const masked = maskSyncConfig({
    repository: 'user/blog',
    branch: 'main',
    githubToken: 'secret-token'
  });

  assert.strictEqual(masked.repository, 'user/blog');
  assert.strictEqual(masked.githubToken, '******');
  assert.strictEqual(masked.hasGithubToken, true);
});

test('buildAuthenticatedRepoUrl creates a temporary HTTPS URL without changing repository config', () => {
  assert.strictEqual(
    buildAuthenticatedRepoUrl('wuzheng228/blog', 'gho_test'),
    'https://x-access-token:gho_test@github.com/wuzheng228/blog.git'
  );
  assert.strictEqual(
    buildAuthenticatedRepoUrl('https://github.com/wuzheng228/blog.git', 'gho_test'),
    'https://x-access-token:gho_test@github.com/wuzheng228/blog.git'
  );
});

test('DEFAULT_SYNC_IGNORE protects generated and local runtime files', () => {
  assert.ok(DEFAULT_SYNC_IGNORE.includes('node_modules/'));
  assert.ok(DEFAULT_SYNC_IGNORE.includes('/public/'));
  assert.ok(DEFAULT_SYNC_IGNORE.includes('/.deploy_git/'));
  assert.ok(DEFAULT_SYNC_IGNORE.includes('/deploy_config.json'));
  assert.ok(DEFAULT_SYNC_IGNORE.includes('/sync_config.json'));
  assert.ok(DEFAULT_SYNC_IGNORE.includes('/data/*.db'));
});

test('parseGitStatus detects dirty and clean states', () => {
  assert.deepStrictEqual(parseGitStatus(''), {
    dirty: false,
    files: []
  });

  assert.deepStrictEqual(parseGitStatus(' M source/_posts/a.md\n?? source/images/a.png\n'), {
    dirty: true,
    files: ['source/_posts/a.md', 'source/images/a.png']
  });
});
