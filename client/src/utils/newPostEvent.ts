/** 页面内触发“新建文章”对话框（由 Navbar 监听并复用其新建流程） */
export const NEW_POST_EVENT = 'hexo-pro:new-post'

export function requestNewPost() {
    window.dispatchEvent(new CustomEvent(NEW_POST_EVENT))
}

export function requestNewPage() {
    window.dispatchEvent(new CustomEvent(NEW_POST_EVENT, { detail: { target: 'Page' } }))
}
