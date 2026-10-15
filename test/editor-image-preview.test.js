const assert = require('node:assert/strict');
const { test } = require('node:test');
const helpers = import('../client/src/components/BlogEditor/imageFiles.mjs');

test('keeps durable blog paths for local uploads and preserves signed remote URLs', async () => {
    const { getUploadedImageUrl } = await helpers;
    const result = { code: 0, path: '/images/喜欢的 头像#1?.png', url: 'https://blog.test/images/image.png' };
    assert.equal(getUploadedImageUrl(result, 'local'), '/images/%E5%96%9C%E6%AC%A2%E7%9A%84%20%E5%A4%B4%E5%83%8F%231%3F.png');
    assert.equal(getUploadedImageUrl({ code: 0, path: '/images/already%20encoded.png' }, 'local'), '/images/already%20encoded.png');
    const remote = 'https://storage.test/image.png?signature=a%2Fb&expires=100#preview';
    assert.equal(getUploadedImageUrl({ code: 200, url: remote, path: '/image.png' }, 'aliyun'), remote);
    assert.throws(() => getUploadedImageUrl({ code: 500, msg: '存储不可用' }, 'local'), /存储不可用/);
    assert.throws(() => getUploadedImageUrl({ code: 0 }, 'local'), /未返回地址/);
});

test('loads new local images through the authenticated API and reuses their preview URL', async () => {
    const { createLocalImageResolver } = await helpers;
    const requests = [];
    const revoked = [];
    const image = new Blob(['image'], { type: 'image/png' });
    const resolver = createLocalImageResolver({ get: async (url, options) => {
        requests.push({ url, options });
        return { data: image };
    } }, { createObjectURL: blob => { assert.equal(blob, image); return 'blob:preview'; }, revokeObjectURL: url => revoked.push(url) });
    assert.deepEqual(await Promise.all([resolver.resolve('/images/new.png'), resolver.resolve('/images/new.png')]), ['blob:preview', 'blob:preview']);
    assert.deepEqual(requests, [{ url: '/hexopro/api/images/file', options: { params: { path: '/images/new.png' }, responseType: 'blob' } }]);
    for (const url of ['https://cdn.test/image.png', '//cdn.test/image.png', 'data:image/png;base64,abc', 'blob:mobile', '']) {
        assert.equal(await resolver.resolve(url), url);
    }
    assert.equal(requests.length, 1);
    resolver.dispose();
    assert.deepEqual(revoked, ['blob:preview']);
});

test('retries failed previews and releases images that arrive after closing the editor', async () => {
    const { createLocalImageResolver } = await helpers;
    const revoked = [];
    let complete;
    let calls = 0;
    const resolver = createLocalImageResolver({ get: () => {
        calls++;
        return calls === 1 ? Promise.reject(new Error('offline')) : new Promise(resolve => { complete = resolve; });
    } }, { createObjectURL: () => 'blob:late', revokeObjectURL: url => revoked.push(url) });
    await assert.rejects(resolver.resolve('/images/new.png'), /offline/);
    const retry = resolver.resolve('/images/new.png');
    resolver.dispose();
    complete({ data: new Blob(['image'], { type: 'image/png' }) });
    assert.equal(await retry, '');
    assert.deepEqual(revoked, ['blob:late']);
    assert.equal(calls, 2);
});

test('does not turn an HTML error page into a broken image preview', async () => {
    const { createLocalImageResolver } = await helpers;
    const resolver = createLocalImageResolver({ get: async () => ({ data: new Blob(['not found'], { type: 'text/html' }) }) }, {
        createObjectURL: () => assert.fail('error pages must not be shown as images'), revokeObjectURL: () => {},
    });
    await assert.rejects(resolver.resolve('/images/missing.png'), /服务器未返回图片内容/);
});
