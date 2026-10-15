// Merge edits inside the debounce window and serialize writes to the article.
/**
 * @param {(update: Record<string, unknown>) => Promise<unknown>} save
 * @param {{delay?: number, onStatus?: (status: 'saved' | 'waiting' | 'saving' | 'error') => void, onError?: (error: Error) => void}} options
 */
function createAutoSave(save, { delay = 1000, onStatus = () => {}, onError = () => {} } = {}) {
    let pending = {}
    let timer
    let running
    let listener = onStatus
    const report = status => listener?.(status)
    const clearTimer = () => { clearTimeout(timer); timer = undefined }

    function write() {
        clearTimer()
        const batch = pending
        pending = {}
        report('saving')
        running = Promise.resolve().then(() => save(batch))
            .then(() => report(Object.keys(pending).length ? 'waiting' : 'saved'))
            .catch(error => {
                pending = { ...batch, ...pending }
                report('error')
                onError(error)
                throw error
            })
            .finally(() => { running = undefined })
        return running
    }

    async function flush() {
        clearTimer()
        while (running || Object.keys(pending).length) {
            await (running || write())
        }
    }

    return {
        enqueue(update) {
            pending = { ...pending, ...update }
            report(running ? 'saving' : 'waiting')
            clearTimer()
            timer = setTimeout(() => flush().catch(() => {}), delay)
        },
        flush,
        hasPending: () => !!running || Object.keys(pending).length > 0,
        setListener: value => { listener = value },
    }
}

module.exports = { createAutoSave }
