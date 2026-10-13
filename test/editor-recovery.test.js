const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRecoverableSave } = require('../client/src/components/BlogEditor/draftRecovery');

function fixture() {
    const records = new Map();
    const storage = {
        put: async record => records.set(record.id, structuredClone(record)),
        remove: async id => records.delete(id),
        list: async key => [...records.values()].filter(record => record.documentKey === key),
    };
    const create = (sessionId, save, overrides = {}) => createRecoverableSave(save, {
        documentKey: 'post:stable-id', sessionId, storage, delay: 60000, onStatus() {}, onError() {}, ...overrides,
    });
    return { records, storage, create };
}

test('failed edits survive leaving and reopening, including their original server revision', async () => {
    const { create, records } = fixture();
    const first = create('first-tab', async () => { throw new Error('Offline'); });
    first.setRevision('old-server-version');
    first.enqueue({ title: 'Unsaved title', _content: 'Unsaved body' });
    await assert.rejects(first.flush(), /Offline/);
    const writes = [];
    const reopened = create('reopened', async update => { writes.push(update); return { revision: 'new-server-version' }; });
    const [record] = await reopened.list();
    assert.equal(record.baseRevision, 'old-server-version');
    assert.equal(record.update._content, 'Unsaved body');
    reopened.setRevision('someone-else-edited-on-server');
    assert.deepEqual(await reopened.restore(record), { title: 'Unsaved title', _content: 'Unsaved body' });
    await reopened.flush();
    assert.equal(writes[0].baseRevision, 'old-server-version');
    assert.equal(records.size, 0);
});

test('an earlier save acknowledges only its own fields and advances the revision for newer edits', async () => {
    const { create, records } = fixture();
    let release, began;
    const started = new Promise(resolve => { began = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    const writes = [];
    const queue = create('editor', async update => {
        writes.push(update);
        if (writes.length === 1) { began(); await blocked; return { revision: 'v2' }; }
        throw new Error('Offline');
    });
    queue.setRevision('v1');
    queue.enqueue({ _content: 'First' });
    const flushing = queue.flush();
    await started;
    queue.enqueue({ _content: 'Newest', title: 'Latest title' });
    release();
    await assert.rejects(flushing, /Offline/);
    assert.equal(writes[1].baseRevision, 'v2');
    const saved = [...records.values()][0];
    assert.deepEqual(saved.update, { _content: 'Newest', title: 'Latest title' });
    assert.equal(saved.baseRevision, 'v2');
});

test('saving one tab cannot delete another tab recovery record', async () => {
    const { create, records } = fixture();
    const first = create('one', async () => { throw new Error('Offline'); });
    first.enqueue({ _content: 'Tab one' });
    await assert.rejects(first.flush(), /Offline/);
    const second = create('two', async () => ({ revision: 'v2' }));
    second.enqueue({ _content: 'Tab two' });
    await second.flush();
    assert.equal(records.size, 1);
    assert.equal([...records.values()][0].update._content, 'Tab one');
});

test('local storage failure prevents sending a write without a durable recovery copy', async () => {
    const { create, storage } = fixture();
    let writes = 0;
    storage.put = async () => { throw new Error('Disk full'); };
    const queue = create('disk-full', async () => { writes++; });
    queue.enqueue({ _content: 'Keep me' });
    await assert.rejects(queue.flush(), /Disk full/);
    assert.equal(writes, 0);
    assert.deepEqual(queue.snapshot(), { _content: 'Keep me' });
});

test('conflict errors are reported even when save is flushed by navigation or publish', async () => {
    const { create } = fixture();
    const errors = [];
    const queue = create('conflict', async () => { throw Object.assign(new Error('Changed remotely'), { code: 'REVISION_CONFLICT' }); }, {
        onError: error => errors.push(error.code),
    });
    queue.enqueue({ _content: 'Local changes' });
    await assert.rejects(queue.flush(), /Changed remotely/);
    assert.deepEqual(errors, ['REVISION_CONFLICT']);
});

test('retry after disk recovery persists and saves the draft without another keystroke', async () => {
    const { create, storage, records } = fixture();
    const put = storage.put;
    let fail = true, writes = 0;
    storage.put = async record => { if (fail) throw new Error('Disk full'); return put(record); };
    const queue = create('disk-retry', async () => { writes++; return { revision: 'saved' }; });
    queue.enqueue({ _content: 'Recover after disk full' });
    await assert.rejects(queue.flush(), /Disk full/);
    fail = false;
    await queue.flush();
    assert.equal(writes, 1);
    assert.equal(records.size, 0);
    assert.equal(queue.hasPending(), false);
});
