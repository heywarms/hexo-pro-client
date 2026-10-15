import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, message, Tooltip } from 'antd'
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import styles from './style.module.less'

type Props = {
    title: string
    onChange: (title: string) => void
}

export default function DocumentTitle({ title, onChange }: Props) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(title)
    const field = useRef<HTMLTextAreaElement>(null)
    const trigger = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (editing) field.current?.focus()
    }, [editing])
    useLayoutEffect(() => {
        if (!field.current) return
        field.current.style.height = 'auto'
        field.current.style.height = `${field.current.scrollHeight}px`
    }, [draft, editing])

    const finish = () => {
        setEditing(false)
        requestAnimationFrame(() => trigger.current?.focus())
    }
    const save = () => {
        const next = draft.trim().replace(/\s*\n+\s*/g, ' ')
        if (!next) { message.error('标题不能为空'); return }
        if (next !== title) onChange(next)
        finish()
    }

    return <div className={styles.documentTitle}>
        {editing ? <>
            <textarea ref={field} className={styles.titleField} aria-label="文章标题" rows={1} value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                    if (event.nativeEvent.isComposing) return
                    if (event.key === 'Enter') { event.preventDefault(); save() }
                    if (event.key === 'Escape') { event.preventDefault(); finish() }
                }} />
            <div className={styles.titleEditActions}>
                <Button type="text" size="small" icon={<CloseOutlined />} aria-label="取消编辑标题" onClick={finish}>取消</Button>
                <Button type="text" size="small" icon={<CheckOutlined />} aria-label="保存标题" onClick={save}>保存</Button>
            </div>
        </> : <>
            <h1>{title || '未命名文章'}</h1>
            <Tooltip title="编辑标题"><button ref={trigger} className={styles.titleTrigger} aria-label="编辑标题" onClick={() => { setDraft(title); setEditing(true) }}><EditOutlined /></button></Tooltip>
        </>}
    </div>
}
