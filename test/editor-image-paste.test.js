const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseDocument, DomUtils } = require('htmlparser2');
const clipboardImages = import('../client/src/components/BlogEditor/clipboardImages.mjs');

// The production parser is the browser's DOMParser; supply parsed HTML in Node.
function parseHTML(html) {
    const document = parseDocument(html);
    const body = DomUtils.findOne(element => element.name === 'body', document.children, true) || document;
    const elements = DomUtils.getElementsByTagName('*', body.children, true);
    return { body: {
        textContent: DomUtils.textContent(body),
        querySelectorAll: selector => elements.filter(element => selector === '*' || element.name === selector)
            .map(element => ({ tagName: element.name.toUpperCase() })),
    } };
}

function pasteEvent(files, content = {}, useFiles = false) {
    return {
        prevented: false,
        preventDefault() { this.prevented = true; },
        clipboardData: {
            types: [...Object.keys(content), ...(files.length ? ['Files'] : [])],
            getData: type => content[type] || '',
            items: useFiles ? [] : files.map(file => ({ getAsFile: () => file })),
            files,
        },
    };
}

function createEditor(content = []) {
    let nextId = 1;
    const blocks = [{ id: 'initial', type: 'paragraph', content, props: {}, children: [] }];
    const uploads = [];
    let cursor = blocks[0];
    const materialize = partial => ({ id: `image-${nextId++}`, content: undefined, children: [], ...partial });
    return {
        blocks, uploads,
        getTextCursorPosition: () => ({ block: cursor }),
        setTextCursorPosition: block => { cursor = typeof block === 'string' ? blocks.find(item => item.id === block) : block; },
        getBlock: id => blocks.find(block => block.id === id),
        updateBlock(target, partial) {
            const block = blocks.find(item => item.id === (typeof target === 'string' ? target : target.id));
            assert.ok(block, 'Only existing blocks can be updated');
            Object.assign(block, { ...partial, props: { ...block.props, ...partial.props } });
            if (partial.type === 'image') block.content = undefined;
            return block;
        },
        insertBlocks(partials, target) {
            const inserted = partials.map(materialize);
            const position = blocks.findIndex(block => block.id === (typeof target === 'string' ? target : target.id));
            blocks.splice(position + 1, 0, ...inserted);
            return inserted;
        },
        removeBlocks(ids) { ids.forEach(id => blocks.splice(blocks.findIndex(block => block.id === id), 1)); },
        uploadFile(file, blockId) {
            return new Promise((resolve, reject) => uploads.push({ file, blockId, resolve, reject }));
        },
    };
}

const image = name => ({ name, type: 'image/png' });
const settleUploads = () => new Promise(resolve => setImmediate(resolve));

test('uploads image files when image-only HTML would otherwise win over Files', async () => {
    const { handleClipboardImagePaste } = await clipboardImages;
    const editor = createEditor();
    const file = image('image.png');
    const event = pasteEvent([file], { 'text/html': '<html><body><div><img src="file:///temporary/image.png" alt="image.png"></div></body></html>' });
    assert.equal(handleClipboardImagePaste({ event, editor }, parseHTML), true);
    assert.equal(event.prevented, true);
    assert.equal(editor.blocks.length, 1);
    assert.equal(editor.blocks[0].props.url, '');
    assert.equal(editor.uploads[0].file, file);
    assert.equal(editor.uploads[0].blockId, editor.blocks[0].id);
    editor.uploads[0].resolve('/images/uploaded.png');
    await settleUploads();
    assert.equal(editor.blocks[0].props.url, '/images/uploaded.png');
});

test('preserves text, rich content, internal BlockNote copies and non-image files for the default handler', async () => {
    const { handleClipboardImagePaste } = await clipboardImages;
    for (const event of [
        pasteEvent([], { 'text/plain': '文章内容' }),
        pasteEvent([image('image.png')], { 'text/html': '<p>保留这段文字</p><img src="blob:temporary">' }),
        pasteEvent([image('image.png')], { 'text/plain': '说明', 'text/html': '<img src="blob:temporary">' }),
        pasteEvent([image('image.png')], { 'text/html': '<img src="blob:temporary"><video src="video.mp4"></video>' }),
        pasteEvent([image('image.png')], { 'text/html': '<a href="https://example.test"><img src="blob:temporary"></a>' }),
        pasteEvent([image('image.png')], { 'blocknote/html': '<div>BlockNote content</div>', 'text/html': '<img src="blob:temporary">' }),
        pasteEvent([image('image.png'), { name: 'notes.txt', type: 'text/plain' }]),
    ]) {
        const editor = createEditor();
        assert.equal(handleClipboardImagePaste({ event, editor }, parseHTML), undefined);
        assert.equal(event.prevented, false);
        assert.equal(editor.uploads.length, 0);
        assert.equal(editor.blocks.length, 1);
        assert.equal(editor.blocks[0].type, 'paragraph');
    }
});

test('inserts multiple and consecutive clipboard images in paste order before uploads complete', async () => {
    const { handleClipboardImagePaste } = await clipboardImages;
    const editor = createEditor([{ type: 'text', text: 'Keep existing paragraph' }]);
    const files = ['first.png', 'second.png', 'third.png'].map(image);
    assert.equal(handleClipboardImagePaste({ event: pasteEvent(files.slice(0, 2), {}, true), editor }), true);
    assert.equal(handleClipboardImagePaste({ event: pasteEvent(files.slice(2)), editor }), true);
    assert.deepEqual(editor.blocks.slice(1).map(block => block.props.name), files.map(file => file.name));
    assert.equal(editor.uploads.length, 3);
    editor.uploads[2].resolve('/images/third.png');
    editor.uploads[0].resolve('/images/first.png');
    editor.uploads[1].resolve('/images/second.png');
    await settleUploads();
    assert.deepEqual(editor.blocks.slice(1).map(block => block.props.url), files.map(file => `/images/${file.name}`));
    assert.equal(editor.blocks[0].content[0].text, 'Keep existing paragraph');
});

test('handles upload failure without an unhandled rejection or a permanent loading block', async () => {
    const { handleClipboardImagePaste } = await clipboardImages;
    const editor = createEditor();
    handleClipboardImagePaste({ event: pasteEvent([image('image.png')]), editor });
    editor.uploads[0].reject(new Error('Upload unavailable'));
    await settleUploads();
    assert.equal(editor.blocks.length, 0);
});

test('does not recreate a deleted placeholder when its upload finishes', async () => {
    const { handleClipboardImagePaste } = await clipboardImages;
    const editor = createEditor();
    handleClipboardImagePaste({ event: pasteEvent([image('image.png')]), editor });
    editor.removeBlocks([editor.uploads[0].blockId]);
    editor.uploads[0].resolve('/images/uploaded.png');
    await settleUploads();
    assert.equal(editor.blocks.length, 0);
});

test('keeps code-block image pastes under the default code handler', async () => {
    const { handleClipboardImagePaste } = await clipboardImages;
    const editor = createEditor();
    editor.blocks[0].type = 'codeBlock';
    assert.equal(handleClipboardImagePaste({ event: pasteEvent([image('image.png')]), editor }), undefined);
    assert.equal(editor.uploads.length, 0);
});
