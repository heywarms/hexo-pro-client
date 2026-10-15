export function postTimestamp(value) {
  if (!value) return 0
  const time = new Date(typeof value === 'string' ? value.replace(' ', 'T') : value).getTime()
  return Number.isFinite(time) ? time : 0
}

// The existing list API orders by publication date. Read its metadata pages before
// selecting recent edits so an older article edited today can still be featured.
export async function loadWorkspacePosts(loadPage, pageSize = 200) {
  const first = await loadPage(1, pageSize)
  const posts = [...(first.data || [])]
  const total = Number(first.total) || posts.length
  for (let page = 2; posts.length < total; page++) {
    const next = await loadPage(page, pageSize)
    if (!next.data?.length) break
    posts.push(...next.data)
  }
  return posts
}

export function getWorkspaceData(posts, now = new Date()) {
  const active = posts.filter(post => !post.isDiscarded)
  const isDraft = post => post.isDraft === true || /^_drafts\//.test(post.source || '')
  const sorted = [...active].sort((a, b) =>
    (postTimestamp(b.updated) || postTimestamp(b.date)) - (postTimestamp(a.updated) || postTimestamp(a.date)),
  ).map(post => ({ ...post, isDraft: isDraft(post) }))
  const featuredDraft = sorted.find(post => post.isDraft) || null
  const drafts = sorted.filter(post => post.isDraft).length
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const monthlyNew = active.filter(post => {
    const date = postTimestamp(post.date)
    return date >= start && date <= now.getTime()
  }).length
  const trend = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    return {
      month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
      count: sorted.filter(post => !post.isDraft && postTimestamp(post.date) >= month.getTime() && postTimestamp(post.date) < end.getTime()).length,
    }
  })
  return {
    total: active.length,
    drafts,
    published: active.length - drafts,
    monthlyNew,
    featuredDraft,
    recentPosts: sorted.filter(post => post !== featuredDraft).slice(0, 5),
    trend,
  }
}
