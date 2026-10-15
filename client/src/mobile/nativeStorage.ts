import { Capacitor, registerPlugin } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { encodeBase64, decodeBase64 } from './githubRepository.mjs'

const native = Capacitor.isNativePlatform()
const root = 'hexopro-mobile'
const vault = registerPlugin<{
    get(options: { key: string }): Promise<{ value: string | null }>
    set(options: { key: string; value: string }): Promise<void>
    remove(options: { key: string }): Promise<void>
}>('SecureCredentials')

let dbPromise: Promise<IDBDatabase>
function database() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('hexopro-mobile-v1', 1)
        request.onupgradeneeded = () => {
            request.result.createObjectStore('state')
            request.result.createObjectStore('assets')
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(new Error('无法打开本地文章存储，请检查设备剩余空间'))
    })
    return dbPromise
}

async function idb(store: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest) {
    const db = await database()
    return new Promise<any>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = operation(transaction.objectStore(store))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = transaction.onabort = () => reject(new Error('本地保存失败，请检查设备剩余空间后重试'))
    })
}

const missing = (error: any) => error?.code === 'OS-PLUG-FILE-0008' || error?.code === 'ENOENT'

async function readFile(path: string) {
    try {
        return String((await Filesystem.readFile({ path: `${root}/${path}`, directory: Directory.Data, encoding: Encoding.UTF8 })).data)
    } catch (error) { if (missing(error)) return null; throw error }
}

export const storage = {
    async readRecoveryFiles() {
        const primary = native ? await readFile('workspace.json') : await idb('state', 'readonly', store => store.get('workspace'))
        const backup = native ? await readFile('workspace.bak.json') : await idb('state', 'readonly', store => store.get('backup'))
        return { primary: primary ?? null, backup: backup ?? null }
    },
    async replaceRecoveredState(state: object, assets: Record<string, string> | null = null) {
        const data = JSON.stringify(state)
        const archive = `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`
        if (native) {
            const original = await readFile('workspace.json')
            if (original !== null) await Filesystem.writeFile({ path: `${root}/${archive}/workspace.json`, data: original,
                directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
            for (const [key, asset] of Object.entries(assets || {})) {
                try {
                    const old = await Filesystem.readFile({ path: `${root}/assets/${key}`, directory: Directory.Data })
                    if (typeof old.data === 'string') await Filesystem.writeFile({ path: `${root}/${archive}/assets/${key}`, data: old.data,
                        directory: Directory.Data, recursive: true })
                } catch (error) { if (!missing(error)) throw error }
                await Filesystem.writeFile({ path: `${root}/assets/${key}`, data: asset, directory: Directory.Data, recursive: true })
            }
            await Filesystem.writeFile({ path: `${root}/workspace.tmp.json`, data, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
            await Filesystem.rename({ from: `${root}/workspace.tmp.json`, to: `${root}/workspace.json`, directory: Directory.Data })
        } else {
            const db = await database()
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(['state', 'assets'], 'readwrite')
                const stateStore = tx.objectStore('state')
                const previous = stateStore.get('workspace')
                previous.onsuccess = () => { if (previous.result != null) stateStore.put(previous.result, archive); stateStore.put(data, 'workspace') }
                const assetStore = tx.objectStore('assets')
                for (const [key, asset] of Object.entries(assets || {})) {
                    const old = assetStore.get(key)
                    old.onsuccess = () => { if (old.result != null) assetStore.put(old.result, `${archive}/${key}`); assetStore.put(asset, key) }
                }
                tx.oncomplete = () => resolve()
                tx.onerror = tx.onabort = () => reject(new Error('恢复失败，原文件和备份已保留'))
            })
        }
    },
    async readState() {
        const raw = native ? await readFile('workspace.json') : await idb('state', 'readonly', store => store.get('workspace'))
        if (raw == null) {
            const backup = native ? await readFile('workspace.bak.json') : await idb('state', 'readonly', store => store.get('backup'))
            if (backup != null) throw new Error('本地文章文件丢失，备份仍在，请先恢复备份，避免生成空白工作区')
            return null
        }
        try { return JSON.parse(raw) }
        catch { throw new Error('本地文章文件损坏，已保留原文件和备份，请先恢复备份') }
    },
    async writeState(state: object) {
        const data = JSON.stringify(state)
        if (native) {
            const previous = await readFile('workspace.json')
            if (previous !== null) await Filesystem.writeFile({ path: `${root}/workspace.bak.json`, data: previous,
                directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
            await Filesystem.writeFile({ path: `${root}/workspace.tmp.json`, data, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
            await Filesystem.rename({ from: `${root}/workspace.tmp.json`, to: `${root}/workspace.json`, directory: Directory.Data })
        } else {
            const db = await database()
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction('state', 'readwrite')
                const store = transaction.objectStore('state')
                const previous = store.get('workspace')
                previous.onsuccess = () => { if (previous.result != null) store.put(previous.result, 'backup'); store.put(data, 'workspace') }
                transaction.oncomplete = () => resolve()
                transaction.onerror = transaction.onabort = () => reject(new Error('本地保存失败，请检查设备剩余空间后重试'))
            })
        }
    },
    async writeAsset(key: string, bytes: Uint8Array) {
        const data = encodeBase64(bytes)
        if (native) await Filesystem.writeFile({ path: `${root}/assets/${key}`, data, directory: Directory.Data, recursive: true })
        else await idb('assets', 'readwrite', store => store.put(data, key))
    },
    async readAsset(key: string) {
        const data = native ? (await Filesystem.readFile({ path: `${root}/assets/${key}`, directory: Directory.Data })).data
            : await idb('assets', 'readonly', store => store.get(key))
        if (typeof data !== 'string') throw new Error('本地图片文件丢失，请重新插入图片后再同步')
        return data
    },
}

// The browser build is a development preview. It keeps tokens in memory only.
const previewTokens = new Map<string, string>()
export const credentials = {
    async get(key: string) { return native ? (await vault.get({ key })).value : previewTokens.get(key) || null },
    async set(key: string, value: string) { if (native) await vault.set({ key, value }); else previewTokens.set(key, value) },
    async remove(key: string) { if (native) await vault.remove({ key }); else previewTokens.delete(key) },
}

export async function exportFile(filename: string, text: string) {
    if (native) {
        const path = `hexopro-exports/${filename.replace(/[\\/:*?"<>|]/g, '_')}`
        await Filesystem.writeFile({ path, data: text, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
        await Share.share({ title: filename, url: uri, dialogTitle: '导出文章' })
    } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url; link.download = filename; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }
}

export { native, decodeBase64 }
