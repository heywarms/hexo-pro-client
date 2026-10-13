import { parseDocument, isScalar } from 'yaml'

export const IDENTITY_PATH = '.hexo-pro/document-identities.json'
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function safePath(input, allowEmpty = false) {
    const value = String(input || '').replace(/\\/g, '/').replace(/\/$/, '')
    if ((value || !allowEmpty) && (!value || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')
        || /[\x00-\x1f?#]/.test(value))) throw new Error('文件路径必须是仓库内的相对路径，不能包含 ..')
    return value
}

export function normalizeConfig(input) {
    const owner = String(input.owner || '').trim()
    const repo = String(input.repo || '').trim().replace(/\.git$/, '')
    const branch = String(input.branch || 'main').trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner) || !/^[\w.-]+$/.test(repo) || repo === '.' || repo === '..') {
        throw new Error('请填写正确的 GitHub 用户名和仓库名')
    }
    if (!branch || /[\s~^:?*\[\\]/.test(branch) || branch.includes('..') || branch.includes('@{') || branch.endsWith('/') || branch.endsWith('.')) {
        throw new Error('分支名称不正确')
    }
    return { owner, repo, branch, sourceDir: safePath(String(input.sourceDir || 'source').trim()),
        blogDir: safePath(String(input.blogDir || '').trim(), true) }
}

export const workspaceKey = config => config
    ? `${config.owner.toLowerCase()}/${config.repo.toLowerCase()}@${config.branch}:${config.blogDir}/${config.sourceDir}` : 'local'
export const repoPath = (config, relative) => [config.blogDir, relative].filter(Boolean).join('/')
export const sourcePath = (config, source) => repoPath(config, `${config.sourceDir}/${safePath(source)}`)
export const kindForSource = source => /^_(posts|drafts)\//.test(source) ? 'Post' : 'Page'
export const isDirty = doc => doc.deleted ? doc.baseRaw !== null : doc.baseRaw === null || doc.raw !== doc.baseRaw || doc.source !== doc.baseSource

// Retain the original header bytes. Reading, syncing and body edits never reserialize Front Matter.
export function splitDocument(raw) {
    raw = String(raw)
    const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : ''
    const text = raw.slice(bom.length)
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const prefix = text.match(/^(-{3,}|;{3,})\r?\n/)
    let match
    if (prefix) {
        const start = prefix[0].length
        const end = new RegExp(`^${prefix[1]}(?:\\r?\\n|$)`, 'm').exec(text.slice(start))
        if (!end) return { header: bom, body: text, metadata: '', separator: '', eol, bom, metadataOffset: bom.length }
        const bodyOffset = start + end.index + end[0].length
        match = { header: bom + text.slice(0, bodyOffset), body: text.slice(bodyOffset),
            metadata: text.slice(start, start + end.index), separator: prefix[1], metadataOffset: bom.length + start }
    } else {
        const end = /^(-{3,}|;{3,})(?:\r?\n|$)/m.exec(text)
        if (!end || end.index === 0) return { header: bom, body: text, metadata: '', separator: '', eol, bom, metadataOffset: bom.length }
        // A Markdown horizontal rule must not hide the paragraphs before it.
        try {
            const value = end[1].startsWith(';') ? JSON.parse(`{${text.slice(0, end.index)}}`)
                : parseDocument(text.slice(0, end.index)).toJS({ maxAliasCount: 100 })
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not front matter')
        } catch { return { header: bom, body: text, metadata: '', separator: '', eol, bom, metadataOffset: bom.length } }
        match = { header: bom + text.slice(0, end.index + end[0].length), body: text.slice(end.index + end[0].length),
            metadata: text.slice(0, end.index), separator: end[1], metadataOffset: bom.length }
    }
    return { ...match, eol, bom }
}

export function metadata(raw) {
    const parts = splitDocument(raw)
    if (!parts.separator) return {}
    if (parts.separator.startsWith(';')) return JSON.parse(`{${parts.metadata}}`)
    const doc = parseDocument(parts.metadata)
    if (doc.errors.length) throw new Error('Front Matter 格式有误，请在“文件源码”中修复')
    const data = doc.toJS({ maxAliasCount: 100 })
    if (data === null && !parts.metadata.trim()) return {}
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Front Matter 必须是字段列表')
    return data
}

export function titleForDocument(doc) {
    try { return String(metadata(doc.raw).title || doc.source.split('/').pop().replace(/\.(md|markdown)$/i, '')) }
    catch { return doc.source.split('/').pop() }
}

export function withBody(raw, body) {
    const parts = splitDocument(raw)
    return parts.header + String(body).replace(/\r?\n/g, parts.eol)
}

export function withTitle(raw, title) {
    title = String(title).trim().replace(/\s*\n+\s*/g, ' ')
    if (!title) throw new Error('标题不能为空')
    const parts = splitDocument(raw)
    if (!parts.separator) return `${parts.bom}---${parts.eol}title: ${JSON.stringify(title)}${parts.eol}---${parts.eol}${parts.body}`
    const data = metadata(raw)
    if (String(data.title || '') === title) return raw
    if (parts.separator.startsWith(';')) {
        const json = parseDocument(`{${parts.metadata}}`, { keepSourceTokens: true })
        const node = json.get('title', true)
        if (!node) return raw.slice(0, parts.metadataOffset) + `"title": ${JSON.stringify(title)}${parts.metadata.trim() ? ',' : ''}${parts.eol}` + raw.slice(parts.metadataOffset)
        if (!isScalar(node) || !node.range) throw new Error('标题字段不是普通文本，请在“文件源码”中修改')
        return raw.slice(0, parts.metadataOffset + node.range[0] - 1) + JSON.stringify(title)
            + raw.slice(parts.metadataOffset + node.range[1] - 1)
    }
    const headerDoc = parseDocument(parts.metadata, { keepSourceTokens: true })
    const node = headerDoc.get('title', true)
    if (!node) {
        return raw.slice(0, parts.metadataOffset) + `title: ${JSON.stringify(title)}${parts.eol}` + raw.slice(parts.metadataOffset)
    }
    if (!isScalar(node) || !node.range) throw new Error('标题字段不是普通文本，请在“文件源码”中修改')
    const [start, end] = node.range
    let replacement = JSON.stringify(title)
    if (/\r?\n$/.test(parts.metadata.slice(start, end))) replacement += parts.eol
    return raw.slice(0, parts.metadataOffset + start) + replacement + raw.slice(parts.metadataOffset + end)
}

export function createDocument({ kind = 'Post', source, title = '未命名文章', now = new Date(), id = crypto.randomUUID() } = {}) {
    const date = now.toISOString().slice(0, 10)
    const stem = `${date}-${id.slice(0, 8)}`
    return { documentId: id, kind, source: safePath(source || (kind === 'Post' ? `_drafts/${stem}.md` : `${stem}/index.md`)),
        raw: `---\ntitle: ${JSON.stringify(title)}\ndate: ${date}\n---\n\n`, baseRaw: null, baseSource: null,
        deleted: false, conflict: null, updatedAt: now.toISOString() }
}

export function createWorkspace(config = null) {
    return { key: workspaceKey(config), config, documents: [], assets: [], baseIndex: null, lastCommit: null, lastSyncAt: null }
}

export const initialState = () => ({ version: 1, theme: 'system', activeWorkspace: 'local', workspaces: [createWorkspace()] })

export async function fingerprint(raw) {
    const bytes = new TextEncoder().encode(String(raw).replace(/\r\n/g, '\n'))
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
}

export function parseIdentityIndex(raw) {
    if (raw === null) return { version: 1, documents: [] }
    let index
    try { index = JSON.parse(raw) } catch { throw new Error('仓库的文章 ID 索引损坏，请先修复索引或恢复备份') }
    const ids = new Set(), sources = new Set()
    if (index.version !== 1 || !Array.isArray(index.documents)) throw new Error('仓库的文章 ID 索引格式不受支持')
    for (const record of index.documents) {
        const key = `${record.kind}:${record.source}`
        if (!uuidPattern.test(record.documentId) || !['Post', 'Page'].includes(record.kind)
            || !/^[0-9a-f]{64}$/i.test(record.fingerprint) || safePath(record.source) !== record.source
            || ids.has(record.documentId) || sources.has(key)) throw new Error('文章 ID 索引包含无效或重复记录，请先修复索引')
        ids.add(record.documentId); sources.add(key)
    }
    return index
}

export async function identifySnapshot(snapshot, workspace) {
    if (snapshot.indexRaw === null && workspace.baseIndex !== null) throw new Error('仓库的文章 ID 索引丢失，请恢复索引后再同步')
    const index = parseIdentityIndex(snapshot.indexRaw)
    const records = index.documents.map(record => ({ ...record }))
    const liveKeys = new Set(snapshot.documents.map(doc => `${kindForSource(doc.source)}:${doc.source}`))
    const pending = []
    const documents = []
    for (const file of snapshot.documents) {
        const kind = kindForSource(file.source)
        const digest = await fingerprint(file.raw)
        const record = records.find(item => item.kind === kind && item.source === file.source)
        if (record) documents.push({ ...file, kind, documentId: record.documentId })
        else pending.push({ ...file, kind, fingerprint: digest })
    }
    for (const file of pending) {
        const matches = records.filter(record => record.kind === file.kind && record.fingerprint === file.fingerprint
            && !liveKeys.has(`${record.kind}:${record.source}`))
        const peers = pending.filter(item => item.kind === file.kind && item.fingerprint === file.fingerprint)
        let record
        if (matches.length === 1 && peers.length === 1) { record = matches[0]; record.source = file.source }
        else {
            const known = workspace.documents.find(doc => doc.source === file.source && doc.baseRaw === file.raw)
            record = { documentId: known?.documentId || crypto.randomUUID(), kind: file.kind, source: file.source, fingerprint: file.fingerprint }
            records.push(record)
        }
        documents.push({ source: file.source, raw: file.raw, kind: file.kind, documentId: record.documentId })
    }
    return { ...snapshot, documents, index: { version: 1, documents: records } }
}

export function mergeSnapshot(workspace, snapshot) {
    const remote = new Map(snapshot.documents.map(doc => [doc.documentId, doc]))
    const documents = []
    for (const local of workspace.documents) {
        const other = remote.get(local.documentId)
        remote.delete(local.documentId)
        if (!other) {
            if (local.baseRaw === null) { documents.push({ ...local }); continue }
            if (local.deleted) { documents.push({ ...local, baseRaw: null, baseSource: null, conflict: null }); continue }
            if (isDirty(local)) documents.push({ ...local, conflict: { raw: null, source: null, reason: '仓库中的文章已被删除' } })
            continue
        }
        const remoteChanged = other.raw !== local.baseRaw || other.source !== local.baseSource
        const equivalent = !local.deleted && local.raw === other.raw && local.source === other.source
        if (!isDirty(local) || equivalent) {
            documents.push({ ...local, ...other, baseRaw: other.raw, baseSource: other.source, deleted: false, conflict: null })
        } else if (remoteChanged) {
            documents.push({ ...local, conflict: { raw: other.raw, source: other.source, reason: '手机和仓库都修改了这篇文章' } })
        } else documents.push({ ...local, conflict: null })
    }
    for (const doc of remote.values()) {
        documents.push({ ...doc, baseRaw: doc.raw, baseSource: doc.source, deleted: false, conflict: null, updatedAt: new Date().toISOString() })
    }
    // A new file at a locally chosen path is a conflict even if its UUID differs.
    for (const doc of documents.filter(item => isDirty(item) && !item.deleted)) {
        if (documents.some(other => other.documentId !== doc.documentId && !other.deleted && other.source === doc.source)) {
            doc.conflict = { raw: null, source: null, reason: '目标文件名已被另一篇文章占用，请先修改文件路径', pathCollision: true }
        }
    }
    return { ...workspace, documents, fileRefs: snapshot.fileRefs || {}, baseIndex: snapshot.indexRaw, lastCommit: snapshot.head }
}

export function resolveConflict(workspace, id, choice) {
    return { ...workspace, documents: workspace.documents.flatMap(doc => {
        if (doc.documentId !== id || !doc.conflict) return [doc]
        if (doc.conflict.pathCollision) throw new Error('请先修改文件路径，避免覆盖另一篇文章')
        const remote = doc.conflict
        if (choice === 'remote') return remote.raw === null ? []
            : [{ ...doc, raw: remote.raw, source: remote.source, baseRaw: remote.raw, baseSource: remote.source, deleted: false, conflict: null }]
        return [{ ...doc, baseRaw: remote.raw, baseSource: remote.source, conflict: null }]
    }) }
}

export async function planCommit(workspace, snapshot) {
    if (workspace.documents.some(doc => doc.conflict)) throw new Error('请先处理文章冲突，再同步到仓库')
    const changes = new Map()
    const records = snapshot.index.documents.map(record => ({ ...record }))
    for (const doc of workspace.documents) {
        if (!isDirty(doc)) continue
        if (doc.baseSource && (doc.deleted || doc.source !== doc.baseSource)) changes.set(sourcePath(workspace.config, doc.baseSource), null)
        if (doc.baseSource && !doc.deleted && doc.kind === 'Post' && doc.source !== doc.baseSource) {
            const oldAssets = doc.baseSource.replace(/\.(md|markdown)$/i, '') + '/'
            const nextAssets = doc.source.replace(/\.(md|markdown)$/i, '') + '/'
            for (const [source, file] of Object.entries(snapshot.fileRefs || {})) {
                if (!source.startsWith(oldAssets)) continue
                const destination = nextAssets + source.slice(oldAssets.length)
                if (snapshot.fileRefs[destination]) throw new Error('新文件名对应的图片目录已存在，请选择其他文件名')
                changes.set(sourcePath(workspace.config, source), null)
                changes.set(sourcePath(workspace.config, destination), { sha: file.sha, mode: file.mode })
            }
        }
        const old = records.findIndex(record => record.documentId === doc.documentId)
        if (old !== -1) records.splice(old, 1)
        if (!doc.deleted) {
            if (records.some(record => record.kind === doc.kind && record.source === doc.source
                && snapshot.documents.some(other => other.documentId === record.documentId))) throw new Error('目标路径已存在，请修改文件名')
            for (let i = records.length - 1; i >= 0; i--) if (records[i].kind === doc.kind && records[i].source === doc.source) records.splice(i, 1)
            records.push({ documentId: doc.documentId, kind: doc.kind, source: doc.source, fingerprint: await fingerprint(doc.raw) })
            changes.set(sourcePath(workspace.config, doc.source), { content: doc.raw, encoding: 'utf-8' })
        }
    }
    // Register previously unindexed files and refresh fingerprints without touching their contents.
    for (const remote of snapshot.documents) {
        const doc = workspace.documents.find(item => item.documentId === remote.documentId)
        if (!doc || doc.deleted || isDirty(doc)) continue
        const record = records.find(item => item.documentId === doc.documentId)
        if (record) record.fingerprint = await fingerprint(doc.raw)
    }
    const index = { version: 1, documents: records }
    const original = parseIdentityIndex(snapshot.indexRaw)
    if (JSON.stringify(original) !== JSON.stringify(index)) {
        changes.set(repoPath(workspace.config, IDENTITY_PATH), { content: JSON.stringify(index, null, 2) + '\n', encoding: 'utf-8' })
    }
    for (const asset of workspace.assets.filter(asset => asset.pending && workspace.documents.some(doc => !doc.deleted && doc.raw.includes(asset.source)))) {
        changes.set(sourcePath(workspace.config, asset.source), { assetKey: asset.key, encoding: 'base64' })
    }
    return { changes, indexRaw: changes.get(repoPath(workspace.config, IDENTITY_PATH))?.content || snapshot.indexRaw }
}

// Apply the acknowledgement to the latest state, retaining edits made during the network request.
export function acknowledgeCommit(current, sent, indexRaw, commit, changes = new Map()) {
    const documents = current.documents.flatMap(doc => {
        const uploaded = sent.documents.find(item => item.documentId === doc.documentId)
        if (!uploaded) return [doc]
        if (uploaded.deleted) return [{ ...doc, baseRaw: null, baseSource: null, conflict: null }]
        return [{ ...doc, baseRaw: uploaded.raw, baseSource: uploaded.source, conflict: null }]
    })
    const keys = new Set([...changes.values()].filter(value => value?.assetKey).map(value => value.assetKey))
    const moves = sent.documents.filter(doc => !doc.deleted && doc.kind === 'Post' && doc.baseSource && doc.source !== doc.baseSource)
        .map(doc => [doc.baseSource.replace(/\.(md|markdown)$/i, '') + '/', doc.source.replace(/\.(md|markdown)$/i, '') + '/'])
    const assets = current.assets.map(asset => {
        const move = moves.find(([oldSource]) => asset.source.startsWith(oldSource))
        return { ...asset, source: move ? move[1] + asset.source.slice(move[0].length) : asset.source,
            pending: keys.has(asset.key) ? false : asset.pending }
    })
    const fileRefs = { ...current.fileRefs }
    const prefix = sourcePath(current.config, 'placeholder').replace(/placeholder$/, '')
    for (const [path, value] of changes) {
        if (!path.startsWith(prefix)) continue
        if (value === null) delete fileRefs[path.slice(prefix.length)]
        else if (value.sha) fileRefs[path.slice(prefix.length)] = { sha: value.sha, mode: value.mode || '100644' }
    }
    return { ...current, documents, fileRefs, assets,
        baseIndex: indexRaw, lastCommit: commit, lastSyncAt: new Date().toISOString() }
}
