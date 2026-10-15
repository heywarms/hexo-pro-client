const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const registerImageApi = require('../hexo-pro/image_api');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64');

async function fixture(t) {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'hexopro-editor-image-'));
    const source = path.join(base, 'source');
    await fs.mkdir(source);
    const routes = new Map();
    const previousConfig = global.hexoProStorageConfig;
    global.hexoProStorageConfig = { type: 'local', customPath: 'images' };
    t.after(async () => {
        global.hexoProStorageConfig = previousConfig;
        await fs.rm(base, { recursive: true, force: true });
    });
    registerImageApi(null, { source_dir: source, config: { url: 'https://published.example/blog' } },
        (name, handler) => routes.set(name, handler));
    const request = async (route, options = {}) => {
        let result;
        const headers = {};
        await routes.get(route)({ method: 'GET', headers: {}, query: {}, body: {}, ...options }, {
            done: data => { result = { status: 200, data }; },
            send: (status, message) => { result = { status, message }; },
            setHeader: (name, value) => { headers[name] = value; },
            end: data => { result = { status: 200, data, headers }; },
        });
        return result;
    };
    const writeImage = async (name, data = png) => {
        const target = path.join(source, name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, data);
    };
    return { base, source, request, writeImage };
}

test('new local uploads can be previewed immediately without Hexo generation or deployment', async t => {
    const { source, request } = await fixture(t);
    const upload = await request('images/upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: { data: `data:image/png;base64,${png.toString('base64')}`, filename: 'image.png', storageType: 'local' },
    });
    assert.equal(upload.data.code, 0);
    assert.equal(upload.data.path, '/images/image.png');
    assert.equal(upload.data.url, 'https://published.example/blog/images/image.png');
    assert.deepEqual(await fs.readFile(path.join(source, 'images/image.png')), png);
    const preview = await request('images/file', { query: { path: upload.data.path } });
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.data, png);
    assert.equal(preview.headers['Content-Type'], 'image/png');
    assert.equal(preview.headers['Content-Length'], png.length);
    assert.equal(preview.headers['X-Content-Type-Options'], 'nosniff');
});

test('previews encoded Chinese and space filenames and source images outside the current image folder', async t => {
    const { request, writeImage } = await fixture(t);
    await writeImage('old-assets/喜欢的 头像.PNG');
    for (const imagePath of ['/old-assets/喜欢的 头像.PNG', '/old-assets/' + encodeURIComponent('喜欢的 头像.PNG')]) {
        const preview = await request('images/file', { query: { path: imagePath } });
        assert.equal(preview.status, 200);
        assert.deepEqual(preview.data, png);
        assert.equal(preview.headers['Content-Type'], 'image/png');
    }
});

test('rejects traversal, external symlinks and invalid image paths', async t => {
    const { base, source, request, writeImage } = await fixture(t);
    await fs.writeFile(path.join(base, 'outside.png'), png);
    await fs.symlink(path.join(base, 'outside.png'), path.join(source, 'linked.png'));
    await fs.symlink(base, path.join(source, 'outside'));
    await writeImage('valid.png');
    for (const imagePath of ['../outside.png', '/images/../../outside.png', '/%2e%2e/outside.png',
        '/linked.png', '/outside/outside.png', 'C:\\outside.png', '/images\\..\\outside.png',
        'https://published.example/outside.png', '/%00valid.png', '/%broken.png']) {
        const preview = await request('images/file', { query: { path: imagePath } });
        assert.equal(preview.status, 400, imagePath);
    }
    await fs.symlink(path.join(source, 'valid.png'), path.join(source, 'internal.png'));
    assert.equal((await request('images/file', { query: { path: '/internal.png' } })).status, 200);
});

test('validates the method, file type and existence before returning image content', async t => {
    const { source, request, writeImage } = await fixture(t);
    await writeImage('image.png');
    await writeImage('private.txt', 'private content');
    await fs.symlink(path.join(source, 'private.txt'), path.join(source, 'private.png'));
    await fs.mkdir(path.join(source, 'directory.png'));
    for (const method of ['POST', 'DELETE', 'HEAD']) {
        assert.equal((await request('images/file', { method, query: { path: '/image.png' } })).status, 405);
    }
    for (const imagePath of [undefined, '', ['image.png'], '/private.txt', '/private.png']) {
        assert.equal((await request('images/file', { query: { path: imagePath } })).status, 400);
    }
    assert.equal((await request('images/file', { query: { path: '/missing.png' } })).status, 404);
    assert.equal((await request('images/file', { query: { path: '/directory.png' } })).status, 404);
});
