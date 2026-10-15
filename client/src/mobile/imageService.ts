import { storage, credentials, decodeBase64 } from './nativeStorage'
import { GitHubRepository } from './githubRepository.mjs'

export function createImageService(store: any) {
    const cache = new Map<string, string>()
    const extensionFor = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
    return {
        async upload(file: File) {
            const workspaceKey = store.workspace().key
            const extension = extensionFor[file.type]
            if (!extension) throw new Error('请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片')
            if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB')
            const key = `${crypto.randomUUID()}.${extension}`
            const bytes = new Uint8Array(await file.arrayBuffer())
            await storage.writeAsset(key, bytes)
            const asset = { key, source: `images/${key}`, mime: file.type, pending: true }
            await store.updateWorkspace(workspaceKey, workspace => ({ ...workspace, assets: [...workspace.assets, asset] }))
            const url = `/images/${key}`
            cache.set(`${workspaceKey}:${asset.source}:`, URL.createObjectURL(new Blob([bytes], { type: file.type })))
            return url
        },
        async resolve(url: string, documentSource = '') {
            if (!url || /^(https?:|data:|blob:)/i.test(url)) return url
            const workspace = store.workspace()
            const normalize = (base: string) => decodeURIComponent(new URL(url, `https://assets.invalid/${base}`).pathname.replace(/^\//, ''))
            const doc = workspace.documents.find(item => !item.deleted && item.source === documentSource)
            const sources = url.startsWith('/') ? [normalize('')] : [documentSource, doc?.baseSource].filter(Boolean)
                .flatMap(source => [normalize(source.replace(/\.(md|markdown)$/i, '') + '/'),
                    normalize(source.slice(0, source.lastIndexOf('/') + 1))]).concat(normalize(''))
            const source = sources.find(candidate => workspace.assets.some(asset => asset.source === candidate) || workspace.fileRefs?.[candidate]) || sources[0]
            const sha = workspace.fileRefs?.[source]?.sha || ''
            const cacheKey = `${workspace.key}:${source}:${sha}`
            if (cache.has(cacheKey)) return cache.get(cacheKey)
            const asset = workspace.assets.find(asset => asset.source === source)
            let bytes: Uint8Array, mime: string
            if (asset && (asset.pending || !sha || asset.remoteSha === sha)) { bytes = decodeBase64(await storage.readAsset(asset.key)); mime = asset.mime }
            else {
                if (!workspace.config) return url
                const repository = new GitHubRepository(workspace.config, await credentials.get(workspace.key))
                const result = await repository.readAsset(source, sha)
                bytes = result.bytes
                mime = source.endsWith('.png') ? 'image/png' : source.endsWith('.webp') ? 'image/webp' : source.endsWith('.gif') ? 'image/gif' : 'image/jpeg'
                const key = `cache-${result.sha}`
                await storage.writeAsset(key, bytes)
                await store.updateWorkspace(workspace.key, latest => ({ ...latest,
                    assets: [...latest.assets.filter(item => item.source !== source || item.pending), { key, source, mime, remoteSha: result.sha, pending: false }] }))
            }
            const local = URL.createObjectURL(new Blob([bytes as any], { type: mime }))
            cache.set(cacheKey, local)
            return local
        },
        dispose() { Array.from(cache.values()).forEach(url => URL.revokeObjectURL(url)); cache.clear() },
    }
}
