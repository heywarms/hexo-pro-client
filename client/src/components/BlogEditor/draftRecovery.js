// Shared with the Node regression tests, like autoSave.js.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createAutoSave } = require('./autoSave')

// Each editor owns one record. A successful save in another tab must never
// remove this editor's unsaved work.
function createRecoverableSave(save, { documentKey, storage, sessionId, onStatus, onError, delay = 1000 }) {
    let revision
    let draft = {}
    let persistence = Promise.resolve()
    const id = `${documentKey}:${sessionId}`
    const persist = () => {
        const record = { id, documentKey, baseRevision: revision, update: { ...draft }, savedAt: Date.now() }
        persistence = persistence.catch(() => {}).then(() => Object.keys(record.update).length
            ? storage.put(record) : storage.remove(id))
        // Observe immediately, even if the user leaves before the debounce fires.
        persistence.catch(onError)
        return persistence
    }
    const queue = createAutoSave(async update => {
        // Retry storage as well as the network: a failed disk write must not
        // poison every later retry when no further keystroke occurs.
        await persist()
        const result = await save({ ...update, ...(revision ? { baseRevision: revision } : {}) })
        revision = result?.revision || result?.post?.revision || result?.page?.revision || revision
        for (const key of Object.keys(update)) {
            if (draft[key] === update[key]) delete draft[key]
        }
        await persist()
        return result
    }, { delay, onStatus, onError })

    return {
        ...queue,
        enqueue(update) {
            draft = { ...draft, ...update }
            persist()
            queue.enqueue(update)
        },
        setRevision(value) { revision = value },
        list: () => storage.list(documentKey).then(records => records.filter(record => record.id !== id)),
        discard: record => storage.remove(record.id),
        async restore(record) {
            if (queue.hasPending()) throw new Error('请先保存或导出当前修改，再恢复另一份草稿')
            revision = record.baseRevision
            draft = { ...record.update }
            await persist()
            await storage.remove(record.id)
            queue.enqueue(draft)
            return { ...draft }
        },
        snapshot: () => ({ ...draft }),
    }
}

let databasePromise
function database() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('hexopro-editor-recovery', 1)
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore('drafts', { keyPath: 'id' })
            store.createIndex('documentKey', 'documentKey')
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => { databasePromise = undefined; reject(new Error('无法保存本地恢复副本，请检查磁盘空间或浏览器存储权限')) }
    })
    return databasePromise
}

async function transaction(mode, operation) {
    const db = await database()
    return new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', mode)
        const request = operation(tx.objectStore('drafts'))
        tx.oncomplete = () => resolve(request.result)
        tx.onerror = tx.onabort = () => reject(new Error('本地恢复副本保存失败，请导出当前内容后重试'))
    })
}

const recoveryStorage = {
    put: record => transaction('readwrite', store => store.put(record)),
    remove: id => transaction('readwrite', store => store.delete(id)),
    list: key => transaction('readonly', store => store.index('documentKey').getAll(key)),
}

module.exports = { createRecoverableSave, recoveryStorage }
