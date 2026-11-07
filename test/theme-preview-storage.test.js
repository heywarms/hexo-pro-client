const assert = require('node:assert/strict');
const { test } = require('node:test');
const storage = import('../client/src/components/BlogEditor/previewStorage.mjs');

function sandboxedWindow() {
    const win = {};
    for (const name of ['localStorage', 'sessionStorage']) {
        Object.defineProperty(win, name, {
            configurable: true,
            get() { throw new Error(`Failed to read the '${name}' property from 'Window': The document is sandboxed`); }
        });
    }
    return win;
}

// the script reads the global `window`, which is the iframe's own window at runtime
const runInPreview = (script, win) => new Function('window', script)(win);

test('gives a sandboxed theme preview working in-memory storage', async () => {
    const { previewStorageScript } = await storage;
    const win = sandboxedWindow();
    runInPreview(previewStorageScript, win);
    win.localStorage.setItem('theme', 'dark');
    win.localStorage.setItem('count', 2);
    assert.equal(win.localStorage.getItem('theme'), 'dark');
    assert.equal(win.localStorage.getItem('count'), '2');
    assert.equal(win.localStorage.getItem('missing'), null);
    assert.equal(win.localStorage.length, 2);
    assert.equal(win.localStorage.key(0), 'theme');
    assert.equal(win.localStorage.key(5), null);
    win.localStorage.removeItem('theme');
    assert.equal(win.localStorage.length, 1);
    win.localStorage.clear();
    assert.equal(win.localStorage.length, 0);
    assert.equal(win.sessionStorage.getItem('theme'), null);
});

test('leaves readable storage untouched', async () => {
    const { previewStorageScript } = await storage;
    const real = { getItem: () => 'real' };
    const win = { localStorage: real, sessionStorage: real };
    runInPreview(previewStorageScript, win);
    assert.equal(win.localStorage, real);
    assert.equal(win.sessionStorage, real);
});
