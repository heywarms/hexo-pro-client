const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const imageMarkdown = import('../client/src/components/BlogEditor/imageMarkdown.mjs');
const safety = import('../client/src/components/BlogEditor/markdownSafety.mjs');

test('sized image HTML preserves filenames, alt text and width without allowing arbitrary HTML attributes', async () => {
    const { sizedImageHTML, parseSizedImageHTML } = await imageMarkdown;
    const { getMarkdownIssue, preservesMarkdown } = await safety;
    const image = { url: '/images/头像.png?a=1&b="2"', alt: '头像 <"小猫">\n&朋友', width: 320 };
    const markup = sizedImageHTML(image);
    assert.deepEqual(parseSizedImageHTML(markup), image);
    assert.equal(getMarkdownIssue(markup), '');
    assert.equal(preservesMarkdown(markup, markup + '\n'), true);
    assert.equal(preservesMarkdown(markup, sizedImageHTML({ ...image, width: 321 })), false);
    assert.equal(preservesMarkdown(markup, '![头像](/images/头像.png)'), false);
    for (const html of [
        '<img src="/a.png" alt="a" width="320" onerror="alert(1)">',
        '<img src="/a.png" alt="a" width="320" style="float:right">',
        '<img src="/a.png" alt="a" width="0">',
        '<img src="/a.png" alt="a" width="320"><script>alert(1)</script>',
        '<div><img src="/a.png" alt="a" width="320"></div>',
    ]) {
        assert.equal(parseSizedImageHTML(html), null);
        assert.ok(getMarkdownIssue(html));
    }
});

test('saves independent sizes for duplicate and nested images without changing the document or ordinary Markdown', async () => {
    const { blocksToMarkdownWithImageSizes } = await imageMarkdown;
    const blocks = [
        { type: 'image', props: { url: '/images/shared.png', name: 'Small [image]', previewWidth: 160 }, children: [] },
        { type: 'paragraph', content: 'Text', children: [
            { type: 'image', props: { url: '/images/shared.png', name: 'Large image', previewWidth: 480 }, children: [] },
        ] },
        { type: 'image', props: { url: '/images/original.png', name: 'Unchanged' }, children: [] },
        { type: 'codeBlock', content: '![Example](/images/shared.png)', children: [] },
    ];
    const original = structuredClone(blocks);
    const serialize = blocks => blocks.map(block => (block.type === 'image'
        ? `![${block.props.name}](${block.props.url})\n\n`
        : block.type === 'codeBlock' ? '```md\n' + block.content + '\n```\n' : 'Text\n\n') + serialize(block.children || [])).join('');
    const editor = { document: blocks, blocksToMarkdownLossy: serialize };
    const markdown = blocksToMarkdownWithImageSizes(editor);
    assert.match(markdown, /<img src="\/images\/shared.png" alt="Small \[image\]" width="160">/);
    assert.match(markdown, /<img src="\/images\/shared.png" alt="Large image" width="480">/);
    assert.ok(markdown.includes('![Unchanged](/images/original.png)'));
    assert.ok(markdown.includes('```md\n![Example](/images/shared.png)\n```'));
    assert.ok(!markdown.includes('hexopro.invalid'));
    assert.deepEqual(blocks, original);
});

test('mobile preview renders resized images while continuing to skip all other raw HTML', async () => {
    const { remarkSizedImages } = await imageMarkdown;
    const { default: ReactMarkdown } = await import('react-markdown');
    const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
        remarkPlugins: [remarkSizedImages], skipHtml: true,
        children: '<img src="/images/photo.png" alt="Photo" width="240">\n\n<div>Custom HTML</div>\n\n<script>alert(1)</script>',
    }));
    assert.match(html, /<img[^>]*src="\/images\/photo.png"[^>]*alt="Photo"[^>]*width="240"/);
    assert.doesNotMatch(html, /Custom HTML|<script>|alert\(1\)/);
});
