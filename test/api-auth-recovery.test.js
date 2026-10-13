const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createRecoverableSave } = require('../client/src/components/BlogEditor/draftRecovery');

function fixture(pathname = '/pro/post/example') {
    const handlers = {};
    const logs = [];
    const values = new Map([['hexoProToken', 'TEST_SESSION_SECRET']]);
    const service = { interceptors: {
        request: { use(handler) { handlers.request = handler; } },
        response: { use(success, failure) { handlers.response = success; handlers.failure = failure; } },
    } };
    const window = { location: { pathname, href: pathname }, electronAPI: {} };
    const source = fs.readFileSync(path.resolve(__dirname, '../client/src/utils/api.ts'), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const context = { exports: {}, window, localStorage: { getItem: key => values.get(key), removeItem: key => values.delete(key) },
        console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
        require(name) {
            if (name === 'axios') return { create: () => service };
            if (name === 'antd') return { message: { error: (...args) => logs.push(args) } };
            throw new Error('Unexpected module ' + name);
        } };
    vm.runInNewContext(compiled, context);
    return { handlers, logs, values, window };
}

for (const response of [{ status: 200, data: { code: 401, msg: 'token unauthorized' } }, { status: 401, data: {} }]) {
    test(`HTTP ${response.status} unauthorized responses reject the real interceptor and retain recoverable edits`, async () => {
        const f = fixture();
        const records = new Map();
        const queue = createRecoverableSave(async () => (await f.handlers.response(response)).data, {
            documentKey: 'post:test', sessionId: 'current', delay: 60000, onStatus() {}, onError() {},
            storage: { put: async record => records.set(record.id, structuredClone(record)), remove: async id => records.delete(id), list: async () => [...records.values()] },
        });
        queue.setRevision('original-revision');
        queue.enqueue({ title: 'Unsaved title', _content: 'Keep this draft after login expires' });
        await assert.rejects(queue.flush(), error => error.code === 401 && error.response === response);
        assert.equal(queue.hasPending(), true);
        assert.equal(queue.snapshot()._content, 'Keep this draft after login expires');
        assert.equal(records.size, 1);
        assert.equal([...records.values()][0].baseRevision, 'original-revision');
        assert.equal(f.values.has('hexoProToken'), false);
        assert.match(f.window.location.href, /token_invalid_or_missing/);
        assert.equal(f.logs.length, 0);
    });
}

test('transport-level 401 rejects without a redirect loop or credential logging on the desktop login page', async () => {
    const f = fixture('/pro/login');
    const response = { status: 401, data: { msg: 'Please sign in' } };
    await assert.rejects(f.handlers.failure({ response, config: { headers: { Authorization: 'Bearer TEST_SESSION_SECRET' } } }),
        error => error.code === 401 && error.response === response);
    assert.equal(f.window.location.href, '/pro/login');
    assert.equal(f.values.has('hexoProToken'), false);
    assert.equal(f.logs.length, 0);
});

test('successful responses and preconfigured authentication stay compatible and do not log request credentials', async () => {
    const f = fixture();
    const response = { status: 200, data: { post: { revision: 'new-revision' } } };
    assert.equal(f.handlers.response(response), response);
    const injected = f.handlers.request({ headers: {}, url: '/private?access_token=URL_SECRET' });
    assert.equal(injected.headers.Authorization, 'Bearer TEST_SESSION_SECRET');
    const configured = f.handlers.request({ headers: { Authorization: 'Bearer OTHER_SECRET' } });
    assert.equal(configured.headers.Authorization, 'Bearer OTHER_SECRET');
    assert.equal(f.logs.length, 0);
    assert.equal(f.values.has('hexoProToken'), true);
});
