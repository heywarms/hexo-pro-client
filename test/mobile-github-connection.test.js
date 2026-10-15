const { test } = require('node:test')
const assert = require('node:assert/strict')

const modules = Promise.all([
    import('../client/src/mobile/githubRepository.mjs'),
    import('../client/src/mobile/workspaceStore.mjs'),
    import('../client/src/mobile/documentModel.mjs'),
])
const config = { owner: 'example', repo: 'blog', branch: 'writing/中文', blogDir: '', sourceDir: 'source' }
const success = () => ({ ok: true, status: 200, json: async () => ({ object: { sha: 'head' } }) })

test('the default transport keeps the global fetch receiver required by iOS WebKit', async t => {
    const [{ GitHubRepository }] = await modules
    let requests = 0
    t.mock.method(globalThis, 'fetch', async function () {
        if (this !== globalThis) throw new TypeError('Can only call Window.fetch on instances of Window')
        requests++
        return success()
    })
    // Do not inject a mock into the constructor: exercise the production default transport.
    const repository = new GitHubRepository(config, 'test-only-token')
    await repository.checkConnection()
    await repository.request('/git/refs/heads/main', 'PATCH', { sha: 'head', force: false })
    assert.equal(requests, 2)
})

test('connection check verifies the exact branch with a read-only authenticated request', async () => {
    const [{ GitHubRepository }] = await modules
    const requests = []
    const repository = new GitHubRepository(config, ' github_pat_test_only \n', async (url, options) => {
        requests.push({ url, options })
        return success()
    })
    assert.deepEqual(await repository.checkConnection(), { owner: config.owner, repo: config.repo, branch: config.branch })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'https://api.github.com/repos/example/blog/git/ref/heads/writing/%E4%B8%AD%E6%96%87')
    assert.equal(requests[0].options.method, 'GET')
    assert.equal(requests[0].options.headers.Authorization, 'Bearer github_pat_test_only')
    assert.equal(requests[0].options.body, undefined)
})

test('invalid header characters are reported as credential errors before making a request', async () => {
    const [{ GitHubRepository }] = await modules
    for (const token of ['手机凭据', 'github_pat_abc\ndef', 'github_pat_ab\u200bcd', 'Bearer github_pat_test']) {
        assert.throws(() => new GitHubRepository(config, token, () => assert.fail('must not request')), /凭据格式/)
    }
    assert.throws(() => new GitHubRepository(config, '  '), /填写 GitHub 凭据/)
})

test('interrupted reads retry once, but writes and HTTP permission errors are never replayed', async () => {
    const [{ GitHubRepository }] = await modules
    let reads = 0
    const repository = new GitHubRepository(config, 'test-only-token', async () => {
        if (++reads === 1) throw new TypeError('Load failed')
        return success()
    })
    await repository.checkConnection()
    assert.equal(reads, 2)

    let writes = 0
    const offline = new GitHubRepository(config, 'test-only-token', async () => {
        writes++
        throw new TypeError('Load failed')
    })
    await assert.rejects(offline.request('/git/refs/heads/main', 'PATCH', { sha: 'commit', force: false }), /api.github.com/)
    assert.equal(writes, 1)

    for (const [status, message] of [[401, /凭据无效/], [403, /没有仓库权限/], [404, /没有找到仓库/]]) {
        let count = 0
        const denied = new GitHubRepository(config, 'test-only-token', async () => {
            count++
            return { ok: false, status }
        })
        await assert.rejects(denied.checkConnection(), error => error.status === status && message.test(error.message))
        assert.equal(count, 1)
    }
})

test('persistent transport failures stop after one retry and preserve the timeout distinction', async () => {
    const [{ GitHubRepository }] = await modules
    let attempts = 0
    const offline = new GitHubRepository(config, 'test-only-token', async () => {
        attempts++
        throw new TypeError('Load failed')
    })
    await assert.rejects(offline.checkConnection(), /api.github.com.*本地修改已保留/)
    assert.equal(attempts, 2)
    let timeouts = 0
    const timeout = new GitHubRepository(config, 'test-only-token', async () => {
        timeouts++
        throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    })
    await assert.rejects(timeout.checkConnection(), /超时/)
    assert.equal(timeouts, 1)
})

test('invalid JSON is not reported as a network or credential error', async () => {
    const [{ GitHubRepository }] = await modules
    const repository = new GitHubRepository(config, 'test-only-token', async () => ({
        ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token') },
    }))
    await assert.rejects(repository.checkConnection(), /返回的内容无法读取/)
})

test('testing a connection leaves workspaces, drafts, credentials and the remote unchanged', async () => {
    const [, { WorkspaceStore }, { workspaceKey }] = await modules
    let saved = null
    const vault = new Map()
    const checked = []
    const store = new WorkspaceStore({
        readState: async () => null,
        writeState: async state => { saved = structuredClone(state) },
    }, {
        get: async key => vault.get(key),
        set: async (key, token) => { vault.set(key, token) },
    }, (config, token) => ({
        checkConnection: async () => { checked.push({ config, token }); return config },
        commit: async () => assert.fail('connection check must not publish'),
        readSnapshot: async () => assert.fail('connection check must not sync articles'),
    }))
    await store.load()
    const id = await store.create()
    await store.editBody(id, '保留本机原稿')
    const before = structuredClone(saved)
    vault.set(workspaceKey(config), 'saved-credential')
    await store.checkConnection(config, '')
    await store.checkConnection(config, ' new-credential ')
    assert.deepEqual(checked.map(item => item.token), ['saved-credential', 'new-credential'])
    assert.equal(vault.get(workspaceKey(config)), 'saved-credential')
    assert.deepEqual(saved, before)
    assert.deepEqual(store.state, before)
    await assert.rejects(store.checkConnection({ ...config, repo: 'another' }, ''), /填写 GitHub 凭据/)
    await assert.rejects(store.connect(config, '错误的中文凭据'), /凭据格式/)
    assert.deepEqual(saved, before)
    assert.equal(vault.get(workspaceKey(config)), 'saved-credential')
})
