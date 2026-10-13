
import { service } from '@/utils/api'
import React, { useCallback, useEffect, useRef, useState, useContext, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { PageSettings } from './pageSettings'
import { useNavigate } from "react-router-dom"
import ErrorDisplay from '@/components/ErrorDisplay'
import BlogEditor from '@/components/BlogEditor'
import useDocumentSave from '@/components/BlogEditor/useDocumentSave'
import RecoveryNotice from '@/components/BlogEditor/RecoveryNotice'
import { reviewSaveConflict } from '@/components/BlogEditor/resolveConflict'
import EditorHeader from '../../components/EditorHeader'
import AIChatPanel from '@/components/AIChatPanel'
import useLocale from '@/hooks/useLocale'
import { message, Skeleton } from 'antd'
import styles from '../../style/index.module.less'
import { GlobalContext } from '@/context'


type Page = {
    isDraft: boolean
    isDiscarded: boolean
    source: string
}

function Page() {
    const navigate = useNavigate()
    const postRef = useRef(null)
    const loadRevision = useRef(0)
    const editorWapperRef = useRef(null)
    const { _id } = useParams()
    const documentSession = useMemo(() => ({ active: true, documentId: _id }), [_id])
    const [page, setPage] = useState({ isDraft: true, source: null, permalink: null })
    const [pageMetaData, setPageMetadata] = useState({ tags: [], categories: [], frontMatter: {}, source: '' })
    const [doc, setDoc] = useState('')
    const [title, setTitle] = useState('')
    const latestEditor = useRef({ title, content: doc })
    latestEditor.current = { title, content: doc }
    // const [rendered, setRendered] = useState('');
    const [previewRevision, setPreviewRevision] = useState(0)
    const [error, setError] = useState<Error | null>(null)
    const [visible, setVisible] = useState(false)
    const [aiPanelVisible, setAiPanelVisible] = useState(false)
    const t = useLocale()
    const [isDataLoading, setIsDataLoading] = useState(true)
    const [editorReady, setEditorReady] = useState(false)

    const { theme } = useContext(GlobalContext)

    const skeletonStyle = theme === 'dark' ? {
        backgroundColor: '#333', // 暗黑主题背景色
        color: '#fff' // 暗黑主题文字颜色
    } : {
        backgroundColor: '#fff', // 明亮主题背景色
        color: '#000' // 明亮主题文字颜色
    }

    const queryPageById = (_id) => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/pages/' + encodeURIComponent(_id)).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const postMeta = () => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/pageMeta/' + encodeURIComponent(_id)).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const fetch = () => {
        return {
            page: queryPageById(_id),
            pageMeta: postMeta()
        }
    }

    const dataDidLoad = (name, data) => {
        if (name === 'pageMeta') {
            setPageMetadata(data)
            return
        }

        if (name === 'page') {
            if (data.documentId && data.documentId !== _id) {
                navigate(`/page/${data.documentId}`, { replace: true })
                return
            }
            autosave.setRevision(data.revision)
            setTitle(data.title)
            // setRendered(raw)
            setPage(data)
            const content = (data)._content
            setDoc(content)
        }
    }

    const handleChange = async (update) => {
        autosave.enqueue(update)
        await autosave.flush()
        setPreviewRevision(v => v + 1)
    }

    const handleChangeTitle = (v) => {
        if (v === title) {
            return
        }
        setTitle(v)
        postRef.current({ title: v })
    }

    const handleChangeContent = (text) => {
        // 同步本地状态，保证 AI 插入等场景拿到的是最新内容
        setDoc(text)
        postRef.current({ _content: text })
    }

    const removePage = async () => {
        await autosave.flush()
        const promise = new Promise((resolve, reject) => {
            service.get('/hexopro/api/pages/' + encodeURIComponent(_id) + '/remove').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
        await promise
        if (!documentSession.active) return
        navigate(`/content/pages`)
    }

    const handleUpdate = useCallback(async (update) => {
        const requestRevision = loadRevision.current
        const res = await service.post('/hexopro/api/page/update', { _id, update })
        if (documentSession.active && requestRevision === loadRevision.current && res.data.page?.permalink) setPage(current => ({ ...current, permalink: res.data.page.permalink }))
        return res.data
    }, [_id, documentSession])
    const autosave = useDocumentSave(handleUpdate, `page:${_id}`)
    postRef.current = autosave.enqueue

    const restoreContent = (update) => {
        if (!documentSession.active) return
        if (typeof update.title === 'string') setTitle(update.title)
        if (typeof update._content === 'string') setDoc(update._content)
        setPageMetadata(current => ({ ...current, source: update.source ?? current.source,
            frontMatter: update.frontMatter ?? current.frontMatter }))
    }
    const resolveConflict = async () => {
        const remote = (await service.get('/hexopro/api/pages/' + encodeURIComponent(_id))).data
        if (!documentSession.active) return
        const shown = latestEditor.current
        await reviewSaveConflict({ remote, ...shown, isActive: () => documentSession.active, onKeepLocal: async (revision) => {
            if (latestEditor.current.title !== shown.title || latestEditor.current.content !== shown.content) {
                throw new Error('编辑内容已变化，请重新打开版本比较后再保存')
            }
            autosave.setRevision(revision)
            autosave.enqueue({ title: shown.title, _content: shown.content })
            await autosave.flush()
        } })
    }

    const handleAIClick = () => {
        setAiPanelVisible(!aiPanelVisible)
    }

    const handleInsertContent = (content: string) => {
        const base = doc || ''
        const newContent = base + '\n\n' + content
        // 更新本地状态
        setDoc(newContent)
        // 触发编辑器内容和后端更新
        postRef.current({ _content: newContent })
    }


    const fetchData = async () => {
        const revision = ++loadRevision.current
        setIsDataLoading(true)
        setEditorReady(false)
        try {
            const items = fetch()
            const promises = Object.keys(items).map((name) => {
                return Promise.resolve(items[name]).then((data) => {
                    if (revision !== loadRevision.current) return
                    if (dataDidLoad) {
                        dataDidLoad(name, data)
                    }
                })
            })
            await Promise.all(promises)
            if (revision === loadRevision.current) setError(null)
        } catch (error) {
            if (revision !== loadRevision.current) return
            setError(error as Error)
            message.error('加载失败：' + (error as Error).message)
        } finally {
            if (revision === loadRevision.current) setIsDataLoading(false)
        }
    }

    useEffect(() => {
        documentSession.active = true
        fetchData()
        return () => { documentSession.active = false; loadRevision.current++ }
    }, [_id])

    const handleEditorReady = useCallback(() => {
        setEditorReady(true)
    }, [])


    // const [editorRef, editorView] = MarkDownEditor({ initialValue: doc, adminSettings: { editor: { lineNumbers: true } }, setRendered, handleChangeContent, handleScroll, forceLineNumbers: lineNumber })
    return (
        <div className={styles['editor-page']} data-theme={theme}>
            {/* 编辑器区域 */}
            <div
                className={styles['editor-layout']}
                ref={editorWapperRef}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {error ? <ErrorDisplay error={error} onRetry={fetchData} /> : <><Skeleton
                    paragraph={{ rows: 10 }}
                    loading={isDataLoading || !editorReady}
                    active
                    className={styles['skeleton']}
                    style={{ ...skeletonStyle }}
                />
                <EditorHeader
                    isPage={true}
                    beforeBack={autosave.flush}
                    permalink={page.permalink} // 桌面端使用需要替换域名为localhost:4000
                    isDraft={false}
                    handlePublish={() => { }}
                    handleUnpublish={() => { }}
                    className={styles['editor-header']}
                    initTitle={title}
                    popTitle={t['editor.header.pop.title']}
                    popDes={t['page.editor.header.pop.des']}
                    handleSettingClick={() => setVisible(true)}
                    handleRemoveSource={removePage}
                    handleAIClick={handleAIClick}
                />
                {!isDataLoading && <RecoveryNotice autosave={autosave} onRestore={restoreContent} title={title} content={doc} onResolveConflict={resolveConflict} />}
                <div className={styles['editor-main']}>
                    {!isDataLoading && <BlogEditor
                        key={_id}
                        id={_id}
                        kind="page"
                        value={doc}
                        title={title}
                        onChange={handleChangeContent}
                        onReady={handleEditorReady}
                        onChangeTitle={handleChangeTitle}
                        saveStatus={autosave.status}
                        onRetrySave={autosave.retry}
                        previewRevision={previewRevision}
                    />}
                </div>
                <PageSettings
                    visible={visible}
                    setVisible={setVisible}
                    pageMeta={pageMetaData}
                    setPageMeta={setPageMetadata}
                    handleChange={handleChange}
                />
                </>}
            </div>
            {/* AI聊天面板 - 右侧侧栏 */}
            {aiPanelVisible && (
                <div className={styles['ai-panel-wrap']}>
                    <AIChatPanel
                        visible={aiPanelVisible}
                        onClose={() => setAiPanelVisible(false)}
                        onInsertContent={handleInsertContent}
                    />
                </div>
            )}
        </div>
    )
}

export default Page
