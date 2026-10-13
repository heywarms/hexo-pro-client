import { useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { createRecoverableSave, recoveryStorage } from './draftRecovery'

export type SaveStatus = 'saved' | 'waiting' | 'saving' | 'error'

export default function useDocumentSave(save: (update: Record<string, unknown>) => Promise<unknown>, documentKey: string) {
    const [status, setStatus] = useState<SaveStatus>('saved')
    const [recoveries, setRecoveries] = useState<any[]>([])
    const [saveError, setSaveError] = useState<any>(null)
    const session = useMemo(() => ({ active: true, save, documentKey }), [save, documentKey])
    const queue = useMemo(() => createRecoverableSave(save, {
        documentKey,
        storage: recoveryStorage,
        sessionId: Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'),
        onStatus: setStatus,
        onError: error => { if (session.active) { setSaveError(error); message.error(`文章保存失败：${error.message}`) } },
    }), [save, documentKey, session])

    useEffect(() => {
        setStatus('saved')
        setSaveError(null)
        setRecoveries([])
        session.active = true
        let active = true
        queue.list().then(records => { if (active) setRecoveries(records.sort((a, b) => b.savedAt - a.savedAt)) })
            .catch(error => { if (active) setSaveError(error) })
        queue.setListener(value => { setStatus(value); if (value === 'saved') setSaveError(null) })
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (queue.hasPending()) {
                event.preventDefault()
                event.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => {
            active = false
            session.active = false
            window.removeEventListener('beforeunload', beforeUnload)
            queue.setListener(null)
            queue.flush().catch(error => message.error(`文章保存失败：${error.message}`))
        }
    }, [queue, session])

    return {
        status,
        enqueue: queue.enqueue,
        flush: queue.flush,
        retry: () => queue.flush().catch(error => message.error(`文章保存失败：${error.message}`)),
        setRevision: queue.setRevision,
        recoveries,
        saveError,
        snapshot: queue.snapshot,
        restore: async (record) => {
            const update = await queue.restore(record)
            setRecoveries(records => records.filter(item => item.id !== record.id))
            return update
        },
        discard: async (record) => {
            await queue.discard(record)
            setRecoveries(records => records.filter(item => item.id !== record.id))
        },
    }
}
