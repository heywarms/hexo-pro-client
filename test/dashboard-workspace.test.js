const assert = require('node:assert/strict');
const { test } = require('node:test');
const helpers = import('../client/src/pages/dashboard/workspace.mjs');

test('recent editing finds an old draft beyond the first publication-date page', async () => {
    const { loadWorkspacePosts, getWorkspaceData } = await helpers;
    const collection = await loadWorkspacePosts(async page => ({ total: 3, data: page === 1
        ? [{ title: 'New publication', date: '2026-10-10', updated: '2026-10-11' }, { title: 'Earlier post', date: '2026-10-09' }]
        : [{ title: 'Old draft edited today', isDraft: true, date: '2020-01-01', updated: '2026-10-14 09:12:00' }],
    }), 2);
    const result = getWorkspaceData(collection, new Date(2026, 9, 14, 10));
    assert.equal(result.featuredDraft.title, 'Old draft edited today');
    assert.deepEqual(result.recentPosts.map(post => post.title), ['New publication', 'Earlier post']);
    assert.equal(result.total, 3);
});

test('workspace counts calendar-month creation including drafts but publishing excludes drafts and discarded posts', async () => {
    const { getWorkspaceData } = await helpers;
    const result = getWorkspaceData([
        { title: 'May post', date: '2026-05-20', updated: '2026-10-13' },
        { title: 'October draft', source: '_drafts/idea.md', date: '2026-10-01 00:00:00' },
        { title: 'September draft', isDraft: true, date: '2026-09-30 23:59:59' },
        { title: 'Future draft', isDraft: true, date: '2026-10-31' },
        { title: 'Discarded', isDiscarded: true, date: '2026-10-12' },
    ], new Date(2026, 9, 14, 10));
    assert.equal(result.total, 4);
    assert.equal(result.published, 1);
    assert.equal(result.drafts, 3);
    assert.equal(result.monthlyNew, 1);
    assert.deepEqual(result.trend.map(month => month.count), [1, 0, 0, 0, 0, 0]);
});

test('missing or invalid update dates fall back to the article date and empty collections have no invented draft', async () => {
    const { getWorkspaceData } = await helpers;
    const result = getWorkspaceData([
        { title: 'Invalid update', updated: 'unknown', date: '2026-10-12' },
        { title: 'Recent update', updated: '2026-10-13 20:18:00', date: '2020-01-01' },
        { title: 'No dates' },
    ], new Date(2026, 9, 14));
    assert.equal(result.featuredDraft, null);
    assert.deepEqual(result.recentPosts.map(post => post.title), ['Recent update', 'Invalid update', 'No dates']);
    const empty = getWorkspaceData([], new Date(2026, 9, 14));
    assert.equal(empty.featuredDraft, null);
    assert.equal(empty.total, 0);
    assert.equal(empty.recentPosts.length, 0);
});

test('metadata pagination stops if a shrinking collection returns an empty page and propagates failures', async () => {
    const { loadWorkspacePosts } = await helpers;
    let calls = 0;
    const result = await loadWorkspacePosts(async () => {
        calls++;
        return calls === 1 ? { total: 5, data: [{ title: 'Only remaining post' }] } : { total: 1, data: [] };
    }, 1);
    assert.equal(calls, 2);
    assert.equal(result.length, 1);
    await assert.rejects(loadWorkspacePosts(async () => { throw new Error('offline'); }), /offline/);
});
