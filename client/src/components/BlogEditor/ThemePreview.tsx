import React, { useEffect, useState } from 'react'
import { Alert, Button, Spin, Tooltip } from 'antd'
import { CloseOutlined, ExpandOutlined, ReloadOutlined, ShrinkOutlined } from '@ant-design/icons'
import { service } from '@/utils/api'
import styles from './style.module.less'

type Props = {
    id: string
    kind: 'post' | 'page'
    content: string
    title: string
    revision?: number
    expanded: boolean
    onExpand: () => void
    onClose: () => void
}

function withAssetBase(html: string, baseURL: string) {
    const document = new DOMParser().parseFromString(html, 'text/html')
    document.querySelectorAll('base').forEach(base => base.remove())
    const base = document.createElement('base')
    base.href = baseURL
    document.head.prepend(base)
    return '<!doctype html>\n' + document.documentElement.outerHTML
}

export default function ThemePreview({ id, kind, content, title, revision, expanded, onExpand, onClose }: Props) {
    const [html, setHTML] = useState('')
    const [theme, setTheme] = useState('')
    const [loading, setLoading] = useState(true)
    const [frameLoading, setFrameLoading] = useState(true)
    const [frameRevision, setFrameRevision] = useState(0)
    const [error, setError] = useState('')
    const [refresh, setRefresh] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError('')
        const timer = window.setTimeout(async () => {
            try {
                const res = await service.post(`/hexopro/api/preview/${kind}/${encodeURIComponent(id)}`,
                    { content, title }, { signal: controller.signal })
                if (controller.signal.aborted) return
                if (!res.data?.html) throw new Error(res.data?.msg || '主题未返回预览内容')
                setFrameLoading(true)
                setFrameRevision(v => v + 1)
                setHTML(withAssetBase(res.data.html, res.data.baseURL))
                setTheme(res.data.theme)
            } catch (failure) {
                if (!controller.signal.aborted) {
                    setError((failure as Error).message)
                    setFrameLoading(false)
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }, refresh ? 100 : 650)
        return () => { window.clearTimeout(timer); controller.abort() }
    }, [id, kind, content, title, revision, refresh])

    return <aside className={styles.preview} aria-label="当前主题预览" aria-busy={loading || frameLoading}>
        <div className={styles.previewHeader}>
            <div>
                <div className={styles.previewTitleRow}><strong>主题预览</strong>{theme && <span className={styles.themeName}>{theme}</span>}</div>
                <span className={styles.previewCaption}><span className={styles.liveDot} data-loading={loading || frameLoading} />{loading || frameLoading ? '正在更新…' : '与当前内容同步'}</span>
            </div>
            <div className={styles.previewActions}>
                <Tooltip title="刷新主题预览"><Button type="text" aria-label="刷新主题预览" icon={<ReloadOutlined spin={loading} />} onClick={() => setRefresh(v => v + 1)} /></Tooltip>
                <Tooltip title={expanded ? '并排编辑' : '放大预览'}><Button type="text" aria-label={expanded ? '并排编辑' : '放大预览'} icon={expanded ? <ShrinkOutlined /> : <ExpandOutlined />} onClick={onExpand} /></Tooltip>
                <Tooltip title="关闭主题预览"><Button type="text" aria-label="关闭主题预览" icon={<CloseOutlined />} onClick={onClose} /></Tooltip>
            </div>
        </div>
        {error ? <div className={styles.previewError}><Alert type="error" showIcon message="主题预览失败" description={error} action={<Button onClick={() => setRefresh(v => v + 1)}>重试</Button>} /></div>
            : html ? <div className={styles.previewContent}>
                <iframe key={frameRevision} title="文章在当前 Hexo 主题中的预览" srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer" className={styles.previewFrame} onLoad={() => setFrameLoading(false)} />
                {frameLoading && <div className={styles.frameLoading}><Spin tip="正在加载主题…"><div style={{ height: 80, width: 180 }} /></Spin></div>}
            </div>
                : <div className={styles.previewLoading}><Spin tip="正在渲染当前主题…"><div style={{ height: 80, width: 220 }} /></Spin></div>}
    </aside>
}
