const { test } = require('node:test');
const assert = require('node:assert/strict');

test('startup recovery validates the backup before replacing a corrupt workspace', async () => {
    const { recoverWorkspace } = await import('../client/src/mobile/workspaceRecovery.mjs');
    const { initialState, createDocument } = await import('../client/src/mobile/documentModel.mjs');
    const state = initialState();
    state.workspaces[0].documents.push(createDocument({ title: 'Recovered article' }));
    let writes = 0;
    const storage = { async replaceRecoveredState(next) { writes++; assert.deepEqual(next, state); } };
    await assert.rejects(recoverWorkspace(storage, '{corrupt'), /无法读取/);
    await assert.rejects(recoverWorkspace(storage, JSON.stringify({ version: 1, workspaces: [] })), /损坏/);
    assert.equal(writes, 0);
    assert.deepEqual(await recoverWorkspace(storage, JSON.stringify(state)), state);
    assert.equal(writes, 1);
});

test('startup recovery rejects an incomplete image bundle before replacing any files', async () => {
    const { recoverWorkspace } = await import('../client/src/mobile/workspaceRecovery.mjs');
    const { initialState } = await import('../client/src/mobile/documentModel.mjs');
    const state = initialState();
    state.workspaces[0].assets = [{ key: 'image.png', source: 'images/image.png', pending: true }];
    let writes = 0;
    const storage = { async replaceRecoveredState(next, assets) { writes++; assert.equal(assets['image.png'], 'aW1hZ2U='); } };
    await assert.rejects(recoverWorkspace(storage, JSON.stringify({ version: 1, state, assets: {} }), true), /缺少文章图片/);
    assert.equal(writes, 0);
    await recoverWorkspace(storage, JSON.stringify({ version: 1, state, assets: { 'image.png': 'aW1hZ2U=' } }), true);
    assert.equal(writes, 1);
});
