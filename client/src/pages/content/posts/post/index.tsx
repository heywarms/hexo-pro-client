import { service } from '@/utils/api'
import React, { useCallback, useEffect, useRef, useState, useContext, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { message, Skeleton } from 'antd'
import ErrorDisplay from '@/components/ErrorDisplay'
import { PostSettings } from './postSetting'
import { useNavigate } from "react-router-dom"
import BlogEditor from '@/components/BlogEditor'
import useDocumentSave from '@/components/BlogEditor/useDocumentSave'
import RecoveryNotice from '@/components/BlogEditor/RecoveryNotice'
import { reviewSaveConflict } from '@/components/BlogEditor/resolveConflict'
import EditorHeader from '../../components/EditorHeader'
import AIChatPanel from '@/components/AIChatPanel'
import useLocale from '@/hooks/useLocale'
import styles from '../../style/index.module.less'
import { GlobalContext } from '@/context'


function Post() {
    const navigate = useNavigate()
    const postRef = useRef(null)
    const loadRevision = useRef(0)
    const editorWapperRef = useRef(null)
    const { _id } = useParams()
    const sourceState = useMemo(() => ({ value: '', active: true, documentId: _id }), [_id])
    const [post, setPost] = useState({ isDraft: true, source: null, permalink: null, title: null })
    const [tagsCatMeta, setTagsCatMeta] = useState({})
    const [postMetaData, setPostMetadata] = useState({ tags: [], categories: [], frontMatter: {} })
    const [doc, setDoc] = useState('')
    const [title, setTitle] = useState('')
    const latestEditor = useRef({ title, content: doc })
    latestEditor.current = { title, content: doc }
    const [rendered, setRendered] = useState('')
    const [previewRevision, setPreviewRevision] = useState(0)
    const [visible, setVisible] = useState(false)
    const [aiPanelVisible, setAiPanelVisible] = useState(false)

    const [isDataLoading, setIsDataLoading] = useState(true)
    const [editorReady, setEditorReady] = useState(false)
    const [error, setError] = useState<Error | null>(null)
    const { theme } = useContext(GlobalContext)

    const skeletonStyle = theme === 'dark' ? {
        backgroundColor: '#333', // 暗黑主题背景色
        color: '#fff' // 暗黑主题文字颜色
    } : {
        backgroundColor: '#fff', // 明亮主题背景色
        color: '#000' // 明亮主题文字颜色
    }

    const t = useLocale()

    const queryPostById = (_id) => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/posts/' + encodeURIComponent(_id)).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const tagsCategoriesAndMetadata = () => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/tags-categories-and-metadata').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const postMeta = () => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/postMeta/' + encodeURIComponent(_id)).then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const settings = () => {
        return new Promise((resolve, reject) => {
            service.get('/hexopro/api/settings/list').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const fetch = () => {
        return {
            post: queryPostById(_id),
            tagsCategoriesAndMetadata: tagsCategoriesAndMetadata(),
            settings: settings(),
            postMeta: postMeta()
        }
    }

    const dataDidLoad = (name, data) => {
        if (name === 'postMeta') {
            setPostMetadata(data)
            return
        }
        if (name === 'tagsCategoriesAndMetadata') {
            setTagsCatMeta(data)
            return
        }
        if (name === 'post') {
            if (data.documentId && data.documentId !== _id) {
                navigate(`/post/${data.documentId}`, { replace: true })
                return
            }
            sourceState.value = data.source
            autosave.setRevision(data.revision)
            setTitle(data.title)
            setRendered(data._content || '')
            setPost(data)
            const content = (data)._content
            setDoc(content)
        }
    }

    const handleChange = async (update) => {
        autosave.enqueue(update)
        await autosave.flush()
        setPreviewRevision(v => v + 1)
    }

    const handleChangeTitle = (value: string) => {
        const nextTitle = String(value || '').trim()
        if (!nextTitle || nextTitle === title) return
        setTitle(nextTitle)
        postRef.current({ title: nextTitle })
    }

    const handleChangeContent = (text) => {
        if (text === rendered) {
            return
        }
        // 同步本地内容（用于 AI 插入等场景）
        setRendered(text)
        setDoc(text)
        postRef.current({ _content: text })
    }

    const removeBlog = async () => {
        await autosave.flush()
        const promise = new Promise((resolve, reject) => {
            service.get('/hexopro/api/posts/' + encodeURIComponent(_id) + '/remove').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
        await promise
        if (!sourceState.active) return
        if (post.isDraft) {
            navigate(`/content/posts/drafts`)
        } else {
            navigate(`/content/posts/blogs`)
        }
    }

    const publish = async () => {
        try {
            await autosave.flush()
            const saved: any = await handlePublish()
            if (!sourceState.active) return
            sourceState.value = saved.source
            setPost(saved)
            autosave.setRevision(saved.revision || (await service.get('/hexopro/api/posts/' + encodeURIComponent(_id))).data.revision)
        } catch (err) {
            message.error(err.message)
        }
    }

    const handlePublish = () => {
        if (!post.isDraft) {
            return
        }
        return new Promise((resolve, reject) => {
            service.post('/hexopro/api/posts/' + encodeURIComponent(_id) + '/publish').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const unpublish = async () => {
        try {
            await autosave.flush()
            const saved: any = await handleUnpublish()
            if (!sourceState.active) return
            sourceState.value = saved.source
            setPost(saved)
            autosave.setRevision(saved.revision || (await service.get('/hexopro/api/posts/' + encodeURIComponent(_id))).data.revision)
        } catch (err) {
            message.error(err.message)
        }
    }

    const handleUnpublish = () => {
        if (post.isDraft) {
            return
        }
        return new Promise((resolve, reject) => {
            service.post('/hexopro/api/posts/' + encodeURIComponent(_id) + '/unpublish').then((res) => {
                resolve(res.data)
            }).catch(err => {
                reject(err)
            })
        })
    }

    const handleUpdate = useCallback(async (update) => {
        const requestRevision = loadRevision.current
        const payload = { ...update }
        if (typeof payload.title === 'string') {
            // Validation belongs to the same queue as body writes and publish.
            const checked = await service.get('/hexopro/api/posts/check-title', { params: { title: payload.title, excludeId: _id } })
            if (checked.data.exists) payload.title = `${payload.title} (${Date.now()})`
            if (sourceState.value) {
                const parts = sourceState.value.split('/')
                const filename = payload.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '') || '未命名'
                parts[parts.length - 1] = `${filename}.md`
                payload.source = parts.join('/')
            }
        }
        const res = await service.post('/hexopro/api/post/update/' + encodeURIComponent(_id), payload)
        const saved = res.data.post
        if (saved?.source) sourceState.value = saved.source
        if (sourceState.active && requestRevision === loadRevision.current) {
            if (saved) setPost(current => ({ ...current, permalink: saved.permalink, source: saved.source, title: saved.title }))
            if (payload.title !== update.title) setTitle(current => current === update.title ? payload.title : current)
        }
        return res.data
    }, [_id, sourceState])
    const autosave = useDocumentSave(handleUpdate, `post:${_id}`)
    postRef.current = autosave.enqueue
    const restoreContent = (update) => {
        if (!sourceState.active) return
        if (typeof update.title === 'string') setTitle(update.title)
        if (typeof update._content === 'string') { setDoc(update._content); setRendered(update._content) }
        setPostMetadata(current => ({ ...current, tags: update.tags ?? current.tags,
            categories: update.categories ?? current.categories, frontMatter: update.frontMatter ?? current.frontMatter }))
    }
    const resolveConflict = async () => {
        const remote = (await service.get('/hexopro/api/posts/' + encodeURIComponent(_id))).data
        if (!sourceState.active) return
        const shown = latestEditor.current
        await reviewSaveConflict({ remote, ...shown, isActive: () => sourceState.active, onKeepLocal: async (revision) => {
            if (latestEditor.current.title !== shown.title || latestEditor.current.content !== shown.content) {
                throw new Error('编辑内容已变化，请重新打开版本比较后再保存')
            }
            sourceState.value = remote.source
            autosave.setRevision(revision)
            autosave.enqueue({ title: shown.title, _content: shown.content })
            await autosave.flush()
        } })
    }

    const handleAIClick = () => {
        setAiPanelVisible(!aiPanelVisible)
    }

    const handleInsertContent = (content: string) => {
        // 在当前文档末尾插入 AI 内容，但不关闭面板
        const base = doc || ''
        const newContent = base + '\n\n' + content
        // 更新本地状态，驱动编辑器刷新
        setDoc(newContent)
        setRendered(newContent)
        // 触发后端保存
        postRef.current({ _content: newContent })
    }

    const retryFetch = () => {
        setError(null)
        fetchData()
    }

    const fetchData = async () => {
        const revision = ++loadRevision.current
        try {
            setIsDataLoading(true)
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
            if (revision !== loadRevision.current) return
            setError(null)
        } catch (err) {
            if (revision !== loadRevision.current) return
            setError(err as Error)
            message.error('加载失败: ' + (err as Error).message)
        } finally {
            if (revision === loadRevision.current) setIsDataLoading(false)
        }
    }

    const handleEditorReady = useCallback(() => {
        setEditorReady(true)
    }, [])

    useEffect(() => {
        sourceState.active = true
        setEditorReady(false)
        fetchData()
        return () => { sourceState.active = false; loadRevision.current++ }
    }, [_id])

    return (
        <div className={styles['editor-page']} data-theme={theme}>
            {/* 编辑器区域 */}
            <div
                className={styles['editor-layout']}
                ref={editorWapperRef}
                style={{
                    display: 'flex',
                    flex: 1,
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {error ? (
                    <ErrorDisplay error={error} onRetry={retryFetch} />
                ) : (
                    <>
                        <Skeleton
                            paragraph={{ rows: 10 }}
                            loading={isDataLoading || !editorReady}
                            active
                            className={styles['skeleton']}
                            style={{ ...skeletonStyle }}
                        />
                        <EditorHeader
                            isPage={false}
                            beforeBack={autosave.flush}
                            permalink={post.permalink} // 桌面端使用需要替换域名为localhost:4000
                            isDraft={post.isDraft}
                            handlePublish={publish}
                            handleUnpublish={unpublish}
                            className={styles['editor-header']}
                            initTitle={title}
                            popTitle={t['editor.header.pop.title']}
                            popDes={t['post.editor.header.pop.des']}
                            handleSettingClick={() => setVisible(true)}
                            handleRemoveSource={removeBlog}
                            handleAIClick={handleAIClick}
                        />
                        {!isDataLoading && <RecoveryNotice autosave={autosave} onRestore={restoreContent} title={title} content={doc} onResolveConflict={resolveConflict} />}
                        <div className={styles['editor-main']}>
                            {!isDataLoading && <BlogEditor
                                key={_id}
                                id={_id}
                                kind="post"
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
                        <PostSettings
                            visible={visible}
                            setVisible={setVisible}
                            tagCatMeta={tagsCatMeta}
                            setTagCatMeta={setTagsCatMeta}
                            postMeta={postMetaData}
                            setPostMeta={setPostMetadata}
                            handleChange={handleChange}
                        />
                    </>
                )}
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

export default Post
