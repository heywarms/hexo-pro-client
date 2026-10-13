import { validateState } from './workspaceStore.mjs'

// Validate before touching the damaged primary file or the last good backup.
export async function recoverWorkspace(storage, raw, backupBundle = false) {
    if (typeof raw !== 'string' || !raw) throw new Error('没有可用的本地备份，请导入之前导出的备份文件')
    let parsed
    try { parsed = JSON.parse(raw) } catch { throw new Error('备份文件无法读取，原文件保持不变') }
    const state = validateState(backupBundle ? parsed.state : parsed)
    const assets = backupBundle ? parsed.assets : null
    if (backupBundle && (parsed.version !== 1 || !assets || typeof assets !== 'object' || Array.isArray(assets))) {
        throw new Error('这不是 Hexo Pro 手机端备份文件')
    }
    if (assets) {
        for (const [key, data] of Object.entries(assets)) {
            if (!/^[\w.-]+$/.test(key) || key === '.' || key === '..' || typeof data !== 'string'
                || data.length > 15 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
                throw new Error('备份包含无效的图片文件')
            }
        }
        for (const workspace of state.workspaces) for (const asset of workspace.assets) {
            if (typeof assets[asset.key] !== 'string') throw new Error('备份缺少文章图片，无法完整恢复')
        }
    }
    // The adapter archives the current primary and preserves existing images
    // before replacing anything. It never rotates a corrupt primary into .bak.
    await storage.replaceRecoveredState(state, assets)
    return state
}
