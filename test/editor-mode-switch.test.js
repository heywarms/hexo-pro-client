const assert = require('node:assert/strict');
const { test } = require('node:test');
const snapshots = import('../client/src/components/BlogEditor/blockSnapshot.mjs');
const safety = import('../client/src/components/BlogEditor/markdownSafety.mjs');

test('unchanged Markdown restores original blocks when re-importing would lose combined formatting', async () => {
    const { createBlockSnapshot } = await snapshots;
    const { preservesMarkdown } = await safety;
    const value = '**`测试`**\n';
    // BlockNote 0.55 exports bold inline code but its Markdown parser drops bold.
    assert.equal(preservesMarkdown(value, '`测试`\n'), false);
    const blocks = [{ id: 'paragraph', type: 'paragraph', props: {}, children: [],
        content: [{ type: 'text', text: '测试', styles: { bold: true, code: true } }] }];
    const snapshot = createBlockSnapshot();
    assert.equal(snapshot.matches(value), false);
    snapshot.remember(value, blocks);
    for (let i = 0; i < 3; i++) {
        assert.equal(snapshot.matches(value), true);
        const restored = snapshot.restore(value);
        assert.deepEqual(restored, blocks);
        // Restoring into an editor must not let later edits mutate the snapshot.
        restored[0].content[0].styles.bold = false;
    }
});

test('source edits cannot restore stale blocks or bypass checks for newly added HTML', async () => {
    const { createBlockSnapshot } = await snapshots;
    const { getMarkdownIssue } = await safety;
    const snapshot = createBlockSnapshot();
    const original = '正文\n';
    snapshot.remember(original, [{ type: 'paragraph', content: '正文' }]);
    for (const changed of ['修改后的正文\n', '正文\n\n<div>自定义内容</div>\n', '']) {
        assert.equal(snapshot.matches(changed), false);
        assert.equal(snapshot.restore(changed), null);
    }
    assert.ok(getMarkdownIssue('正文\n\n<div>自定义内容</div>\n'));
    assert.equal(snapshot.matches(original), true, 'undoing source edits can restore the original blocks');
    assert.equal(createBlockSnapshot().restore(original), null, 'snapshots are isolated by document');
});

test('unchanged table Markdown restores cell line breaks instead of creating extra rows', async () => {
    const { createBlockSnapshot } = await snapshots;
    const { preservesMarkdown } = await safety;
    // Captured from a real Shift+Enter edit inside a BlockNote table cell.
    const value = '| A          | B          |\n| ---------- | ---------- |\n| C\\\n第二行     | D          |\n';
    const reparsed = '| A          | B          |\n| ---------- | ---------- |\n| C\\         |            |\n| 第二行        | D          |\n';
    assert.equal(preservesMarkdown(value, reparsed), false);
    const text = value => [{ type: 'text', text: value, styles: {} }];
    const blocks = [{ type: 'table', content: { type: 'tableContent', headerRows: 1,
        rows: [{ cells: [text('A'), text('B')] }, { cells: [text('C\n第二行'), text('D')] }] } }];
    const snapshot = createBlockSnapshot();
    snapshot.remember(value, blocks);
    assert.deepEqual(snapshot.restore(value), blocks);
});

test('captures the latest blocks even when empty paragraphs do not change exported Markdown', async () => {
    const { createBlockSnapshot } = await snapshots;
    const snapshot = createBlockSnapshot();
    const blocks = [{ type: 'paragraph', content: '正文' }];
    snapshot.remember('正文\n', blocks);
    blocks.push({ type: 'paragraph', content: '' });
    assert.equal(snapshot.restore('正文\n').length, 1);
    snapshot.remember('正文\n', blocks);
    assert.deepEqual(snapshot.restore('正文\n'), blocks);
});
