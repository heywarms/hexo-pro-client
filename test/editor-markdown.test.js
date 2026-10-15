const assert = require('node:assert/strict');
const { test } = require('node:test');
const safety = import('../client/src/components/BlogEditor/markdownSafety.mjs');

test('keeps Hexo tags, HTML, math, footnotes and code fence parameters in source mode', async () => {
    const { getMarkdownIssue } = await safety;
    for (const markdown of [
        '{% note info %}\nHello\n{% endnote %}', '<div class="custom">Content</div>',
        '$E=mc^2$', 'Text[^1]\n\n[^1]: Footnote', '```js title="Example"\nconst x = 1\n```',
        '![Image](image.png "Title")', '| A | B |\n| :---: | ---: |\n| C | D |',
    ]) assert.ok(getMarkdownIssue(markdown), markdown);
    assert.equal(getMarkdownIssue('```txt\n{% note info %}\n<div>Code</div>\n$math$\n```'), '');
});

test('accepts Markdown formatting normalization but refuses lost content or structure', async () => {
    const { preservesMarkdown } = await safety;
    assert.equal(preservesMarkdown('# Title\n\n**Bold** and *italic*\n\n- A\n- B\n', '# Title\n\n__Bold__ and _italic_\n\n* A\n\n* B\n'), true);
    assert.equal(preservesMarkdown('A soft\nline break', 'A soft line break'), true);
    assert.equal(preservesMarkdown('```js\nconst x = 1\n```', '```js\nconst x = 2\n```'), false);
    assert.equal(preservesMarkdown('A\n\n> Quote', 'A\n\nQuote'), false);
    assert.equal(preservesMarkdown('[Link](https://example.test)', '[Link](https://other.test)'), false);
});
