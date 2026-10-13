const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { test } = require('node:test');
const { copySourceProject } = require('../hexo-pro/source_sync');
const { writeSyncIgnore } = require('../hexo-pro/sync_service');
const exec = promisify(execFile);

async function fixture(t) {
  // A .git substring in an ancestor must not filter out the entire project.
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro.github-source-'));
  t.after(() => fs.rm(base, { force: true, recursive: true }));
  const deploy = path.join(base, '.deploy_git');
  await fs.mkdir(deploy);
  await exec('git', ['init', deploy]);
  const write = async (name, content = name) => {
    await fs.mkdir(path.dirname(path.join(base, name)), { recursive: true });
    await fs.writeFile(path.join(base, name), content);
  };
  const read = name => fs.readFile(path.join(deploy, name), 'utf8');
  return { base, deploy, write, read };
}

test('source deployment includes the complete project inputs and shared IDs, without local runtime data', async t => {
  const { base, deploy, write, read } = await fixture(t);
  const article = '\uFEFF---\r\ntitle: 原文 # keep\r\nplugin_id: custom\r\n---\r\n正文\r\n';
  const identity = '{"version":1,"documents":[{"documentId":"existing-id"}]}\n';
  const included = ['package.json', 'pnpm-lock.yaml', '_config.butterfly.yml', '_config.fluid.yml',
    '_config.custom-theme.yaml', '_config.custom-theme.schema.json', 'scripts/build.js',
    '.github/workflows/deploy.yml', '.gitattributes', '.gitmodules', 'README.md',
    'themes/custom/layout/post.ejs', 'themes/custom/public/logo.svg', 'scaffolds/post.md', 'source/images/pic.png'];
  const excluded = ['node_modules/dependency.js', 'themes/custom/node_modules/dependency.js',
    'themes/custom/.git/config', 'public/index.html', '.deploy_old/archive.md', '.hexopro_sync_git/source.md',
    '.env', '.env.production', 'deploy_config.json', 'sync_config.json', '_admin-config.yml',
    'data/users.db', 'data/settings.db~', 'data/deploy_status.db', 'data/theme_schema_cache.db',
    '.hexo-pro/runtime.json', '.hexo-pro/document-identities.json.bak', '.hexo-pro/document-identities.json.lock',
    '.hexo-pro/theme-config-snapshots/config.json', '.edgeone/cache.json', '.wrangler/cache.json', 'db.json', 'blogInfoList.json'];
  for (const name of included) await write(name);
  for (const name of excluded) await write(name, 'private-local-data');
  await write('_config.yml', '# keep config comments\ntheme: custom\n');
  await write('source/_posts/中文 空格.md', article);
  await write('.hexo-pro/document-identities.json', identity);
  await write('.gitignore', '# User rules\n.hexo-pro/\n');
  await fs.chmod(path.join(base, 'scripts/build.js'), 0o755);

  const copied = await copySourceProject(base, deploy);
  for (const name of included) assert.equal(await read(name), name);
  for (const name of excluded) await assert.rejects(fs.lstat(path.join(deploy, name)), { code: 'ENOENT' });
  assert.equal(await read('source/_posts/中文 空格.md'), article);
  assert.equal(await read('.hexo-pro/document-identities.json'), identity);
  assert.equal(await read('_config.yml'), '# keep config comments\ntheme: custom\n');
  assert.equal((await fs.stat(path.join(deploy, 'scripts/build.js'))).mode & 0o111, 0o111);
  assert.ok(copied.includes('.github/workflows/deploy.yml'));
  assert.equal(await fs.readFile(path.join(base, '.gitignore'), 'utf8'), '# User rules\n.hexo-pro/\n');
  assert.equal(await fs.readFile(path.join(base, '.hexo-pro/document-identities.json'), 'utf8'), identity);
  await exec('git', ['add', '.'], { cwd: deploy });
  const { stdout } = await exec('git', ['ls-files', '-z'], { cwd: deploy });
  const staged = stdout.split('\0');
  assert.ok(staged.includes('.hexo-pro/document-identities.json'), 'identity must actually be included in the Git commit');
  assert.ok(staged.includes('.github/workflows/deploy.yml'));
  assert.ok(staged.includes('themes/custom/public/logo.svg'));
});

test('source deployment respects nested ignore rules, negation and custom generated directories', async t => {
  const { base, deploy, write, read } = await fixture(t);
  await write('.gitignore', '/scratch/\n*.private\n');
  await write('scratch/note.md');
  await write('source/secret.private');
  await write('source/.gitignore', '*.tmp\n!keep.tmp\n');
  await write('source/delete.tmp');
  await write('source/keep.tmp');
  await write('output/site/index.html');
  await write('public/hand-written-source.txt');
  await copySourceProject(base, deploy, { publicDir: path.join(base, 'output/site') });
  for (const name of ['scratch/note.md', 'source/secret.private', 'source/delete.tmp', 'output/site/index.html']) {
    await assert.rejects(fs.lstat(path.join(deploy, name)), { code: 'ENOENT' });
  }
  assert.equal(await read('source/keep.tmp'), 'source/keep.tmp');
  assert.equal(await read('public/hand-written-source.txt'), 'public/hand-written-source.txt');
  await exec('git', ['add', '.'], { cwd: deploy });
  const { stdout } = await exec('git', ['ls-files', '-z'], { cwd: deploy });
  assert.ok(stdout.split('\0').includes('public/hand-written-source.txt'));
});

test('source deployment sanitizes deployment credentials in the copy without changing local YAML', async t => {
  const { base, deploy, write, read } = await fixture(t);
  const raw = 'title: Blog\ndeploy:\n  - type: git\n    repo: https://user:secret@github.com/user/blog.git\n    token: secret\n  - type: git\n    repo: https://github.com/user/other.git\n';
  await write('_config.yml', raw);
  await copySourceProject(base, deploy);
  assert.ok(!(await read('_config.yml')).includes('secret'));
  assert.ok((await read('_config.yml')).includes('https://github.com/user/blog.git'));
  assert.equal(await fs.readFile(path.join(base, '_config.yml'), 'utf8'), raw);
});

test('source deployment fails instead of copying unreadable configuration with credentials', async t => {
  const { base, deploy, write } = await fixture(t);
  await write('_config.yml', 'deploy: [broken\n');
  await assert.rejects(copySourceProject(base, deploy), /_config.yml 无法解析/);
  await assert.rejects(fs.lstat(path.join(deploy, '_config.yml')), { code: 'ENOENT' });
});

test('source deployment preserves internal links and rejects links to files outside the project', async t => {
  const { base, deploy, write, read } = await fixture(t);
  await write('source/original.md', 'original');
  await fs.symlink('original.md', path.join(base, 'source/link.md'));
  await copySourceProject(base, deploy);
  assert.equal(await fs.readlink(path.join(deploy, 'source/link.md')), 'original.md');
  assert.equal(await read('source/link.md'), 'original');
  await fs.rm(path.join(deploy, 'source'), { recursive: true });
  await fs.symlink('../../outside-private.txt', path.join(base, 'source/outside.md'));
  await assert.rejects(copySourceProject(base, deploy), /链接指向项目外/);
});

test('cloud sync retains user ignore rules while sharing IDs and excluding runtime data', async t => {
  const { base, write } = await fixture(t);
  await exec('git', ['init', base]);
  const original = '# User rules\n.hexo-pro/\nspace\\ \n';
  await write('.gitignore', original);
  await write('.hexo-pro/document-identities.json', '{"version":1,"documents":[]}');
  await write('.hexo-pro/runtime.json', 'local-runtime');
  await write('.hexo-pro/document-identities.json.bak', 'local-backup');
  await write('deploy_config.json', 'local-secret');
  await write('source/post.md', 'post');
  await writeSyncIgnore(base);
  const first = await fs.readFile(path.join(base, '.gitignore'), 'utf8');
  await writeSyncIgnore(base);
  assert.equal(await fs.readFile(path.join(base, '.gitignore'), 'utf8'), first);
  assert.ok(first.startsWith(original));
  await exec('git', ['add', '.'], { cwd: base });
  const { stdout } = await exec('git', ['ls-files', '-z'], { cwd: base });
  const files = stdout.split('\0');
  assert.ok(files.includes('.hexo-pro/document-identities.json'));
  assert.ok(files.includes('source/post.md'));
  assert.ok(!files.includes('.hexo-pro/runtime.json'));
  assert.ok(!files.includes('.hexo-pro/document-identities.json.bak'));
  assert.ok(!files.includes('deploy_config.json'));
});
