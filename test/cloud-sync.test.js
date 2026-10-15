const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { createCloudSync, mergeIdentities } = require('../hexo-pro/cloud_sync');
const { runCommandDefault } = require('../hexo-pro/sync_service');

const config = { repository: 'test/blog', branch: 'main', githubToken: 'fixture-token-only' };
const firstId = '28135ea2-9674-458f-ad11-734c599b9821';
const secondId = '28135ea2-9674-458f-ad11-734c599b9822';
const thirdId = '28135ea2-9674-458f-ad11-734c599b9823';
const record = (id, source, fingerprint = 'hash') => ({ documentId: id, kind: 'Post', source, fingerprint });
const index = documents => JSON.stringify({ version: 1, documents }, null, 2) + '\n';
const identityPath = '.hexo-pro/document-identities.json';

async function fixture(t, empty = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro-cloud-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = path.join(root, 'blog'), phone = path.join(root, 'phone'), remote = path.join(root, 'remote.git');
  await fs.mkdir(base); await fs.mkdir(phone);
  const git = (cwd, args) => runCommandDefault('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const write = async (dir, name, text) => { await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true }); await fs.writeFile(path.join(dir, name), text); };
  const read = (dir, name) => fs.readFile(path.join(dir, name), 'utf8');
  const commit = async dir => { await git(dir, ['add', '-A']); await git(dir, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'Fixture change']); };
  await git(root, ['init', '--bare', '--initial-branch=main', remote]);
  for (const dir of [base, phone]) {
    await git(dir, ['init', '--initial-branch', dir === base ? 'original' : 'main']);
    await git(dir, ['config', 'user.name', 'Fixture']); await git(dir, ['config', 'user.email', 'fixture@example.invalid']);
    await write(dir, 'source/_posts/a.md', '---\r\ntitle: Original\r\nplugin: stay\r\n---\r\nOriginal body');
    await write(dir, '_config.yml', 'title: Blog\n'); await write(dir, '.gitignore', 'node_modules/\n');
    await commit(dir);
  }
  await git(base, ['remote', 'add', 'origin', 'https://example.invalid/original.git']);
  await git(phone, ['remote', 'add', 'origin', remote]);
  if (!empty) await git(phone, ['push', 'origin', 'main']);
  await write(base, identityPath, index([record(firstId, '_posts/a.md')]));
  await write(base, 'themes/custom/layout.ejs', '<main>Theme</main>');
  await write(base, '.github/workflows/build.yml', 'name: blog-build\n');
  await write(base, 'deploy_config.json', '{"token":"private"}');
  await write(base, '.hexo-pro/runtime.json', 'private-runtime');
  const originalHead = await git(base, ['rev-parse', 'HEAD']);
  const originalIndex = await fs.readFile(path.join(base, '.git/index'));
  let beforePush;
  const calls = [];
  const runCommand = async (command, args, options) => {
    assert.equal(command, 'git');
    assert.notEqual(path.resolve(options.cwd), path.resolve(base), 'cloud sync must not execute Git in the user checkout');
    assert.ok(!args.includes('--force'));
    calls.push(args);
    if (args[0] === 'push' && beforePush) { const run = beforePush; beforePush = null; await run(); }
    const localArgs = args.map(arg => arg === 'https://github.com/test/blog.git' ? remote : arg);
    return runCommandDefault(command, localArgs, options);
  };
  const cloud = createCloudSync(base, { runCommand });
  const preview = () => cloud.preview(config);
  const apply = async plan => cloud.apply(config, plan.id, Object.fromEntries(plan.changes.filter(c => c.direction === 'conflict').map(c => [c.path, 'upload'])));
  const phoneUpdate = async changes => {
    await git(phone, ['fetch', 'origin', 'main']); await git(phone, ['reset', '--hard', 'origin/main']);
    for (const [name, text] of Object.entries(changes)) {
      if (text === null) await fs.rm(path.join(phone, name), { force: true });
      else await write(phone, name, text);
    }
    await commit(phone); await git(phone, ['push', 'origin', 'main']);
  };
  const assertOriginalGit = async () => {
    assert.equal(await git(base, ['branch', '--show-current']), 'original');
    assert.equal(await git(base, ['remote', 'get-url', 'origin']), 'https://example.invalid/original.git');
    assert.equal(await git(base, ['rev-parse', 'HEAD']), originalHead);
    assert.deepEqual(await fs.readFile(path.join(base, '.git/index')), originalIndex);
  };
  return { root, base, remote, phone, cloud, calls, git, write, read, preview, apply, phoneUpdate, assertOriginalGit, beforePush: fn => { beforePush = fn; } };
}

test('first cloud sync uploads complete source files, preserves original Git and Markdown bytes, then is clean', async t => {
  const f = await fixture(t);
  const raw = await f.read(f.base, 'source/_posts/a.md');
  const preview = await f.preview();
  assert.equal(preview.firstSync, true);
  assert.ok(preview.changes.some(c => c.path === identityPath && c.direction === 'upload'));
  await f.apply(preview);
  const files = await f.git(f.root, ['--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'main']);
  for (const name of [identityPath, '.github/workflows/build.yml', 'themes/custom/layout.ejs']) assert.ok(files.includes(name));
  for (const name of ['runtime.json', 'deploy_config.json', 'cloud-sync/']) assert.ok(!files.includes(name));
  assert.equal(await f.read(f.base, 'source/_posts/a.md'), raw);
  const next = await f.preview();
  assert.equal(next.firstSync, false);
  assert.deepEqual(next.changes, []);
  await f.assertOriginalGit();
});

test('independent phone and desktop article changes merge with their stable identity records', async t => {
  const f = await fixture(t); await f.apply(await f.preview());
  await f.write(f.base, 'source/_posts/desktop.md', 'Desktop article');
  await f.write(f.base, identityPath, index([record(firstId, '_posts/a.md'), record(secondId, '_posts/desktop.md')]));
  await f.phoneUpdate({ 'source/_posts/phone.md': 'Phone article', [identityPath]: index([record(firstId, '_posts/a.md'), record(thirdId, '_posts/phone.md')]) });
  const preview = await f.preview();
  assert.equal(preview.conflictCount, 0);
  assert.ok(preview.changes.some(c => c.path === identityPath && c.direction === 'merge'));
  await f.apply(preview);
  assert.equal(await f.read(f.base, 'source/_posts/phone.md'), 'Phone article');
  const ids = JSON.parse(await f.read(f.base, identityPath)).documents.map(v => v.documentId);
  assert.deepEqual(new Set(ids), new Set([firstId, secondId, thirdId]));
  assert.deepEqual((await f.preview()).changes, []);
  await f.assertOriginalGit();
});

test('both sides editing a file requires an explicit choice and keeps a local backup', async t => {
  const f = await fixture(t); await f.apply(await f.preview());
  await f.write(f.base, 'source/_posts/a.md', 'Local edit');
  await f.phoneUpdate({ 'source/_posts/a.md': 'Phone edit' });
  const plan = await f.preview();
  assert.equal(plan.conflictCount, 1);
  await assert.rejects(() => f.cloud.apply(config, plan.id), /每个冲突文件/);
  assert.equal(await f.read(f.base, 'source/_posts/a.md'), 'Local edit');
  const result = await f.cloud.apply(config, plan.id, { 'source/_posts/a.md': 'download' });
  assert.equal(await f.read(f.base, 'source/_posts/a.md'), 'Phone edit');
  assert.equal(await f.read(result.backupDir, 'source/_posts/a.md'), 'Local edit');
});

test('a local edit after preview invalidates the plan without touching the remote', async t => {
  const f = await fixture(t); const plan = await f.preview();
  const head = await f.git(f.root, ['--git-dir', f.remote, 'rev-parse', 'main']);
  await f.write(f.base, 'source/_posts/a.md', 'Unsaved-to-cloud new edit');
  await assert.rejects(() => f.apply(plan), /本机文件发生了变化/);
  assert.equal(await f.git(f.root, ['--git-dir', f.remote, 'rev-parse', 'main']), head);
});

test('a remote change after preview prevents overwriting other devices', async t => {
  const f = await fixture(t); await f.apply(await f.preview());
  await f.write(f.base, 'source/_posts/local.md', 'Local');
  const plan = await f.preview();
  await f.phoneUpdate({ 'source/_posts/a.md': 'Fresh phone edit' });
  await assert.rejects(() => f.apply(plan), /刚更新了 GitHub/);
  assert.equal(await f.read(f.base, 'source/_posts/local.md'), 'Local');
});

test('a race at push is rejected, applies no downloads, and requires a fresh preview', async t => {
  const f = await fixture(t); await f.apply(await f.preview());
  await f.write(f.base, 'source/_posts/local.md', 'Local');
  await f.phoneUpdate({ 'source/_posts/remote.md': 'Remote' });
  const plan = await f.preview();
  f.beforePush(() => f.phoneUpdate({ 'source/_posts/newer.md': 'Newer' }));
  await assert.rejects(() => f.apply(plan), /rejected|fetch first|non-fast-forward/);
  await assert.rejects(() => fs.access(path.join(f.base, 'source/_posts/remote.md')));
  await assert.rejects(() => f.apply(plan), /预览已过期/);
  await f.apply(await f.preview());
  assert.equal(await f.read(f.base, 'source/_posts/newer.md'), 'Newer');
});

test('an edit during upload is preserved instead of being overwritten by downloads', async t => {
  const f = await fixture(t); await f.apply(await f.preview());
  await f.write(f.base, 'source/_posts/local.md', 'Ready for upload');
  await f.phoneUpdate({ 'source/_posts/a.md': 'Phone edit' });
  const plan = await f.preview();
  f.beforePush(() => f.write(f.base, 'source/_posts/a.md', 'Typed during upload'));
  await assert.rejects(() => f.apply(plan), /同步期间本机文件已被编辑/);
  assert.equal(await f.read(f.base, 'source/_posts/a.md'), 'Typed during upload');
  assert.ok((await f.preview()).changes.some(c => c.path === 'source/_posts/a.md' && c.direction === 'conflict'));
});

test('the file review returns both versions and rejects paths outside the current preview', async t => {
  const f = await fixture(t);
  await f.write(f.base, 'source/_posts/a.md', 'Local preview');
  const plan = await f.preview();
  const diff = f.cloud.diff(plan.id, 'source/_posts/a.md');
  assert.equal(diff.local, 'Local preview');
  assert.match(diff.remote, /Original body/);
  assert.throws(() => f.cloud.diff(plan.id, '../deploy_config.json'), /预览已过期/);
  assert.throws(() => f.cloud.diff('old-preview', 'source/_posts/a.md'), /预览已过期/);
});

test('new empty GitHub repositories can receive their first source commit', async t => {
  const f = await fixture(t, true);
  assert.equal((await f.cloud.check(config)).emptyRepository, true);
  await f.apply(await f.preview());
  assert.match(await f.git(f.root, ['--git-dir', f.remote, 'ls-tree', '-r', '--name-only', 'main']), /document-identities/);
});

test('remote deletion is previewed and backed up, while locally edited deletions conflict', async t => {
  const f = await fixture(t); await f.apply(await f.preview());
  await f.phoneUpdate({ 'source/_posts/a.md': null });
  const plan = await f.preview();
  assert.deepEqual(plan.changes.find(c => c.path === 'source/_posts/a.md'), { path: 'source/_posts/a.md', direction: 'download', localExists: true, remoteExists: false });
  const result = await f.apply(plan);
  await assert.rejects(() => fs.access(path.join(f.base, 'source/_posts/a.md')));
  assert.match(await f.read(result.backupDir, 'source/_posts/a.md'), /Original body/);
});

test('identity merging rejects conflicting document IDs for one source', () => {
  const raw = mergeIdentities(null, index([record(firstId, '_posts/a.md')]), index([record(secondId, '_posts/a.md')]));
  assert.equal(raw, null);
});

test('first sync assigns shared sidecar IDs to legacy remote-only articles without editing front matter', async t => {
  const f = await fixture(t);
  const article = '---\ntitle: Legacy phone draft\n---\nOriginal';
  await f.phoneUpdate({ 'source/_posts/legacy.md': article });
  const plan = await f.preview();
  assert.ok(plan.changes.some(c => c.path === identityPath && c.direction === 'merge'));
  await f.apply(plan);
  assert.equal(await f.read(f.base, 'source/_posts/legacy.md'), article);
  const local = JSON.parse(await f.read(f.base, identityPath));
  const remote = JSON.parse(await f.git(f.root, ['--git-dir', f.remote, 'show', `main:${identityPath}`]));
  assert.deepEqual(local, remote);
  assert.ok(local.documents.some(record => record.source === '_posts/legacy.md'));
});

test('a malformed remote identity index stops before changing local articles or IDs', async t => {
  const f = await fixture(t); const original = await f.read(f.base, identityPath);
  await f.phoneUpdate({ [identityPath]: '{"version":1,"documents":[{"documentId":"invalid"}]}' });
  await assert.rejects(() => f.preview(), /文章 ID 索引/);
  assert.equal(await f.read(f.base, identityPath), original);
});

test('cloud pulls keep local deployment settings while syncing the other Hexo settings', async t => {
  const f = await fixture(t);
  await f.write(f.base, '_config.yml', 'title: Blog\ndeploy:\n  type: git\n  token: private-on-this-computer\n');
  await f.apply(await f.preview());
  await f.phoneUpdate({ '_config.yml': 'title: Renamed\ndeploy:\n  type: git\n' });
  await f.apply(await f.preview());
  assert.match(await f.read(f.base, '_config.yml'), /private-on-this-computer/);
  assert.match(await f.read(f.base, '_config.yml'), /Renamed/);
  assert.deepEqual((await f.preview()).changes, []);
});

test('restore uses GitHub for the whole source tree, backs up template-only files, and never pushes', async t => {
  const f = await fixture(t);
  const article = '---\r\ntitle: Remote blog\r\ncustom: unchanged\r\n---\r\nRemote body';
  await f.phoneUpdate({
    'package.json': JSON.stringify({ dependencies: { hexo: '^8.0.0' } }),
    'source/_posts/a.md': article,
    'source/images/remote.png': 'remote-image-bytes',
    'themes/custom/layout.ejs': '<main>Remote theme</main>',
    [identityPath]: index([record(thirdId, '_posts/a.md')])
  });
  await f.write(f.base, 'source/_posts/hello-world.md', 'Default template post');
  await f.write(f.base, '.gitignore', 'node_modules/\nthemes/\n');
  const head = await f.git(f.root, ['--git-dir', f.remote, 'rev-parse', 'main']);
  const plan = await f.cloud.preview(config, 'restore');
  assert.equal(plan.mode, 'restore');
  assert.equal(plan.uploadCount, 0);
  assert.equal(plan.conflictCount, 0);
  assert.ok(plan.changes.every(change => change.direction === 'download'));
  assert.ok(plan.changes.some(change => change.path === 'themes/custom/layout.ejs'), 'template ignore rules must not hide remote themes');
  const result = await f.cloud.apply(config, plan.id);
  assert.equal(result.uploaded, 0);
  assert.equal(await f.read(f.base, 'source/_posts/a.md'), article);
  assert.equal(await f.read(f.base, 'themes/custom/layout.ejs'), '<main>Remote theme</main>');
  assert.equal(await f.read(f.base, 'source/images/remote.png'), 'remote-image-bytes');
  assert.equal(await f.read(f.base, identityPath), index([record(thirdId, '_posts/a.md')]));
  assert.equal(await f.read(result.backupDir, 'source/_posts/hello-world.md'), 'Default template post');
  await assert.rejects(f.read(f.base, 'source/_posts/hello-world.md'), { code: 'ENOENT' });
  assert.equal(await f.read(f.base, 'deploy_config.json'), '{"token":"private"}');
  assert.equal(await f.git(f.root, ['--git-dir', f.remote, 'rev-parse', 'main']), head);
  assert.equal(f.calls.some(args => args[0] === 'push'), false);
  assert.deepEqual((await f.preview()).changes, []);
  await f.assertOriginalGit();
});

test('restoring legacy sources does not generate or upload identity records', async t => {
  const f = await fixture(t);
  await f.phoneUpdate({ 'package.json': JSON.stringify({ dependencies: { hexo: '^8.0.0' } }) });
  const head = await f.git(f.root, ['--git-dir', f.remote, 'rev-parse', 'main']);
  const plan = await f.cloud.preview(config, 'restore');
  const result = await f.cloud.apply(config, plan.id);
  assert.equal(result.uploaded, 0);
  await assert.rejects(f.read(f.base, identityPath), { code: 'ENOENT' });
  assert.equal(await f.git(f.root, ['--git-dir', f.remote, 'rev-parse', 'main']), head);
  assert.equal(await f.read(result.backupDir, identityPath), index([record(firstId, '_posts/a.md')]));
});

test('restore refuses empty and published-only repositories without touching local files', async t => {
  for (const empty of [true, false]) {
    const f = await fixture(t, empty);
    const original = await f.read(f.base, 'source/_posts/a.md');
    await assert.rejects(f.cloud.preview(config, 'restore'), /空的|源码仓库/);
    assert.equal(await f.read(f.base, 'source/_posts/a.md'), original);
    assert.equal(f.calls.some(args => args[0] === 'push'), false);
  }
});

test('restore rejects stale previews and unsupported modes', async t => {
  const f = await fixture(t);
  await f.phoneUpdate({ 'package.json': JSON.stringify({ dependencies: { hexo: '^8.0.0' } }) });
  await assert.rejects(f.cloud.preview(config, 'invalid-mode'), /请选择/);
  const plan = await f.cloud.preview(config, 'restore');
  await f.phoneUpdate({ 'source/_posts/a.md': 'Remote edited after preview' });
  await assert.rejects(f.cloud.apply(config, plan.id), /刚更新了 GitHub/);
  assert.match(await f.read(f.base, 'source/_posts/a.md'), /Original body/);
});

test('restore includes tracked files even if remote ignore rules hide them, while skipping generated output', async t => {
  const f = await fixture(t);
  await f.phoneUpdate({
    'package.json': JSON.stringify({ dependencies: { hexo: '^8.0.0' } }),
    '_config.yml': 'title: Remote\npublic_dir: output/site\n',
    'themes/remote/layout.ejs': '<main>Tracked theme</main>',
    '_config.theme.yml': 'color: blue\n',
    'output/site/index.html': '<main>Generated output</main>',
    'public/handwritten.txt': 'Source asset'
  });
  await f.phoneUpdate({ '.gitignore': 'node_modules/\nthemes/\n_config.theme.yml\noutput/site/\n' });
  const plan = await f.cloud.preview(config, 'restore');
  assert.ok(plan.changes.some(change => change.path === 'themes/remote/layout.ejs'));
  assert.ok(plan.changes.some(change => change.path === '_config.theme.yml'));
  assert.ok(plan.changes.some(change => change.path === 'public/handwritten.txt'));
  assert.equal(plan.changes.some(change => change.path === 'output/site/index.html'), false);
  await f.cloud.apply(config, plan.id);
  assert.equal(await f.read(f.base, 'themes/remote/layout.ejs'), '<main>Tracked theme</main>');
  assert.equal(await f.read(f.base, '_config.theme.yml'), 'color: blue\n');
  assert.equal(await f.read(f.base, 'public/handwritten.txt'), 'Source asset');
  await assert.rejects(f.read(f.base, 'output/site/index.html'), { code: 'ENOENT' });
});
