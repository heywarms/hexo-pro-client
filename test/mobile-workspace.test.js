const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')

const modules = Promise.all([
    import('../client/src/mobile/documentModel.mjs'), import('../client/src/mobile/workspaceStore.mjs'),
    import('../client/src/mobile/githubRepository.mjs'),
])
const config = { owner: 'example', repo: 'blog', branch: 'main', blogDir: '', sourceDir: 'source' }
const clone = value => JSON.parse(JSON.stringify(value))

function memoryStorage() {
    let data = null
    const assets = new Map()
    return { readState: async () => clone(data), writeState: async state => { data = clone(state) },
        readAsset: async key => assets.get(key) || 'aW1hZ2U=',
        writeAsset: async (key, bytes) => assets.set(key, Buffer.from(bytes).toString('base64')), saved: () => data }
}
function memoryCredentials() {
    const values = new Map()
    return { get: async key => values.get(key), set: async (key, value) => values.set(key, value), remove: async key => values.delete(key) }
}

test('mobile body and title edits preserve YAML/JSON headers, BOM, comments, plugin fields and CRLF', async () => {
    const [m] = await modules
    const raw = '\uFEFF---\r\ntitle: "旧标题" # retain\r\nplugin_id: custom-value\r\ntags: [甲, 乙]\r\n---\r\n正文\r\n'
    const body = m.withBody(raw, '手机修改\n第二行\n')
    assert.equal(body, raw.slice(0, raw.indexOf('正文')) + '手机修改\r\n第二行\r\n')
    const renamed = m.withTitle(raw, '新标题：想法')
    assert.equal(renamed, raw.replace('"旧标题"', '"新标题：想法"'))
    assert.equal(m.metadata(renamed).plugin_id, 'custom-value')
    assert.equal(m.withTitle(renamed, '新标题：想法'), renamed)
    const json = ';;;\n"title": "Old",\n"plugin": {"nested": true}\n;;;\nContent'
    assert.equal(m.withTitle(json, 'New'), json.replace('"Old"', '"New"'))
    assert.equal(m.withBody(json, 'Changed'), json.replace('Content', 'Changed'))
    const legacy = 'title: Legacy\nplugin: preserved\n---\nBody'
    assert.equal(m.withBody(legacy, 'Edited'), legacy.replace('Body', 'Edited'))
    const noHeader = '开头的段落\n\n---\n\n分隔线后的正文'
    assert.equal(m.splitDocument(noHeader).body, noHeader)
    for (const empty of ['---\n---\n正文', ';;;\n;;;\n正文']) {
        const titled = m.withTitle(empty, '标题')
        assert.equal(m.metadata(titled).title, '标题')
        assert.equal(m.splitDocument(titled).body, '正文')
    }
    assert.equal(await m.fingerprint(raw), createHash('sha256').update(raw.replace(/\r\n/g, '\n')).digest('hex'))
})

test('mobile identity registration changes only the external index and retains IDs over rename and repeated pulls', async () => {
    const [m] = await modules
    const raw = '---\ntitle: 原文\nplugin_id: keep\n---\nbody'
    const workspace = m.createWorkspace(config)
    const first = await m.identifySnapshot({ head: 'a', indexRaw: null, documents: [{ source: '_posts/a.md', raw }] }, workspace)
    const pulled = m.mergeSnapshot(workspace, first)
    assert.equal(pulled.documents[0].raw, raw)
    const plan = await m.planCommit(pulled, first)
    assert.deepEqual([...plan.changes.keys()], [m.IDENTITY_PATH])
    assert.ok(!plan.indexRaw.includes('plugin_id'))
    const second = await m.identifySnapshot({ head: 'b', indexRaw: plan.indexRaw, documents: [{ source: '_posts/renamed.md', raw }] }, pulled)
    assert.equal(second.documents[0].documentId, first.documents[0].documentId)
    const repeated = await m.identifySnapshot({ head: 'a', indexRaw: null, documents: [{ source: '_posts/a.md', raw }] }, pulled)
    assert.equal(repeated.documents[0].documentId, first.documents[0].documentId)
    const copied = await m.identifySnapshot({ head: 'c', indexRaw: plan.indexRaw, documents: [{ source: '_posts/a.md', raw }, { source: '_posts/copy.md', raw }] }, pulled)
    assert.notEqual(copied.documents[0].documentId, copied.documents[1].documentId)
})

test('mobile rejects invalid paths, corrupt/missing indexes and incomplete local state rather than resetting IDs', async () => {
    const [m, { validateState }] = await modules
    for (const path of ['../a.md', '/tmp/a.md', '_posts/../../config.yml', 'a//b.md', 'a/./b.md']) assert.throws(() => m.safePath(path))
    assert.throws(() => m.normalizeConfig({ ...config, branch: 'branch..bad' }))
    assert.throws(() => m.parseIdentityIndex('{invalid'), /索引损坏/)
    assert.throws(() => validateState({ version: 1, workspaces: [] }), /本地文章数据损坏/)
    const workspace = { ...m.createWorkspace(config), baseIndex: '{previous}' }
    await assert.rejects(m.identifySnapshot({ indexRaw: null, documents: [] }, workspace), /索引丢失/)
})

test('two devices editing the same article retain the local version and require explicit conflict resolution', async () => {
    const [m] = await modules
    const base = m.createDocument({ source: '_posts/a.md' })
    base.baseRaw = base.raw; base.baseSource = base.source
    const local = { ...base, raw: m.withBody(base.raw, '手机版本') }
    const remote = { ...base, raw: m.withBody(base.raw, '电脑版本') }
    const workspace = { ...m.createWorkspace(config), documents: [local] }
    const merged = m.mergeSnapshot(workspace, { documents: [remote], head: 'new', indexRaw: null })
    assert.equal(merged.documents[0].raw, local.raw)
    assert.equal(merged.documents[0].conflict.raw, remote.raw)
    await assert.rejects(m.planCommit(merged, { index: { documents: [] } }), /处理文章冲突/)
    const mine = m.resolveConflict(merged, local.documentId, 'local')
    assert.equal(mine.documents[0].raw, local.raw)
    assert.equal(mine.documents[0].baseRaw, remote.raw)
    assert.equal(mine.documents[0].conflict, null)
    const theirs = m.resolveConflict(merged, local.documentId, 'remote')
    assert.equal(theirs.documents[0].raw, remote.raw)
    assert.equal(m.isDirty(theirs.documents[0]), false)
    const deleted = m.mergeSnapshot(workspace, { documents: [], head: 'deleted', indexRaw: null })
    assert.equal(deleted.documents[0].raw, local.raw)
    assert.equal(deleted.documents[0].conflict.raw, null)
})

test('commit planning includes article rename, image and identity in a single tree without touching other repository files', async () => {
    const [m] = await modules
    const base = m.createDocument({ source: '_drafts/a.md' })
    base.baseRaw = base.raw; base.baseSource = base.source
    const index = { version: 1, documents: [{ documentId: base.documentId, kind: 'Post', source: base.source, fingerprint: await m.fingerprint(base.raw) }] }
    const snapshot = { documents: [base], index, indexRaw: JSON.stringify(index), head: 'old' }
    const workspace = { ...m.createWorkspace({ ...config, blogDir: 'blog' }), documents: [{ ...base, source: '_posts/a.md', raw: m.withBody(base.raw, '![](/images/a.png)') }],
        assets: [{ key: 'a.png', source: 'images/a.png', pending: true }] }
    const plan = await m.planCommit(workspace, snapshot)
    assert.equal(plan.changes.get('blog/source/_drafts/a.md'), null)
    assert.equal(plan.changes.get('blog/source/_posts/a.md').content, workspace.documents[0].raw)
    assert.equal(plan.changes.get('blog/source/images/a.png').assetKey, 'a.png')
    assert.equal(JSON.parse(plan.indexRaw).documents[0].documentId, base.documentId)
    assert.equal(plan.changes.size, 4)
})

test('GitHub uploads a complete tree and refuses to force-update a concurrently changed branch', async () => {
    const [, , { GitHubRepository }] = await modules
    const requests = []
    const fakeFetch = async (url, options) => {
        const body = options.body && JSON.parse(options.body)
        requests.push({ url, method: options.method, body })
        const ok = options.method !== 'PATCH'
        return { ok, status: ok ? 201 : 422, json: async () => ({ sha: options.method === 'POST' && url.endsWith('/git/trees') ? 'tree' : 'sha' }) }
    }
    const repository = new GitHubRepository(config, 'test-only-token', fakeFetch)
    const changes = new Map([['source/_posts/a.md', { content: 'article', encoding: 'utf-8' }], ['.hexo-pro/document-identities.json', { content: 'index', encoding: 'utf-8' }]])
    await assert.rejects(repository.commit({ head: 'old', tree: 'base' }, changes, async () => ''), /仓库已发生变化/)
    assert.equal(requests.filter(request => request.method === 'PATCH').length, 1)
    assert.deepEqual(requests.at(-1).body, { sha: 'sha', force: false })
    assert.equal(requests.find(request => request.url.endsWith('/git/trees')).body.tree.length, 2)
    assert.deepEqual(requests.find(request => request.url.endsWith('/git/commits')).body.parents, ['old'])
})

test('offline writes survive store reload, workspace switching and never persist credentials in article data', async () => {
    const [, { WorkspaceStore }] = await modules
    const storage = memoryStorage(), credentials = memoryCredentials()
    const store = new WorkspaceStore(storage, credentials)
    await store.load()
    const id = await store.create()
    await store.editBody(id, '离线写作')
    await store.connect(config, 'test-only-secret')
    assert.equal(store.workspace().documents.length, 0)
    await store.switchWorkspace('local')
    assert.equal(store.workspace().documents[0].documentId, id)
    const restarted = new WorkspaceStore(storage, credentials)
    await restarted.load()
    assert.ok(restarted.workspace().documents[0].raw.endsWith('离线写作'))
    assert.ok(!JSON.stringify(storage.saved()).includes('test-only-secret'))
    assert.equal(storage.saved().workspaces.length, 2)
})

test('sync acknowledges uploaded versions without dropping edits made while upload is running', async () => {
    const [m, { WorkspaceStore }] = await modules
    const storage = memoryStorage(), credentials = memoryCredentials()
    let uploaded, finish, began
    const waiting = new Promise(resolve => { began = resolve })
    const repository = { readSnapshot: async () => ({ head: 'base', tree: 'tree', indexRaw: null, documents: [] }),
        commit: async (_, changes) => { uploaded = changes; began(); return new Promise(resolve => { finish = resolve }) } }
    const store = new WorkspaceStore(storage, credentials, () => repository)
    await store.load(); await store.connect(config, 'test-token')
    const id = await store.create()
    await store.editBody(id, '已上传的版本')
    const sync = store.sync()
    await waiting
    await store.editBody(id, '上传过程中继续写的新内容')
    finish('committed')
    await sync
    const doc = store.workspace().documents[0]
    assert.ok(doc.raw.endsWith('上传过程中继续写的新内容'))
    assert.ok(doc.baseRaw.endsWith('已上传的版本'))
    assert.ok(m.isDirty(doc))
    assert.ok(uploaded.has(m.IDENTITY_PATH))
    assert.equal(store.syncing, false)
    assert.equal(storage.saved().workspaces.at(-1).documents[0].raw, doc.raw)
})

test('failed disk writes stop network sync; retry preserves the complete latest article', async () => {
    const [, { WorkspaceStore }] = await modules
    let fail = true, requested = false
    const storage = memoryStorage(), write = storage.writeState
    storage.writeState = async state => { if (fail) throw new Error('设备空间不足'); await write(state) }
    const store = new WorkspaceStore(storage, memoryCredentials(), () => { requested = true })
    await store.load()
    await assert.rejects(store.create(), /设备空间不足/)
    assert.equal(store.workspace().documents.length, 1)
    await assert.rejects(store.sync(), /设备空间不足/)
    assert.equal(requested, false)
    fail = false
    await store.retrySave()
    assert.equal(store.saveStatus, 'saved')
    assert.equal(storage.saved().workspaces[0].documents.length, 1)
})

test('importing a local draft also carries its offline images to the connected repository space', async () => {
    const [, { WorkspaceStore }] = await modules
    const store = new WorkspaceStore(memoryStorage(), memoryCredentials())
    await store.load()
    const id = await store.create()
    await store.editBody(id, '![](/images/local.png)')
    await store.updateWorkspace('local', workspace => ({ ...workspace, assets: [{ source: 'images/local.png', key: 'local.png', pending: false }] }))
    await store.connect(config, 'test-token')
    const copied = await store.copyToActive('local', id)
    assert.notEqual(copied, id)
    assert.equal(store.workspace().assets[0].pending, true)
    assert.ok(store.workspace().documents[0].raw.endsWith('![](/images/local.png)'))
    assert.equal(store.state.workspaces[0].documents[0].documentId, id)
})

test('a missing first-time remote index needs explicit initialization before importing or writing anything', async () => {
    const [m, { WorkspaceStore }] = await modules
    const storage = memoryStorage()
    let commits = 0
    const raw = '---\ntitle: 原文\nplugin_field: untouched\n---\n正文'
    const repository = { readSnapshot: async () => ({ head: 'base', indexRaw: null, documents: [{ source: '_posts/original.md', raw }] }),
        commit: async () => { commits++; return 'next' } }
    const store = new WorkspaceStore(storage, memoryCredentials(), () => repository)
    await store.load(); await store.connect(config, 'test-token')
    await assert.rejects(store.sync(), error => error.code === 'INDEX_INITIALIZATION_REQUIRED')
    assert.equal(store.workspace().documents.length, 0)
    assert.equal(commits, 0)
    await store.sync({ initializeIndex: true })
    assert.equal(commits, 1)
    assert.equal(store.workspace().documents[0].raw, raw)
    assert.ok(m.uuidPattern.test(store.workspace().documents[0].documentId))
})

test('post asset directories move by blob SHA with the article, and cached images remain available after acknowledgement', async () => {
    const [m] = await modules
    const doc = m.createDocument({ source: '_posts/old.md' })
    doc.raw = m.withBody(doc.raw, '![](photo.png)'); doc.baseRaw = doc.raw; doc.baseSource = doc.source
    const index = { version: 1, documents: [{ documentId: doc.documentId, kind: 'Post', source: doc.source, fingerprint: await m.fingerprint(doc.raw) }] }
    const snapshot = { documents: [doc], index, indexRaw: JSON.stringify(index), fileRefs: { '_posts/old/photo.png': { sha: 'picture-sha', mode: '100644' } } }
    const sent = { ...m.createWorkspace(config), documents: [{ ...doc, source: '_posts/new.md' }], fileRefs: snapshot.fileRefs,
        assets: [{ key: 'cache-picture', source: '_posts/old/photo.png', pending: false, remoteSha: 'picture-sha' }] }
    const plan = await m.planCommit(sent, snapshot)
    assert.equal(plan.changes.get('source/_posts/old/photo.png'), null)
    assert.deepEqual(plan.changes.get('source/_posts/new/photo.png'), { sha: 'picture-sha', mode: '100644' })
    const acknowledged = m.acknowledgeCommit(sent, sent, plan.indexRaw, 'next', plan.changes)
    assert.equal(acknowledged.assets[0].source, '_posts/new/photo.png')
    assert.equal(acknowledged.fileRefs['_posts/new/photo.png'].sha, 'picture-sha')
    assert.equal(acknowledged.fileRefs['_posts/old/photo.png'], undefined)
    await assert.rejects(m.planCommit(sent, { ...snapshot, fileRefs: { ...snapshot.fileRefs, '_posts/new/photo.png': { sha: 'occupied' } } }), /图片目录已存在/)
})

test('synced deletions retain a recoverable local original and do not keep re-uploading unused draft images', async () => {
    const [m] = await modules
    const doc = m.createDocument({ source: '_posts/deleted.md' })
    doc.baseRaw = doc.raw; doc.baseSource = doc.source; doc.deleted = true
    const index = { version: 1, documents: [{ documentId: doc.documentId, kind: 'Post', source: doc.source, fingerprint: await m.fingerprint(doc.raw) }] }
    const sent = { ...m.createWorkspace(config), documents: [doc], assets: [{ key: 'unused.png', source: 'images/unused.png', pending: true }] }
    const snapshot = { documents: [doc], index, indexRaw: JSON.stringify(index) }
    const plan = await m.planCommit(sent, snapshot)
    assert.equal(plan.changes.has('source/images/unused.png'), false)
    const acknowledged = m.acknowledgeCommit(sent, sent, plan.indexRaw, 'next', plan.changes)
    assert.equal(acknowledged.documents.length, 1)
    assert.equal(acknowledged.documents[0].raw, doc.raw)
    assert.equal(m.isDirty(acknowledged.documents[0]), false)
    assert.equal(acknowledged.assets[0].pending, true)
    const emptySnapshot = { documents: [], head: 'next', indexRaw: plan.indexRaw, index: JSON.parse(plan.indexRaw) }
    const pulled = m.mergeSnapshot(acknowledged, emptySnapshot)
    assert.equal((await m.planCommit(pulled, emptySnapshot)).changes.size, 0)
    pulled.documents[0].deleted = false
    const restored = await m.planCommit(pulled, emptySnapshot)
    assert.equal(restored.changes.get('source/_posts/deleted.md').content, doc.raw)
    assert.equal(JSON.parse(restored.indexRaw).documents[0].documentId, doc.documentId)
})

test('backup import retains the current draft and restores a different version as a copy with its images', async () => {
    const [, { WorkspaceStore }] = await modules
    const storage = memoryStorage(), store = new WorkspaceStore(storage, memoryCredentials())
    await store.load()
    const id = await store.create(); await store.editBody(id, '本机原稿')
    const backup = { version: 1, state: clone(store.state), assets: { 'backup.png': 'aW1hZ2U=' } }
    backup.state.workspaces[0].documents[0].raw += '\n备份版本 ![](/images/backup.png)'
    backup.state.workspaces[0].assets.push({ key: 'backup.png', source: 'images/backup.png', pending: true })
    await store.importBackup(backup)
    assert.equal(store.workspace().documents.length, 2)
    assert.equal(store.workspace().documents[0].documentId, id)
    assert.ok(store.workspace().documents[0].raw.endsWith('本机原稿'))
    assert.notEqual(store.workspace().documents[1].documentId, id)
    assert.ok(store.workspace().documents[1].raw.includes('备份版本'))
    assert.equal(await storage.readAsset('backup.png'), 'aW1hZ2U=')
    await assert.rejects(store.importBackup({ ...backup, assets: { 'backup.png': 'ZGlmZmVyZW50' } }), /同名图片/)
    const broken = clone(backup)
    broken.state.workspaces[0].assets[0].key = '../unsafe'
    await assert.rejects(store.importBackup(broken), /图片数据损坏/)
})

test('GitHub snapshot decoding preserves BOM bytes and rejects truncated repository trees', async () => {
    const [, , { GitHubRepository }] = await modules
    const raw = '\uFEFF---\r\ntitle: 原文\r\n---\r\n正文'
    let truncated = false
    const fakeFetch = async url => ({ ok: true, status: 200, json: async () => {
        if (url.includes('/git/ref/')) return { object: { sha: 'head' } }
        if (url.includes('/git/commits/')) return { tree: { sha: 'tree' } }
        if (url.includes('/git/trees/')) return { truncated, tree: [{ path: 'source/_posts/a.md', sha: 'blob', mode: '100644', type: 'blob', size: 100 }] }
        return { encoding: 'base64', content: Buffer.from(raw).toString('base64') }
    } })
    const repository = new GitHubRepository(config, 'test-token', fakeFetch)
    assert.equal((await repository.readSnapshot()).documents[0].raw, raw)
    truncated = true
    await assert.rejects(repository.readSnapshot(), /未能完整读取/)
})

test('private repository images larger than the Contents inline limit load through their blob SHA', async () => {
    const [, , { GitHubRepository }] = await modules
    const requested = []
    const repository = new GitHubRepository(config, 'test-token', async url => {
        requested.push(url)
        return { ok: true, status: 200, json: async () => url.includes('/contents/')
            ? { type: 'file', encoding: 'none', content: '', sha: 'image-sha', size: 2 * 1024 * 1024 }
            : { encoding: 'base64', content: 'aW1hZ2U=', size: 5 } }
    })
    assert.equal(Buffer.from((await repository.readAsset('images/a.png')).bytes).toString(), 'image')
    assert.equal(requested.length, 2)
    requested.length = 0
    assert.equal((await repository.readAsset('images/a.png', 'image-sha')).sha, 'image-sha')
    assert.equal(requested.length, 1)
    assert.ok(requested[0].endsWith('/git/blobs/image-sha'))
})
