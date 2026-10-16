import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, Button, ConfigProvider, Drawer, Dropdown, Input, Modal, Select, theme as antTheme } from 'antd'
import { MantineProvider } from '@mantine/core'
import { App as NativeApp } from '@capacitor/app'
import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { ArrowLeftOutlined, BoldOutlined, CheckOutlined, CloudSyncOutlined, CodeOutlined, DeleteOutlined,
    DownloadOutlined, EditOutlined, EllipsisOutlined, FileTextOutlined, FolderOutlined, GithubOutlined,
    ItalicOutlined, LoadingOutlined, PictureOutlined, PlusOutlined, SearchOutlined, SettingOutlined, WifiOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SuggestionMenu } from '@blocknote/core/extensions'
import { GlobalContext } from '@/context'
import BlockEditor from '@/components/BlogEditor/BlockEditor'
import SourceEditor from '@/components/BlogEditor/SourceEditor'
import DocumentTitle from '@/components/BlogEditor/DocumentTitle'
import { getMarkdownIssue } from '@/components/BlogEditor/markdownSafety.mjs'
import { createBlockSnapshot } from '@/components/BlogEditor/blockSnapshot.mjs'
import { remarkSizedImages } from '@/components/BlogEditor/imageMarkdown.mjs'
import { WorkspaceStore } from './workspaceStore.mjs'
import { isDirty, splitDocument, titleForDocument } from './documentModel.mjs'
import { storage, credentials, exportFile, native } from './nativeStorage'
import { createImageService } from './imageService'
import { recoverWorkspace } from './workspaceRecovery.mjs'
import './style.less'

const store = new WorkspaceStore(storage, credentials)
const images = createImageService(store)
const noOp = () => {}
const DocumentSourceContext = React.createContext('')

function PreviewImage({ src, alt, width }: { src?: string; alt?: string; width?: number | string }) {
    const source = React.useContext(DocumentSourceContext)
    const [url, setUrl] = useState('')
    const [failed, setFailed] = useState(false)
    useEffect(() => {
        let active = true
        images.resolve(src || '', source).then(value => { if (active) setUrl(value) }, () => { if (active) setFailed(true) })
        return () => { active = false }
    }, [src, source])
    if (failed) return <span className="image-unavailable">{alt || '图片'} · 联网后可加载</span>
    return url ? <img src={url} alt={alt || ''} width={width} loading="lazy" /> : <span className="image-unavailable">正在加载图片…</span>
}

function DocumentEditor({ doc, saveStatus, onRun, onBack, onSettings, onRaw, onExport, onTrash }: any) {
    const body = splitDocument(doc.raw).body
    const [mode, setMode] = useState('blocks')
    const [view, setView] = useState('edit')
    const [fallback, setFallback] = useState({ value: '', reason: '' })
    const [blockSnapshot] = useState(createBlockSnapshot)
    const blockRef = useRef<any>(null)
    const imageInput = useRef<HTMLInputElement>(null)
    const imageBlock = useRef<string>(null)
    const issue = blockSnapshot.matches(body) ? '' : getMarkdownIssue(body) || (fallback.value === body ? fallback.reason : '')
    const sourceMode = !!issue || mode === 'source'
    const title = titleForDocument(doc)
    const count = Array.from(body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[\s#*`>]/g, '')).length
    const upload = useCallback((file: File) => images.upload(file), [])
    const resolve = useCallback((url: string) => images.resolve(url, doc.source), [doc.source])
    const fallbackHandler = useCallback((reason: string) => { setFallback({ value: body, reason }); setMode('source') }, [body])
    const blockAction = (action: () => void) => { if (blockRef.current) { blockRef.current.focus(); action() } }
    const insertTools = <div className="insert-tools" role="group" aria-label="插入内容与图片">
        <Button type="text" icon={<PlusOutlined />} aria-label="插入内容" onPointerDown={e => e.preventDefault()}
            onClick={() => onRun(() => blockAction(() => blockRef.current.getExtension(SuggestionMenu).openSuggestionMenu('/')))} />
        <Button type="text" icon={<PictureOutlined />} aria-label="插入图片" onPointerDown={e => e.preventDefault()}
            onClick={() => {
                if (!blockRef.current) return
                imageBlock.current = blockRef.current.getTextCursorPosition().block.id
                imageInput.current?.click()
            }} />
    </div>
    const status = saveStatus === 'saved' ? '本地已保存' : saveStatus === 'error' ? '本地保存失败' : '保存中…'
    return <section className="document-screen" aria-label="文章编辑">
        <header className="document-header">
            <Button type="text" icon={<ArrowLeftOutlined />} aria-label="返回文章列表" onClick={onBack} />
            <div className="document-status" role="status"><span>{doc.source.startsWith('_drafts/') ? '草稿' : doc.kind === 'Page' ? '页面' : '文章'}</span>
                <small>{saveStatus === 'saved' ? <CheckOutlined /> : <LoadingOutlined spin />} {status}</small></div>
            <Dropdown trigger={['click']} menu={{ items: [
                { key: 'settings', label: '文章设置', icon: <SettingOutlined />, onClick: onSettings },
                { key: 'raw', label: '文件源码', icon: <CodeOutlined />, onClick: onRaw },
                { key: 'export', label: '导出 Markdown', icon: <DownloadOutlined />, onClick: onExport },
                { type: 'divider' }, { key: 'delete', label: '放入回收站', danger: true, icon: <DeleteOutlined />, onClick: onTrash },
            ] }}><Button type="text" icon={<EllipsisOutlined />} aria-label="更多文章操作" /></Dropdown>
        </header>
        <div className="editor-view-tabs" role="group" aria-label="编辑与预览">
            <button aria-pressed={view === 'edit'} onClick={() => setView('edit')}>编辑</button>
            <button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>正文预览</button>
            <span className={`sync-caption ${doc.conflict ? 'conflict-text' : ''}`}>{doc.conflict ? '存在冲突' : isDirty(doc) ? '待同步' : '已同步'}</span>
        </div>
        <div className="mobile-editor" hidden={view !== 'edit'} data-theme={document.documentElement.dataset.theme}>
            <div className="document-scroll">
                <div className="document-paper">
                    <DocumentTitle title={title} onChange={next => onRun(() => store.editTitle(doc.documentId, next))} />
                    <div className="editor-modes" role="group" aria-label="编辑模式">
                        <button disabled={!!issue} aria-pressed={!sourceMode} onClick={() => setMode('blocks')}>块编辑</button>
                        <button aria-pressed={sourceMode} onClick={() => setMode('source')}>Markdown</button>
                    </div>
                    {issue && <p className="compatibility-hint">含有{issue}，已保留源码编辑。</p>}
                    {sourceMode ? <div className="source-body"><SourceEditor value={body}
                        onChange={value => onRun(() => store.editBody(doc.documentId, value))} onReady={noOp} /></div>
                        : <BlockEditor value={body} onChange={value => onRun(() => store.editBody(doc.documentId, value))}
                            onReady={noOp} onFallback={fallbackHandler} uploadFile={upload} resolveFileUrl={resolve}
                            blockSnapshot={blockSnapshot}
                            mobileToolbarActions={insertTools}
                            onEditorReady={editor => { blockRef.current = editor }} />}
                </div>
            </div>
            <footer className="writing-tools">
                {!sourceMode && <div className="block-tools">
                    {insertTools}
                    <Button type="text" icon={<BoldOutlined />} aria-label="加粗" onPointerDown={e => e.preventDefault()}
                        onClick={() => blockAction(() => blockRef.current.toggleStyles({ bold: true }))} />
                    <Button type="text" icon={<ItalicOutlined />} aria-label="斜体" onPointerDown={e => e.preventDefault()}
                        onClick={() => blockAction(() => blockRef.current.toggleStyles({ italic: true }))} />
                </div>}
                <span>{count.toLocaleString()} 字</span>
                {saveStatus === 'error' && <Button danger onClick={() => onRun(() => store.retrySave())}>重试保存</Button>}
            </footer>
            {/* Keep the file input mounted when the keyboard toolbar closes for the photo picker. */}
            <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-label="选择插入的图片"
                onChange={event => {
                    const file = event.target.files?.[0]; event.target.value = ''
                    const targetBlock = imageBlock.current
                    if (file) onRun(async () => {
                        const url = await images.upload(file)
                        if (blockRef.current) blockAction(() => {
                            const editor = blockRef.current
                            editor.insertBlocks([{ type: 'image', props: { url } }],
                                (targetBlock && editor.getBlock(targetBlock)) || editor.getTextCursorPosition().block, 'after')
                        })
                    })
                }} />
        </div>
        {view === 'preview' && <div className="document-scroll preview-scroll">
            <article className="prose"><h1 className="preview-document-title">{title}</h1><p className="preview-caption">正文预览 · 发布样式由博客主题决定</p>
                <DocumentSourceContext.Provider value={doc.source}><ReactMarkdown remarkPlugins={[remarkGfm, remarkSizedImages]} skipHtml components={{ img: PreviewImage,
                    a: props => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{body}</ReactMarkdown></DocumentSourceContext.Provider>
            </article>
        </div>}
    </section>
}

function ConnectionSettings({ state, onRun, syncing, onNotice }: any) {
    const workspace = state.workspaces.find(item => item.key === state.activeWorkspace)
    const [form, setForm] = useState({ owner: '', repo: '', branch: 'main', sourceDir: 'source', blogDir: '', token: '' })
    const [connecting, setConnecting] = useState(false)
    const [checking, setChecking] = useState(false)
    const busy = connecting || checking || syncing
    useEffect(() => { setForm({ owner: '', repo: '', branch: 'main', sourceDir: 'source', blogDir: '', ...workspace.config, token: '' }) }, [workspace.key, workspace.config])
    const field = (key: string, label: string, hint?: string, secret = false) => <label className="connection-field">
        <span>{label}</span>{secret ? <Input.Password value={form[key]} disabled={busy} autoCapitalize="none" autoCorrect="off" autoComplete="off"
            onChange={event => setForm(old => ({ ...old, [key]: event.target.value }))} />
            : <Input value={form[key]} disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={event => setForm(old => ({ ...old, [key]: event.target.value }))} />}
        {hint && <small>{hint}</small>}
    </label>
    return <div className="settings-content">
        <div className="section-heading"><h1>设置</h1><p>文章在手机上，灵感随时保存。</p></div>
        <section className="settings-card">
            <div className="settings-card-heading"><FolderOutlined aria-hidden="true" /><h2>写作空间</h2></div>
            <label className="connection-field"><span>当前空间</span><Select value={workspace.key} disabled={busy}
                options={state.workspaces.map(item => ({ value: item.key, label: item.config ? `${item.config.owner}/${item.config.repo} · ${item.config.branch}` : '仅本机' }))}
                onChange={key => onRun(() => store.switchWorkspace(key))} /></label>
            <p className="field-note">切换空间会保留各自的文章。仅本机的草稿可以从文章列表导入到仓库空间。</p>
        </section>
        <section className="settings-card">
            <div className="settings-card-heading"><GithubOutlined aria-hidden="true" /><h2>连接 GitHub</h2></div>
            <p className="field-note">连接博客源文件仓库，手机和电脑通过同一个仓库同步。</p>
            <form onSubmit={event => {
                event.preventDefault(); if (busy) return; setConnecting(true); onNotice(null)
                onRun(async () => { try { await store.connect(form, form.token); setForm(old => ({ ...old, token: '' })) } finally { setConnecting(false) } })
            }}>
                {field('owner', 'GitHub 用户名或组织')}
                {field('repo', '仓库名称', '请选择包含 Markdown 源文件的仓库。')}
                {field('branch', '同步分支')}
                {field('token', '访问凭据', '使用仅授权这个仓库、具有 Contents 读写权限的细粒度令牌。已有凭据时可以留空。', true)}
                <p className="field-note"><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">在 GitHub 创建访问凭据</a></p>
                <details className="advanced-settings"><summary>目录设置</summary>
                    {field('blogDir', '博客在仓库中的目录', '通常留空；博客位于子目录时填写。')}
                    {field('sourceDir', '文章目录', '默认为 source，对应 Hexo 的 source_dir。')}
                </details>
                <p className="field-note">同步会提交到所选分支。仓库已有的发布流程可能随提交自动运行。</p>
                <div className="connection-actions">
                    <Button type="primary" htmlType="submit" block loading={connecting} disabled={checking || syncing}>保存连接</Button>
                    <Button block loading={checking} disabled={connecting || syncing} onClick={() => {
                        setChecking(true); onNotice(null)
                        onRun(async () => {
                            try {
                                const connection = await store.checkConnection(form, form.token)
                                onNotice({ text: `连接正常，已读取 ${connection.owner}/${connection.repo} 的 ${connection.branch} 分支。` })
                            } finally { setChecking(false) }
                        })
                    }}>测试连接</Button>
                </div>
                <p className="field-note">测试连接只读取仓库和分支，不会提交文章。</p>
            </form>
            {workspace.config && <Button className="forget-token" block disabled={busy} onClick={() => onRun(() => store.disconnect())}>移除本机访问凭据</Button>}
            <p className="field-note">{native ? '凭据保存在系统安全存储中，不会写入文章、备份或仓库。' : '此页面是开发预览，凭据仅保留在当前页面内存中，刷新后需要重新填写。'}</p>
        </section>
        <section className="settings-card">
            <div className="settings-card-heading"><SettingOutlined aria-hidden="true" /><h2>外观与备份</h2></div>
            <label className="connection-field"><span>外观</span><Select value={state.theme}
                options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]}
                onChange={value => onRun(() => store.setTheme(value))} /></label>
            <Button block icon={<DownloadOutlined />} onClick={() => onRun(async () => {
                await store.flush()
                const assets = {}
                for (const workspace of store.state.workspaces) for (const asset of workspace.assets) assets[asset.key] = await storage.readAsset(asset.key)
                await exportFile(`hexopro-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, state: store.state, assets }))
            })}>导出全部文章与图片备份</Button>
            <label className="backup-picker"><DownloadOutlined aria-hidden="true" /><span>导入备份</span>
                <input type="file" accept="application/json,.json" aria-label="导入 Hexo Pro 备份" onChange={event => {
                    const file = event.target.files?.[0]; event.target.value = ''
                    if (file) onRun(async () => {
                        if (file.size > 100 * 1024 * 1024) throw new Error('备份文件超过 100 MB，请拆分后导入')
                        await store.importBackup(JSON.parse(await file.text()))
                    })
                }} />
            </label>
            <p className="field-note">导入会合并文章；同一篇有不同内容时保留副本，不覆盖本机原稿。</p>
            <p className="field-note">本地存储属于这个 App。卸载前请同步或导出备份。</p>
        </section>
        <p className="app-version">Hexo Pro Mobile · 1.0</p>
    </div>
}

export default function MobileApp() {
    const [snapshot, setSnapshot] = useState<any>({ state: null, saveStatus: 'saved', syncing: false })
    const [loadError, setLoadError] = useState('')
    const [recovering, setRecovering] = useState(false)
    const [notice, setNotice] = useState<{ text: string; error?: boolean }>(null)
    const [tab, setTab] = useState('posts')
    const [selected, setSelected] = useState<string>(null)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('all')
    const [postStatus, setPostStatus] = useState('all')
    const [rawOpen, setRawOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [path, setPath] = useState('')
    const [trashOpen, setTrashOpen] = useState(false)
    const [importOpen, setImportOpen] = useState(false)
    const [indexSetup, setIndexSetup] = useState(false)
    const [online, setOnline] = useState(navigator.onLine)
    const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches)
    const backRef = useRef<() => void>(noOp)
    const state = snapshot.state
    const workspace = state?.workspaces.find(item => item.key === state.activeWorkspace)
    const doc = workspace?.documents.find(item => item.documentId === selected)
    const dark = state?.theme === 'dark' || (state?.theme !== 'light' && systemDark)
    const onRun = useCallback((action: () => any) => {
        try { Promise.resolve(action()).catch(error => setNotice({ text: error.message || '操作失败，请重试', error: true })) }
        catch (error) { setNotice({ text: error.message || '操作失败，请重试', error: true }) }
    }, [])
    useEffect(() => {
        const stop = store.subscribe(setSnapshot)
        store.load().catch(error => setLoadError(error.message))
        const changed = () => setOnline(navigator.onLine)
        window.addEventListener('online', changed); window.addEventListener('offline', changed)
        const media = matchMedia('(prefers-color-scheme: dark)')
        const scheme = () => setSystemDark(media.matches)
        media.addEventListener('change', scheme)
        const unload = (event: BeforeUnloadEvent) => {
            if (store.saveStatus !== 'saved') { event.preventDefault(); event.returnValue = '' }
        }
        window.addEventListener('beforeunload', unload)
        const background = () => { if (document.hidden) store.flush().catch(noOp) }
        document.addEventListener('visibilitychange', background)
        let backListener, lifecycle
        if (native) {
            NativeApp.addListener('backButton', () => backRef.current()).then(handle => { backListener = handle })
            NativeApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) store.flush().catch(noOp) }).then(handle => { lifecycle = handle })
        }
        return () => { stop(); backListener?.remove(); lifecycle?.remove(); media.removeEventListener('change', scheme)
            window.removeEventListener('online', changed); window.removeEventListener('offline', changed)
            window.removeEventListener('beforeunload', unload); document.removeEventListener('visibilitychange', background) }
    }, [])
    useEffect(() => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light'
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1d21' : '#faf9f6')
        if (native) SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(noOp)
    }, [dark])
    useEffect(() => { setPostStatus('all'); setFilter('all'); setSearch('') }, [workspace?.key])
    const closeDocument = () => onRun(async () => { await store.flush(); setSelected(null) })
    backRef.current = () => {
        if (rawOpen) setRawOpen(false)
        else if (settingsOpen) setSettingsOpen(false)
        else if (trashOpen) setTrashOpen(false)
        else if (importOpen) setImportOpen(false)
        else if (selected) closeDocument()
        else if (tab !== 'posts') setTab('posts')
        else if (native) onRun(async () => { await store.flush(); await NativeApp.minimizeApp() })
    }
    const postCounts = useMemo(() => {
        const posts = (workspace?.documents || []).filter(doc => !doc.deleted && doc.kind === 'Post')
        return { all: posts.length, published: posts.filter(doc => doc.source.startsWith('_posts/')).length,
            drafts: posts.filter(doc => doc.source.startsWith('_drafts/')).length }
    }, [workspace])
    const documents = useMemo(() => (workspace?.documents || []).filter(doc => !doc.deleted && (tab === 'pages' ? doc.kind === 'Page' : doc.kind === 'Post'))
        .filter(doc => tab === 'pages' || postStatus === 'all' || doc.source.startsWith(postStatus === 'drafts' ? '_drafts/' : '_posts/'))
        .filter(doc => filter !== 'pending' || isDirty(doc) || doc.conflict)
        .filter(doc => `${titleForDocument(doc)} ${doc.raw} ${doc.source}`.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [workspace, tab, postStatus, filter, search])
    const listName = tab === 'pages' ? '页面' : postStatus === 'drafts' ? '草稿' : postStatus === 'published' ? '已发布文章' : '文章'
    const emptyTitle = search ? `没有找到匹配的${listName}` : filter === 'pending' ? `没有待同步的${listName}` : `还没有${listName}`
    const emptyHint = search ? '试试其他关键词，或清空搜索。' : filter === 'pending' ? '关闭待同步筛选，即可查看这个分类的全部内容。'
        : tab === 'posts' && postStatus === 'published' ? '新建文章会先保存为草稿，写好后再发布。' : '写下一句话，也是一篇文章的开始。'
    const pending = workspace?.documents.filter(doc => isDirty(doc)).length || 0
    const conflicts = workspace?.documents.filter(doc => doc.conflict) || []
    const sync = (initializeIndex = false) => onRun(async () => {
        setNotice(null)
        let result
        try { result = await store.sync({ initializeIndex }) }
        catch (error) { if (error.code === 'INDEX_INITIALIZATION_REQUIRED') { setIndexSetup(true); return } throw error }
        if (result) setNotice({ text: result.conflicts ? `${result.conflicts} 篇文章需要处理冲突，本地版本已保留。` : '文章已同步到仓库', error: !!result.conflicts })
    })
    const newDocument = () => onRun(async () => {
        const id = await store.create(tab === 'pages' ? 'Page' : 'Post')
        if (tab === 'posts') setPostStatus('drafts')
        setFilter('all'); setSearch(''); setSelected(id)
    })
    const local = state?.workspaces.find(item => item.key === 'local')
    const recover = async (file?: File) => {
        setRecovering(true)
        try {
            if (file && file.size > 100 * 1024 * 1024) throw new Error('备份文件超过 100 MB')
            const raw = file ? await file.text() : (await storage.readRecoveryFiles()).backup
            await recoverWorkspace(storage, raw, !!file)
            await store.load()
            setLoadError('')
        } catch (error) { setLoadError(error.message || '恢复失败，原文件已保留') }
        finally { setRecovering(false) }
    }
    return <GlobalContext.Provider value={{ theme: dark ? 'dark' : 'light', lang: 'zh-CN' }}>
        <ConfigProvider theme={{ algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
            components: { Button: { primaryColor: dark ? '#171a20' : '#ffffff' } },
            token: { colorPrimary: dark ? '#8daaff' : '#3763cc', borderRadius: 8, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', controlHeight: 48 } }}>
            <MantineProvider forceColorScheme={dark ? 'dark' : 'light'}><AntApp>
                <main className="mobile-app" data-theme={dark ? 'dark' : 'light'}>
                    {!state ? <div className="loading-screen"><FileTextOutlined /><h1>Hexo Pro</h1>
                        <p role="status">{loadError || '正在打开你的写作空间…'}</p>
                        {loadError && <>
                            <Button type="primary" loading={recovering} onClick={() => Modal.confirm({ title: '恢复上一份本地备份？',
                                content: '会先保留当前原文件，再恢复备份中的文章。恢复后请检查最近的修改。', okText: '恢复备份', cancelText: '取消', onOk: () => recover() })}>恢复本地备份</Button>
                            <label className="backup-picker"><span>导入备份文件</span><input type="file" accept="application/json,.json"
                                disabled={recovering} aria-label="从启动错误中导入备份" onChange={event => {
                                    const file = event.target.files?.[0]; event.target.value = ''
                                    if (file) Modal.confirm({ title: '从文件恢复写作空间？', content: '当前原文件将另存保留，再恢复所选备份的文章和图片。',
                                        okText: '恢复', cancelText: '取消', onOk: () => recover(file) })
                                }} /></label>
                            <Button disabled={recovering} onClick={async () => {
                                try { await exportFile('hexopro-recovery-originals.json', JSON.stringify(await storage.readRecoveryFiles())) }
                                catch (error) { setLoadError(error.message) }
                            }}>导出原文件与备份</Button>
                            <Button disabled={recovering} onClick={() => location.reload()}>重新打开</Button>
                        </>}</div> : <>
                        {(notice || snapshot.saveError) && <div className={`notice ${notice?.error || snapshot.saveError ? 'notice-error' : ''}`} role="status">
                            <span>{snapshot.saveError || notice?.text}</span><Button type="text" aria-label="关闭提示" onClick={() => setNotice(null)}>关闭</Button>
                            {snapshot.saveError && <Button onClick={() => onRun(() => store.retrySave())}>重试保存</Button>}</div>}
                        {doc ? <>
                            {doc.conflict && <div className="conflict-banner"><strong>{doc.conflict.reason}</strong>
                                <p>本地修改已保留。查看两个版本后，选择要继续使用的内容。</p>
                                {!doc.conflict.pathCollision ? <div><Button onClick={() => onRun(() => store.resolve(doc.documentId, 'local'))}>保留我的版本</Button>
                                    <Button onClick={() => Modal.confirm({ title: '使用仓库版本？', content: '当前本地修改将被仓库版本替换。', okText: '使用仓库版本', cancelText: '取消',
                                        onOk: async () => { await store.resolve(doc.documentId, 'remote'); if (doc.conflict.raw === null) setSelected(null) } })}>使用仓库版本</Button>
                                    {doc.conflict.raw !== null && <Button onClick={() => Modal.info({ title: '仓库中的版本', width: 680,
                                        content: <pre className="conflict-source">{doc.conflict.raw}</pre>, okText: '返回编辑' })}>查看仓库版本</Button>}</div>
                                    : <Button onClick={() => { setPath(doc.source); setSettingsOpen(true) }}>修改文件路径</Button>}
                            </div>}
                            <DocumentEditor key={doc.documentId} doc={doc} saveStatus={snapshot.saveStatus} onRun={onRun} onBack={closeDocument}
                                onSettings={() => { setPath(doc.source); setSettingsOpen(true) }} onRaw={() => setRawOpen(true)}
                                onExport={() => onRun(() => exportFile(doc.source.split('/').pop(), doc.raw))}
                                onTrash={() => Modal.confirm({ title: '放入回收站？', content: '同步时会删除仓库中的对应文件；同步前可以从回收站恢复。', okText: '放入回收站', cancelText: '取消',
                                    onOk: async () => { await store.trash(doc.documentId); setSelected(null) } })} />
                        </> : <>
                            <header className="app-header"><span className="wordmark">Hexo<span> Pro</span></span>
                                <span className="network-caption">{online ? <><WifiOutlined /> 网络已连接</> : '离线 · 可继续写作'}</span>
                                <Button type="text" aria-label="同步仓库" icon={<CloudSyncOutlined spin={snapshot.syncing} />} disabled={snapshot.syncing || !online}
                                    onClick={workspace.config ? () => sync() : () => setTab('settings')} /></header>
                            <div className="screen-content">
                                {tab === 'settings' ? <ConnectionSettings state={state} syncing={snapshot.syncing} onRun={onRun} onNotice={setNotice} /> : <>
                                    <div className="section-heading"><div className="workspace-label">{workspace.config ? `${workspace.config.owner} / ${workspace.config.repo}` : '仅本机'}</div>
                                        <div className="list-heading-row"><h1>{tab === 'pages' ? '页面' : '你的写作空间'}</h1>
                                            <Button type="primary" icon={<EditOutlined aria-hidden="true" />} aria-label={tab === 'pages' ? '新建页面' : '新建文章'}
                                                onClick={newDocument}>{tab === 'pages' ? '新建页面' : '新建文章'}</Button></div>
                                        <p>{workspace.config ? `${pending} 篇待同步 · ${workspace.config.branch}` : '灵感先留下，联网再同步。'}</p></div>
                                    {!workspace.config && <button className="connect-card" onClick={() => setTab('settings')}><GithubOutlined aria-hidden="true" /><span><strong>让手机和电脑接着写</strong><small>连接 GitHub，随时同步你的文章</small></span><span aria-hidden="true">→</span></button>}
                                    <div className="list-search" role="search"><Input prefix={<SearchOutlined aria-hidden="true" />}
                                        placeholder={tab === 'pages' ? '搜索页面' : '搜索文章'} aria-label={tab === 'pages' ? '搜索页面' : '搜索文章'}
                                        enterKeyHint="search" allowClear value={search} onChange={event => setSearch(event.target.value)} /></div>
                                    {tab === 'posts' && <div className="post-status-filter" role="group" aria-label="文章状态">{[
                                            { value: 'all', label: '全部' }, { value: 'published', label: '已发布' }, { value: 'drafts', label: '草稿' },
                                        ].map(option => <button type="button" key={option.value} className="post-status-option"
                                            aria-pressed={postStatus === option.value} aria-label={`${option.label}，${postCounts[option.value]} 篇文章`}
                                            onClick={() => setPostStatus(option.value)}><span>{option.label}</span>
                                            <span className="post-status-count">{postCounts[option.value]}</span></button>)}</div>}
                                    <div className="list-filter"><button type="button" className="pending-filter" aria-pressed={filter === 'pending'}
                                        onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}>
                                        {filter === 'pending' ? <CheckOutlined aria-hidden="true" /> : <CloudSyncOutlined aria-hidden="true" />}只看待同步</button>
                                        <Dropdown trigger={['click']} menu={{ items: [
                                            { key: 'trash', label: '回收站', icon: <DeleteOutlined />, onClick: () => setTrashOpen(true) },
                                            ...(workspace.config ? [{ key: 'local', label: '导入本机草稿', icon: <FolderOutlined />, onClick: () => setImportOpen(true) }] : []),
                                        ] }}><Button type="text" icon={<EllipsisOutlined />} aria-label="文章列表操作" /></Dropdown></div>
                                    {conflicts.length > 0 && <button className="conflict-summary" onClick={() => setSelected(conflicts[0].documentId)}>{conflicts.length} 篇文章有冲突 · 点击处理</button>}
                                    <div className="document-list">{documents.map(doc => <button className="document-card" key={doc.documentId} onClick={() => setSelected(doc.documentId)}>
                                        <div className="document-card-top"><span className="document-kind">{doc.source.startsWith('_drafts/') ? '草稿' : doc.kind === 'Page' ? '页面' : '已发布'}</span>
                                            {(isDirty(doc) || doc.conflict) && <span className={doc.conflict ? 'conflict-text' : 'pending-label'}>{doc.conflict ? '冲突待处理' : '待同步'}</span>}</div>
                                        <h2>{titleForDocument(doc)}</h2><p>{splitDocument(doc.raw).body.replace(/!\[[^\]]*\]\([^)]*\)/g, '［图片］').replace(/[#*`>\[\]]/g, '').trim().slice(0, 90) || '还没有正文，写下第一句话吧。'}</p>
                                        <div className="document-card-footer"><span>{new Date(doc.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span><span>{doc.source}</span></div>
                                    </button>)}</div>
                                    {!documents.length && <div className="empty-state"><EditOutlined aria-hidden="true" /><h2>{emptyTitle}</h2><p>{emptyHint}</p>
                                        {search ? <Button onClick={() => setSearch('')}>清空搜索</Button> : filter === 'pending' ? <Button onClick={() => setFilter('all')}>关闭待同步筛选</Button>
                                            : <Button type="primary" onClick={newDocument}>{tab === 'pages' ? '新建页面' : '写一篇草稿'}</Button>}</div>}
                                </>}
                            </div>
                            <nav className="bottom-nav" aria-label="主要导航">{[
                                { key: 'posts', label: '文章', icon: <FileTextOutlined /> }, { key: 'pages', label: '页面', icon: <FolderOutlined /> }, { key: 'settings', label: '设置', icon: <SettingOutlined /> },
                            ].map(item => <button key={item.key} aria-current={tab === item.key ? 'page' : undefined}
                                onClick={() => { setTab(item.key); setSearch(''); setFilter('all') }}>{item.icon}<span>{item.label}</span></button>)}</nav>
                        </>}
                        <Drawer title="文件源码" open={rawOpen && !!doc} onClose={() => setRawOpen(false)} placement="bottom" height="90dvh" className="source-drawer">
                            {doc && <><p className="field-note">包含文章元信息和正文。你的改动会自动保存，并随文章同步。</p><SourceEditor value={doc.raw}
                                onChange={value => onRun(() => store.editRaw(doc.documentId, value))} onReady={noOp} /></>}
                        </Drawer>
                        <Drawer title="文章设置" open={settingsOpen && !!doc} onClose={() => setSettingsOpen(false)} placement="bottom" height="auto">
                            {doc && <form onSubmit={event => { event.preventDefault(); onRun(async () => { await store.rename(doc.documentId, path); setSettingsOpen(false) }) }}>
                                <label className="connection-field"><span>文件路径</span><Input value={path} onChange={event => setPath(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                                <p className="field-note">文章放在 _drafts/ 为草稿，放在 _posts/ 为已发布文章。改名会保留永久 ID。</p>
                                <Button type="primary" htmlType="submit" block>保存设置</Button>
                            </form>}
                        </Drawer>
                        <Drawer title="回收站" open={trashOpen} onClose={() => setTrashOpen(false)} placement="bottom" height="70dvh">
                            <p className="field-note">同步会删除仓库文件。本机原稿仍保留在这里，恢复后可再次同步。</p>
                            {workspace.documents.filter(doc => doc.deleted).map(doc => <div className="import-row" key={doc.documentId}><span>{titleForDocument(doc)}</span><Button onClick={() => onRun(() => store.restore(doc.documentId))}>恢复</Button></div>)}
                        </Drawer>
                        <Drawer title="导入本机草稿" open={importOpen} onClose={() => setImportOpen(false)} placement="bottom" height="70dvh">
                            <p className="field-note">复制到当前仓库空间，本机原稿会保留。</p>
                            {local?.documents.filter(doc => !doc.deleted).map(doc => <div className="import-row" key={doc.documentId}><span>{titleForDocument(doc)}</span><Button onClick={() => onRun(async () => {
                                const id = await store.copyToActive('local', doc.documentId); setImportOpen(false); setSelected(id)
                            })}>导入</Button></div>)}
                            {!local?.documents.filter(doc => !doc.deleted).length && <p>还没有本机草稿。</p>}
                        </Drawer>
                        <Modal title="先统一手机和电脑的文章 ID" open={indexSetup} onCancel={() => setIndexSetup(false)}
                            footer={<><Button onClick={() => setIndexSetup(false)}>先从电脑同步</Button><Button type="primary" onClick={() => { setIndexSetup(false); sync(true) }}>在手机端初始化</Button></>}>
                            <p>仓库中还没有文章 ID 索引。如果电脑端已经使用过 Hexo Pro，请先将电脑的 .hexo-pro/document-identities.json 同步到仓库。</p>
                            <p>如果此前没有使用过电脑端，可以在手机初始化。初始化只创建独立索引，不会向 Front Matter 添加 ID。</p>
                        </Modal>
                    </>}
                </main>
            </AntApp></MantineProvider>
        </ConfigProvider>
    </GlobalContext.Provider>
}
