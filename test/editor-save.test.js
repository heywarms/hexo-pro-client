const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAutoSave } = require('../client/src/components/BlogEditor/autoSave');

test('keeps both title and content edited inside one autosave window', async () => {
    const writes = [];
    const queue = createAutoSave(async update => writes.push(update));
    queue.enqueue({ _content: 'New content' });
    queue.enqueue({ title: 'New title' });
    await queue.flush();
    assert.deepEqual(writes, [{ _content: 'New content', title: 'New title' }]);
    assert.equal(queue.hasPending(), false);
});

test('serializes saves and flush waits for the newest content before publishing', async () => {
    const writes = [];
    let release;
    const first = new Promise(resolve => { release = resolve; });
    const queue = createAutoSave(async update => {
        writes.push(update);
        if (writes.length === 1) await first;
    });
    queue.enqueue({ _content: 'First' });
    const flushing = queue.flush();
    await Promise.resolve();
    queue.enqueue({ _content: 'Latest', title: 'Title' });
    const secondFlush = queue.flush();
    assert.equal(writes.length, 1);
    release();
    await Promise.all([flushing, secondFlush]);
    assert.deepEqual(writes, [{ _content: 'First' }, { _content: 'Latest', title: 'Title' }]);
});

test('retains failed edits for retry and newer edits supersede the failed version', async () => {
    const writes = [];
    const statuses = [];
    let fail = true;
    const queue = createAutoSave(async update => {
        writes.push(update);
        if (fail) throw new Error('Offline');
    }, { onStatus: status => statuses.push(status) });
    queue.enqueue({ _content: 'First', title: 'Title' });
    await assert.rejects(queue.flush(), /Offline/);
    assert.equal(statuses.at(-1), 'error');
    assert.equal(queue.hasPending(), true);
    queue.enqueue({ _content: 'Latest' });
    fail = false;
    await queue.flush();
    assert.deepEqual(writes[1], { _content: 'Latest', title: 'Title' });
    assert.equal(statuses.at(-1), 'saved');
    assert.equal(queue.hasPending(), false);
});
