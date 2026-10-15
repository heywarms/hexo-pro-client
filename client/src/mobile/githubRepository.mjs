import { IDENTITY_PATH, repoPath, safePath } from './documentModel.mjs'

const encodePath = path => path.split('/').map(encodeURIComponent).join('/')

export function normalizeToken(value) {
    const token = typeof value === 'string' ? value.trim() : ''
    if (!token) throw new Error('请先在连接设置中填写 GitHub 凭据')
    // Invalid header characters throw before fetch reaches GitHub; this is not a network failure.
    if (!/^[\x21-\x7e]+$/.test(token)) throw new Error('访问凭据格式不正确，请粘贴 GitHub 生成的完整令牌，不要填写令牌名称或密码')
    return token
}

export function decodeBase64(content) {
    const binary = atob(content.replace(/\s/g, ''))
    return Uint8Array.from(binary, char => char.charCodeAt(0))
}

export function encodeBase64(bytes) {
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    return btoa(binary)
}

async function mapLimit(items, limit, callback) {
    const result = new Array(items.length)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) { const i = cursor++; result[i] = await callback(items[i], i) }
    }))
    return result
}

export class GitHubRepository {
    // WebKit requires Window as fetch's receiver, even when it is stored on another object.
    constructor(config, token, request = globalThis.fetch.bind(globalThis)) {
        this.config = config
        this.token = normalizeToken(token)
        this.fetch = request
        this.base = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
    }

    async request(path, method = 'GET', body) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 30_000)
        try {
            for (let attempt = 0; ; attempt++) {
                try {
                    const response = await this.fetch(this.base + path, { method, signal: controller.signal, headers: {
                        Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`,
                        'X-GitHub-Api-Version': '2026-03-10', ...(body ? { 'Content-Type': 'application/json' } : {}),
                    }, ...(body ? { body: JSON.stringify(body) } : {}) })
                    if (!response.ok) {
                        const messages = {
                            401: 'GitHub 凭据无效或已过期，请重新连接',
                            403: '没有仓库权限，或 GitHub 请求额度已用完，请检查凭据权限',
                            404: '没有找到仓库、分支或文件，请检查连接设置和访问权限',
                            409: '仓库已发生变化，请再次同步；你的本地修改已保留',
                            422: '仓库已发生变化或提交被分支规则拒绝，请检查后再次同步；你的本地修改已保留',
                        }
                        throw Object.assign(new Error(messages[response.status] || `GitHub 请求失败（${response.status}），本地修改已保留`), { status: response.status })
                    }
                    return response.status === 204 ? null : await response.json()
                } catch (error) {
                    // Retry interrupted reads once within the original deadline. Never replay writes.
                    if (method === 'GET' && attempt === 0 && error instanceof TypeError && !controller.signal.aborted) {
                        await new Promise(resolve => setTimeout(resolve, 500))
                        continue
                    }
                    throw error
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('连接 GitHub 超时，本地修改已保留，请稍后重试')
            if (error instanceof TypeError) throw new Error('无法访问 GitHub 接口（api.github.com），请检查手机网络和 App 的联网权限；本地修改已保留')
            if (error instanceof SyntaxError) throw new Error('GitHub 返回的内容无法读取，请稍后重试；本地修改已保留')
            throw error
        } finally { clearTimeout(timer) }
    }

    async checkConnection() {
        await this.request(`/git/ref/heads/${encodePath(this.config.branch)}`)
        return { owner: this.config.owner, repo: this.config.repo, branch: this.config.branch }
    }

    async readBlob(sha, maxSize = 10 * 1024 * 1024) {
        const blob = await this.request(`/git/blobs/${encodeURIComponent(sha)}`)
        if (blob.size > maxSize) throw new Error('仓库文件超过手机端可处理的大小')
        if (blob.encoding !== 'base64') throw new Error('GitHub 返回了不支持的文件编码')
        return decodeBase64(blob.content)
    }

    async readSnapshot() {
        const reference = await this.request(`/git/ref/heads/${encodePath(this.config.branch)}`)
        const head = reference.object.sha
        const commit = await this.request(`/git/commits/${head}`)
        const tree = await this.request(`/git/trees/${commit.tree.sha}?recursive=1`)
        if (tree.truncated) throw new Error('仓库文件过多，未能完整读取；为避免误覆盖，本次同步已停止')
        const prefix = repoPath(this.config, this.config.sourceDir) + '/'
        const files = tree.tree.filter(item => item.type === 'blob' && ['100644', '100755'].includes(item.mode)
            && item.path.startsWith(prefix) && /\.(md|markdown)$/i.test(item.path)
            && !/^_(?!posts\/|drafts\/)/.test(item.path.slice(prefix.length)))
        const indexFile = tree.tree.find(item => item.path === repoPath(this.config, IDENTITY_PATH))
        if (indexFile && (indexFile.type !== 'blob' || indexFile.mode !== '100644')) throw new Error('文章 ID 索引不是普通文件，请检查仓库')
        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
        const [documents, indexRaw] = await Promise.all([
            mapLimit(files, 5, async item => {
                if (item.size > 4 * 1024 * 1024) throw new Error(`文章文件过大，无法在手机上处理：${item.path}`)
                return { source: safePath(item.path.slice(prefix.length)), raw: decoder.decode(await this.readBlob(item.sha)) }
            }),
            indexFile ? this.readBlob(indexFile.sha).then(bytes => decoder.decode(bytes)) : null,
        ])
        const fileRefs = Object.fromEntries(tree.tree.filter(item => item.type === 'blob' && item.mode !== '120000' && item.path.startsWith(prefix))
            .map(item => [item.path.slice(prefix.length), { sha: item.sha, mode: item.mode }]))
        return { head, tree: commit.tree.sha, documents, indexRaw, files: tree.tree, fileRefs }
    }

    async commit(snapshot, changes, readAsset) {
        if (!changes.size) return snapshot.head
        // Blobs may be uploaded independently; the branch changes once, for the complete tree.
        const tree = await mapLimit([...changes], 4, async ([path, value]) => {
            if (value === null) return { path, mode: '100644', type: 'blob', sha: null }
            if (value.sha) return { path, mode: value.mode || '100644', type: 'blob', sha: value.sha }
            const content = value.assetKey ? await readAsset(value.assetKey) : value.content
            const blob = await this.request('/git/blobs', 'POST', { content, encoding: value.encoding })
            return { path, mode: '100644', type: 'blob', sha: blob.sha }
        })
        const nextTree = await this.request('/git/trees', 'POST', { base_tree: snapshot.tree, tree })
        const commit = await this.request('/git/commits', 'POST', {
            message: 'Update blog from Hexo Pro mobile', tree: nextTree.sha, parents: [snapshot.head],
        })
        // Never force push. A concurrent desktop commit is rejected rather than overwritten.
        await this.request(`/git/refs/heads/${encodePath(this.config.branch)}`, 'PATCH', { sha: commit.sha, force: false })
        return commit.sha
    }

    async readAsset(source, sha) {
        if (sha) return { bytes: await this.readBlob(sha), sha }
        const path = repoPath(this.config, `${this.config.sourceDir}/${safePath(source)}`)
        const data = await this.request(`/contents/${encodePath(path)}?ref=${encodeURIComponent(this.config.branch)}`)
        if (data.type !== 'file' || data.size > 10 * 1024 * 1024) throw new Error('图片暂时无法加载，或超过 10 MB')
        const bytes = data.encoding === 'base64' ? decodeBase64(data.content) : await this.readBlob(data.sha)
        return { bytes, sha: data.sha }
    }
}
