const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = import('../client/src/pages/content/posts/post/propertyModel.mjs');
const { createAutoSave } = require('../client/src/components/BlogEditor/autoSave');

test('property input preserves string booleans, empty strings, zero and structured YAML', async () => {
    const { parseValue, valueType, valueText } = await model;
    assert.equal(parseValue('false', 'string'), 'false');
    assert.equal(parseValue('001', 'string'), '001');
    assert.equal(parseValue('', 'string'), '');
    assert.equal(parseValue('false', 'boolean'), false);
    assert.equal(parseValue('0', 'number'), 0);
    for (const value of [null, ['blog', '技术'], { comments: false, count: 0, date: '2026-10-14' }]) {
        assert.equal(valueType(value), 'yaml');
        assert.deepEqual(parseValue(valueText(value), 'yaml'), value);
    }
    assert.deepEqual(parseValue('date: 2026-10-14\nlabel: "false"', 'yaml'), { date: '2026-10-14', label: 'false' });
});

test('invalid and duplicate field edits are rejected without changing existing properties', async () => {
    const { parseValue, replaceField, fieldKeyError } = await model;
    const fields = { cover: '/images/cover.jpg', comments: false, options: { nested: [1, 2] } };
    assert.equal(fieldKeyError('   ', fields), 'required');
    for (const key of ['title', '_content', '__proto__', 'source', 'categories', 'tags']) {
        assert.equal(fieldKeyError(key, fields), 'reserved');
    }
    assert.throws(() => replaceField(fields, 'cover', 'comments', 'lost'), /duplicate/);
    for (const value of ['', 'NaN', 'Infinity', '1.2.3']) assert.throws(() => parseValue(value, 'number'));
    assert.throws(() => parseValue('items: [unfinished', 'yaml'));
    assert.throws(() => parseValue('  ', 'yaml'));
    assert.equal(fields.cover, '/images/cover.jpg');
    assert.deepEqual(replaceField(fields, 'cover', ' banner ', '/new.jpg'), { banner: '/new.jpg', comments: false, options: { nested: [1, 2] } });
});

test('taxonomy edits deduplicate trimmed names and retain nested category paths', async () => {
    const { normalizeTaxonomy, taxonomyId, taxonomyLabel } = await model;
    const path = ['技术', '前端'];
    assert.deepEqual(normalizeTaxonomy(['  写作 ', '写作', '', ' ', path, ['技术', '前端'], 'React Native']), ['写作', path, 'React Native']);
    assert.equal(taxonomyLabel(path), '技术 / 前端');
    assert.notEqual(taxonomyId(path), taxonomyId('技术 / 前端'));
});

test('property saves share the body queue and retain the latest complete metadata through a failed save', async () => {
    const { replaceField } = await model;
    const writes = [];
    let fail = true;
    const queue = createAutoSave(async update => { writes.push(update); if (fail) throw new Error('Offline'); });
    const original = { comments: false, options: { nested: ['保留'] } };
    queue.enqueue({ frontMatter: replaceField(original, '', 'cover', '/first.jpg') });
    queue.enqueue({ tags: ['写作'], categories: [['技术', '前端']], _content: '正文仍在编辑' });
    await assert.rejects(queue.flush(), /Offline/);
    queue.enqueue({ frontMatter: replaceField(original, '', 'cover', '/latest.jpg') });
    fail = false;
    await queue.flush();
    assert.deepEqual(writes[1], { frontMatter: { ...original, cover: '/latest.jpg' }, tags: ['写作'], categories: [['技术', '前端']], _content: '正文仍在编辑' });
    assert.equal(queue.hasPending(), false);
});
