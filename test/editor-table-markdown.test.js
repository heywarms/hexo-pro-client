const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const tables = import('../client/src/components/BlogEditor/tableMarkdown.mjs');
const safety = import('../client/src/components/BlogEditor/markdownSafety.mjs');

const legacy = '| | 时间 | 镜头 | 文字 |\n| --- | --- | --- | --- |\n'
    + '| **开头** | 0 到 3 秒 | 画面 | 开场 |\n'
    + '| **痛点** | 3 到 10 秒 | 提问 | 第一点\\\n第二点\\\n第三点 |\n'
    + '| **结尾** | 30 到 40 秒 | | 结束 |\n';
const normalized = legacy.replace('第一点\\\n第二点\\\n第三点', '第一点<br>第二点<br>第三点');

test('recovers legacy table cell breaks when opening a saved document without a block snapshot', async () => {
    const { normalizeTableMarkdown } = await tables;
    const { getMarkdownIssue, preservesMarkdown } = await safety;
    const paragraph = '\n**正文**\\\n保留正文的换行\n';
    assert.equal(normalizeTableMarkdown(legacy + paragraph), normalized + paragraph);
    assert.equal(normalizeTableMarkdown(normalized), normalized);
    assert.equal(normalizeTableMarkdown(legacy.replaceAll('\n', '\r\n')), normalized.replaceAll('\n', '\r\n'));
    assert.equal(getMarkdownIssue(legacy), '');
    assert.equal(getMarkdownIssue(normalized), '');
    assert.equal(preservesMarkdown(legacy, normalized), true);
    assert.equal(preservesMarkdown(legacy, normalized.replace('<br>第二点', '第二点')), false);
    assert.equal(preservesMarkdown(legacy, normalized.replace('第三点', '修改后的内容')), false);
    assert.equal(preservesMarkdown(legacy, normalized.replace('| **结尾** | 30 到 40 秒 | | 结束 |\n', '')), false);
});

test('only repairs complete legacy table rows and leaves code, escaped pipes and literal backslashes intact', async () => {
    const { normalizeTableMarkdown } = await tables;
    const header = '| A | B |\n| --- | --- |\n';
    const escapedPipe = header + '| A\\|B\\\nC | D |\n';
    assert.equal(normalizeTableMarkdown(escapedPipe), header + '| A\\|B<br>C | D |\n');
    for (const source of [
        '```md\n' + legacy + '```\n',
        legacy.split('\n').map(line => '    ' + line).join('\n'),
        '正文\\\n下一行\n',
        header + '| A\\\\\nB | C |\n',
        header + '| A | B |\\\n| C | D |\n',
        header + '| A\\\nB\n',
        header + '| A\\\nB | C | D |\n',
    ]) assert.equal(normalizeTableMarkdown(source), source, source);
});

test('allows only attribute-free line breaks inside tables and still detects dropped breaks', async () => {
    const { getMarkdownIssue, preservesMarkdown } = await safety;
    const table = cell => '| A |\n| --- |\n| ' + cell + ' |\n';
    for (const tag of ['<br>', '<br/>', '<br />', '<BR>']) {
        assert.equal(getMarkdownIssue(table('前' + tag + '后')), '');
        assert.equal(preservesMarkdown(table('前' + tag + '后'), table('前<br>后')), true);
        assert.equal(preservesMarkdown(table('前' + tag + '后'), table('前后')), false);
    }
    for (const source of [
        '正文<br>后文', table('前<br class="custom">后'), table('前<br onmouseover="alert(1)">后'),
        table('<span>内容</span>'), table('{% note info %}<br>内容'),
    ]) assert.ok(getMarkdownIssue(source), source);
    assert.equal(getMarkdownIssue(table('`literal <br>`')), '');
    assert.equal(preservesMarkdown(table('`literal <br>`'), table('literal <br>')), false);
});

test('exports breaks in header, styled, linked and nested table cells without mutating blocks or changing paragraph/code breaks', async () => {
    const { blocksToMarkdown } = await tables;
    const text = (text, styles = {}) => ({ type: 'text', text, styles });
    const blocks = [
        { type: 'paragraph', content: [text('正文\n下一行')], children: [{ type: 'table', content: {
            type: 'tableContent', headerRows: 1, rows: [
                { cells: [[text('表头\n第二行')], '另一\n列\uE000'] },
                { cells: [{ type: 'tableCell', props: { colspan: 1 }, content: [text('加粗\n换行', { bold: true }),
                    { type: 'link', href: 'https://example.test', content: [text('链接\n文字')] }] }, [text('a\nb', { code: true })]] },
            ],
        } }] },
        { type: 'codeBlock', content: [text('const x = 1;\nconst y = 2;')] },
    ];
    const original = structuredClone(blocks);
    let captured;
    const inline = content => typeof content === 'string' ? content : content.map(item => {
        if (item.type === 'link') return '[' + inline(item.content) + '](' + item.href + ')';
        const delimiter = item.styles?.code ? '`' : item.styles?.bold ? '**' : '';
        return delimiter + item.text + delimiter;
    }).join('');
    const editor = { document: blocks, blocksToMarkdownLossy(mapped) {
        captured = mapped;
        const rows = mapped[0].children[0].content.rows.map(row => '| ' + row.cells.map(cell => inline(cell.content || cell)).join(' | ') + ' |');
        return [rows[0], '| --- | --- |', ...rows.slice(1)].join('\n');
    } };
    const result = blocksToMarkdown(editor);
    assert.equal(result, '| 表头<br>第二行 | 另一<br>列\uE000 |\n| --- | --- |\n| **加粗<br>换行**[链接<br>文字](https://example.test) | `a`<br>`b` |');
    assert.deepEqual(blocks, original);
    assert.deepEqual(captured[0].content, original[0].content);
    assert.deepEqual(captured[1], { ...original[1], children: [] });
    assert.equal(captured[0].children[0].content.headerRows, 1);
    assert.deepEqual(captured[0].children[0].content.rows[1].cells[0].props, { colspan: 1 });
});

test('mobile preview renders table line breaks while skipping arbitrary HTML and preserving code examples', async () => {
    const { remarkTableLineBreaks } = await tables;
    const { default: ReactMarkdown } = await import('react-markdown');
    const { default: remarkGfm } = await import('remark-gfm');
    const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
        remarkPlugins: [remarkGfm, remarkTableLineBreaks], skipHtml: true,
        children: '| A | B |\n| --- | --- |\n| 前<br>后 | `literal <br>` |\n\n<script>alert(1)</script>',
    }));
    assert.match(html, /前<br\/>\n后/);
    assert.match(html, /<code>literal &lt;br&gt;<\/code>/);
    assert.doesNotMatch(html, /<script>|alert\(1\)/);
});
