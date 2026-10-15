import { initialState, createWorkspace, createDocument, normalizeConfig, workspaceKey, safePath,
    withBody, withTitle, kindForSource, uuidPattern, identifySnapshot, mergeSnapshot, planCommit, acknowledgeCommit, resolveConflict } from './documentModel.mjs'
import { GitHubRepository, decodeBase64, normalizeToken } from './githubRepository.mjs'

export function validateState(state) {
    if (state?.version !== 1 || !Array.isArray(state.workspaces) || !state.workspaces.length
        || !state.workspaces.some(item => item.key === state.activeWorkspace)) throw new Error('本地文章数据损坏，请保留文件并从备份恢复')
    const keys = new Set()
    for (const workspace of state.workspaces) {
        if (typeof workspace.key !== 'string' || keys.has(workspace.key) || !Array.isArray(workspace.documents) || !Array.isArray(workspace.assets)) throw new Error('本地文章数据损坏')
        keys.add(workspace.key)
        if (workspace.config && workspaceKey(normalizeConfig(workspace.config)) !== workspace.key) throw new Error('本地仓库设置损坏')
        if (!workspace.config && workspace.key !== 'local') throw new Error('本地仓库设置损坏')
        const ids = new Set()
        for (const doc of workspace.documents) {
            if (!uuidPattern.test(doc.documentId) || ids.has(doc.documentId) || typeof doc.raw !== 'string' || safePath(doc.source) !== doc.source
                || !['Post', 'Page'].includes(doc.kind) || kindForSource(doc.source) !== doc.kind || !/\.(md|markdown)$/i.test(doc.source)
                || typeof doc.deleted !== 'boolean' || typeof doc.updatedAt !== 'string'
                || (doc.baseRaw !== null && typeof doc.baseRaw !== 'string')
                || (doc.baseSource !== null && safePath(doc.baseSource) !== doc.baseSource)) throw new Error('本地文章数据损坏')
            ids.add(doc.documentId)
        }
        const assetSources = new Set()
        for (const asset of workspace.assets) {
            if (typeof asset.key !== 'string' || !/^[\w.-]+$/.test(asset.key) || asset.key === '.' || asset.key === '..'
                || assetSources.has(asset.source) || safePath(asset.source) !== asset.source || typeof asset.pending !== 'boolean') throw new Error('本地图片数据损坏')
            assetSources.add(asset.source)
        }
    }
    return state
}

export class WorkspaceStore {
    constructor(storage, credentials, repositoryFactory = (config, token) => new GitHubRepository(config, token)) {
        this.storage = storage
        this.credentials = credentials
        this.repositoryFactory = repositoryFactory
        this.state = null
        this.listeners = new Set()
        this.saveStatus = 'saved'
        this.saveError = null
        this.syncing = false
        this.queue = Promise.resolve()
        this.revision = 0
    }

    async load() {
        const saved = await this.storage.readState()
        this.state = saved === null ? initialState() : validateState(saved)
        this.notify()
        return this.state
    }

    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
    notify() { for (const listener of this.listeners) listener({ state: this.state, saveStatus: this.saveStatus,
        saveError: this.saveError, syncing: this.syncing }) }
    workspace() { return this.state.workspaces.find(item => item.key === this.state.activeWorkspace) }

    update(next) {
        validateState(next)
        this.state = next
        const revision = ++this.revision
        this.saveStatus = 'saving'
        this.saveError = null
        this.notify()
        const write = this.queue.catch(() => {}).then(() => this.storage.writeState(next))
        this.queue = write
        write.then(() => {
            if (this.revision === revision) { this.saveStatus = 'saved'; this.notify() }
        }, error => {
            if (this.revision === revision) { this.saveStatus = 'error'; this.saveError = error.message; this.notify() }
        })
        return write
    }

    updateWorkspace(key, transform) {
        return this.update({ ...this.state, workspaces: this.state.workspaces.map(item => item.key === key ? transform(item) : item) })
    }
    async flush() { await this.queue; if (this.saveStatus === 'error') throw new Error(this.saveError || '本地保存失败') }
    retrySave() { return this.update(this.state) }
    setTheme(theme) { return this.update({ ...this.state, theme }) }

    async connect(input, token) {
        if (this.syncing) throw new Error('请等待当前同步完成后再切换仓库')
        const config = normalizeConfig(input)
        const key = workspaceKey(config)
        if (token?.trim()) await this.credentials.set(key, normalizeToken(token))
        else normalizeToken(await this.credentials.get(key))
        const workspaces = this.state.workspaces.some(item => item.key === key) ? this.state.workspaces
            : [...this.state.workspaces, createWorkspace(config)]
        await this.update({ ...this.state, activeWorkspace: key, workspaces })
    }

    async checkConnection(input, token) {
        const config = normalizeConfig(input)
        const credential = normalizeToken(token?.trim() || await this.credentials.get(workspaceKey(config)))
        return this.repositoryFactory(config, credential).checkConnection()
    }

    async switchWorkspace(key) {
        if (this.syncing) throw new Error('请等待当前同步完成后再切换仓库')
        await this.flush()
        await this.update({ ...this.state, activeWorkspace: key })
    }

    async disconnect() {
        if (this.syncing) throw new Error('请等待当前同步完成后再断开连接')
        await this.credentials.remove(this.workspace().key)
        this.notify()
    }

    async create(kind = 'Post') {
        const doc = createDocument({ kind })
        await this.updateWorkspace(this.workspace().key, workspace => ({ ...workspace, documents: [doc, ...workspace.documents] }))
        return doc.documentId
    }

    edit(id, transform) {
        return this.updateWorkspace(this.workspace().key, workspace => ({ ...workspace, documents: workspace.documents.map(doc => doc.documentId === id
            ? { ...transform(doc), updatedAt: new Date().toISOString() } : doc) }))
    }
    editBody(id, body) { return this.edit(id, doc => ({ ...doc, raw: withBody(doc.raw, body) })) }
    editTitle(id, title) { return this.edit(id, doc => ({ ...doc, raw: withTitle(doc.raw, title) })) }
    editRaw(id, raw) { return this.edit(id, doc => ({ ...doc, raw })) }

    async rename(id, source) {
        source = safePath(source.trim())
        if (!/\.(md|markdown)$/i.test(source)) throw new Error('文件名需要以 .md 或 .markdown 结尾')
        const workspace = this.workspace()
        const doc = workspace.documents.find(item => item.documentId === id)
        if (workspace.documents.some(item => item.documentId !== id && !item.deleted && item.source === source)) throw new Error('这个文件路径已有文章')
        if (kindForSource(source) !== doc.kind) throw new Error('文章应放在 _posts 或 _drafts 目录，页面应放在其他目录')
        await this.edit(id, doc => ({ ...doc, source, conflict: doc.conflict?.pathCollision ? null : doc.conflict }))
    }

    async trash(id) { await this.edit(id, doc => ({ ...doc, deleted: true })) }
    async restore(id) { await this.edit(id, doc => ({ ...doc, deleted: false })) }
    async resolve(id, choice) {
        await this.updateWorkspace(this.workspace().key, workspace => resolveConflict(workspace, id, choice))
    }

    async copyToActive(workspaceKey, id) {
        const from = this.state.workspaces.find(item => item.key === workspaceKey)
        const original = from?.documents.find(item => item.documentId === id)
        if (!original) throw new Error('没有找到本地文章')
        const copy = createDocument({ kind: original.kind })
        copy.raw = original.raw
        const assets = from.assets.filter(asset => original.raw.includes(asset.source) || original.raw.includes(asset.source.replace(/^images\//, '')))
        await this.updateWorkspace(this.workspace().key, workspace => ({ ...workspace, documents: [copy, ...workspace.documents],
            assets: [...workspace.assets, ...assets.filter(asset => !workspace.assets.some(item => item.key === asset.key)).map(asset => ({ ...asset, pending: true }))] }))
        return copy.documentId
    }

    async importBackup(backup) {
        if (this.syncing) throw new Error('请等待同步完成后再导入备份')
        if (backup?.version !== 1 || !backup.assets || typeof backup.assets !== 'object') throw new Error('这不是 Hexo Pro 手机端备份文件')
        validateState(backup.state)
        const existingAssets = new Set(this.state.workspaces.flatMap(workspace => workspace.assets.map(asset => asset.key)))
        for (const [key, data] of Object.entries(backup.assets)) {
            if (!/^[\w.-]+$/.test(key) || key === '.' || key === '..' || typeof data !== 'string'
                || data.length > 15 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new Error('备份包含无效的图片文件')
            if (existingAssets.has(key) && await this.storage.readAsset(key) !== data) throw new Error('备份与本机有不同的同名图片，导入已停止，原文件已保留')
        }
        for (const workspace of backup.state.workspaces) for (const asset of workspace.assets) {
            if (typeof backup.assets[asset.key] !== 'string') throw new Error('备份缺少文章图片，无法完整恢复')
        }
        for (const [key, data] of Object.entries(backup.assets)) await this.storage.writeAsset(key, decodeBase64(data))
        const workspaces = this.state.workspaces.slice()
        for (const incoming of backup.state.workspaces) {
            const i = workspaces.findIndex(workspace => workspace.key === incoming.key)
            if (i === -1) { workspaces.push(incoming); continue }
            const current = workspaces[i]
            const documents = current.documents.slice()
            for (const doc of incoming.documents) {
                const duplicate = documents.find(item => item.documentId === doc.documentId || item.source === doc.source)
                if (!duplicate) documents.push(doc)
                else if (duplicate.raw !== doc.raw || duplicate.deleted !== doc.deleted) {
                    const copy = createDocument({ kind: doc.kind })
                    documents.push({ ...copy, raw: doc.raw })
                }
            }
            workspaces[i] = { ...current, documents, assets: [...current.assets,
                ...incoming.assets.filter(asset => !current.assets.some(item => item.key === asset.key))] }
        }
        await this.update({ ...this.state, workspaces })
    }

    async sync(options = {}) {
        if (this.syncing) return
        this.syncing = true; this.notify()
        const key = this.workspace().key
        try {
            await this.flush()
            const workspace = this.workspace()
            if (!workspace.config) throw new Error('请先连接博客的 GitHub 源文件仓库')
            const token = await this.credentials.get(key)
            const repository = this.repositoryFactory(workspace.config, token)
            const remote = await repository.readSnapshot()
            if (remote.indexRaw === null && remote.documents.length && !options.initializeIndex) {
                throw Object.assign(new Error('仓库尚未同步文章 ID 索引，请先从电脑同步索引，或在手机端初始化'), { code: 'INDEX_INITIALIZATION_REQUIRED' })
            }
            const snapshot = await identifySnapshot(remote, this.workspace())
            await this.updateWorkspace(key, latest => mergeSnapshot(latest, snapshot))
            const sent = this.workspace()
            if (sent.documents.some(doc => doc.conflict)) return { conflicts: sent.documents.filter(doc => doc.conflict).length }
            const plan = await planCommit(sent, snapshot)
            const commit = await repository.commit(snapshot, plan.changes, assetKey => this.storage.readAsset(assetKey))
            await this.updateWorkspace(key, latest => acknowledgeCommit(latest, sent, plan.indexRaw, commit, plan.changes))
            return { conflicts: 0, changed: plan.changes.size, commit }
        } finally { this.syncing = false; this.notify() }
    }
}
