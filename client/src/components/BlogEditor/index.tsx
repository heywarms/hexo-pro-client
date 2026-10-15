import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Button, Tooltip } from 'antd'
import { AppstoreOutlined, CodeOutlined, EyeOutlined, CheckOutlined, LoadingOutlined } from '@ant-design/icons'
import { GlobalContext } from '@/context'
import BlockEditor from './BlockEditor'
import SourceEditor from './SourceEditor'
import DocumentTitle from './DocumentTitle'
import ThemePreview from './ThemePreview'
import { getMarkdownIssue } from './markdownSafety.mjs'
import styles from './style.module.less'

type Props = {
    id: string
    kind: 'post' | 'page'
    value: string
    title: string
    onChange: (value: string) => void
    onReady: () => void
    onChangeTitle: (title: string) => void
    saveStatus: 'saved' | 'waiting' | 'saving' | 'error'
    onRetrySave: () => void
    previewRevision?: number
}

export default function BlogEditor({ id, kind, value, title, onChange, onReady, onChangeTitle, saveStatus, onRetrySave, previewRevision }: Props) {
    const { theme } = useContext(GlobalContext)
    const [mode, setMode] = useState(() => localStorage.getItem('hexoProEditorEngine') === 'source' ? 'source' : 'blocks')
    const [preview, setPreview] = useState<'off' | 'split' | 'full'>('off')
    const [fallback, setFallback] = useState({ value: '', reason: '' })
    const syntaxIssue = useMemo(() => getMarkdownIssue(value), [value])
    const reason = syntaxIssue || (fallback.value === value ? fallback.reason : '')
    const activeMode = reason ? 'source' : mode
    const characterCount = useMemo(() => Array.from(value.replace(/\s/g, '')).length, [value])
    const handleFallback = useCallback((reason: string) => {
        setFallback({ value, reason })
        setMode('source')
    }, [value])
    useEffect(() => {
        if (reason) setMode('source')
    }, [reason])
    const changeMode = (mode: string) => {
        setMode(mode)
        localStorage.setItem('hexoProEditorEngine', mode)
    }

    return <div className={styles.editor} data-theme={theme === 'dark' ? 'dark' : 'light'}>
        <div className={styles.toolbar}>
            <div className={styles.modeSwitcher} role="group" aria-label="编辑模式">
                <Tooltip title={reason ? `含有${reason}，使用源码编辑可完整保留` : '像 Notion 一样按块写作'}>
                    <span><Button type="text" aria-label="块编辑" disabled={!!reason} aria-pressed={activeMode === 'blocks'} icon={<AppstoreOutlined />} onClick={() => changeMode('blocks')}>块编辑</Button></span>
                </Tooltip>
                <Button type="text" aria-label="Markdown 源码" aria-pressed={activeMode === 'source'} icon={<CodeOutlined />} onClick={() => changeMode('source')}>Markdown 源码</Button>
            </div>
            <div className={styles.toolbarActions}>
                <span className={styles.saveStatus} data-status={saveStatus} role="status">
                    {saveStatus === 'saved' ? <><CheckOutlined /> 已保存</>
                        : saveStatus === 'error' ? <Button size="small" danger onClick={onRetrySave}>保存失败 · 重试</Button>
                            : <><LoadingOutlined spin={saveStatus === 'saving'} /> {saveStatus === 'saving' ? '保存中…' : '等待保存'}</>}
                </span>
                <Button className={styles.previewToggle} aria-label="主题预览" aria-pressed={preview !== 'off'} icon={<EyeOutlined />} onClick={() => setPreview(v => v === 'off' ? 'split' : 'off')}>主题预览</Button>
            </div>
        </div>
        {reason && <div className={styles.compatibilityNote} role="note">这篇文章含有{reason}，已保留源码编辑。主题预览仍可使用。</div>}
        <div className={styles.workspace} data-preview={preview}>
            <div className={styles.writingPane} data-expanded-preview={preview === 'full'}>
                <div className={styles.writingScroll}>
                    <div className={`${styles.documentCanvas} ${activeMode === 'source' ? styles.sourceDocument : ''}`}>
                        <DocumentTitle title={title} onChange={onChangeTitle} />
                        <div className={styles.writingHint}>{activeMode === 'blocks'
                            ? <><kbd>/</kbd><span>插入内容</span><span className={styles.hintDot}>·</span><span>拖动左侧手柄调整顺序</span></>
                            : '直接编辑 Markdown 源码'}</div>
                        {activeMode === 'blocks'
                            ? <div className={styles.blockCanvas}><BlockEditor value={value} onChange={onChange} onReady={onReady} onFallback={handleFallback} /></div>
                            : <div className={styles.sourceCanvas}><SourceEditor value={value} onChange={onChange} onReady={onReady} /></div>}
                    </div>
                </div>
                <div className={styles.documentFooter}><span>{characterCount.toLocaleString()} 字符</span><span>更改自动保存</span></div>
            </div>
            {preview !== 'off' && <ThemePreview id={id} kind={kind} content={value} title={title} revision={previewRevision}
                expanded={preview === 'full'} onExpand={() => setPreview(v => v === 'full' ? 'split' : 'full')} onClose={() => setPreview('off')} />}
        </div>
    </div>
}
