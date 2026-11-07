import React, { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Input, Popconfirm, Skeleton, Spin, message } from 'antd'
import {
  ArrowRightOutlined, BarChartOutlined, CheckSquareOutlined, CloudOutlined,
  DeleteOutlined, DownOutlined, ExportOutlined, FileTextOutlined, InfoCircleOutlined,
  PlusOutlined, ReloadOutlined, RightOutlined,
} from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { GlobalContext } from '@/context'
import useLocale from '@/hooks/useLocale'
import service from '@/utils/api'
import { documentRouteId } from '@/utils/documentIdentity'
import { requestNewPost } from '@/utils/newPostEvent'
import { openDesktopLink } from '@/utils/desktopUtils'
import { getWorkspaceData, loadWorkspacePosts, postTimestamp } from './workspace.mjs'
import workspaceLocale from './locale'
import styles from './style/index.module.less'

const PostTrend = lazy(() => import('./PostTrend'))

type Post = {
  title?: string
  documentId?: string
  permalink?: string
  source?: string
  cover?: string
  description?: string
  excerpt?: string
  date?: string
  updated?: string
  isDraft?: boolean
  isDiscarded?: boolean
}
type Todo = { id: string; content: string; completed: boolean; createdAt: string }
type SystemInfo = {
  hexoVersion?: string
  theme?: string
  lastDeployTime?: string
  plugins?: { name: string; version: string; enabled: boolean }[]
}
type Distribution = {
  categories: { name: string; count: number }[]
  tags: { name: string; count: number; path?: string }[]
}

function PostCover({ src, featured = false }: { src?: string; featured?: boolean }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (!src || broken) return null
  return (
    <div className={[styles.cover, featured ? styles.featuredCover : ''].join(' ')}>
      {typeof src === 'string' && src && !broken
        ? <img src={src} alt="" loading={featured ? 'eager' : 'lazy'} onError={() => setBroken(true)} />
        : <FileTextOutlined aria-hidden />}
    </div>
  )
}

function summaryText(post: Post) {
  const source = post.description || post.excerpt
  if (!source || typeof source !== 'string') return ''
  const document = new DOMParser().parseFromString(source, 'text/html')
  document.querySelectorAll('script, style').forEach(node => node.remove())
  return (document.body.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { theme, lang = 'zh-CN' } = useContext(GlobalContext)
  const t = useLocale()
  const w = useLocale(workspaceLocale)
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [contentLoading, setContentLoading] = useState(true)
  const [contentError, setContentError] = useState(false)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [systemError, setSystemError] = useState(false)
  const [todos, setTodos] = useState<Todo[]>([])
  const [todoLoading, setTodoLoading] = useState(true)
  const [todoError, setTodoError] = useState(false)
  const [addingTodo, setAddingTodo] = useState(false)
  const [todoInput, setTodoInput] = useState('')
  const [statisticsOpen, setStatisticsOpen] = useState(false)
  const [distribution, setDistribution] = useState<Distribution | null>(null)
  const [distributionError, setDistributionError] = useState(false)
  const [distributionLoading, setDistributionLoading] = useState(false)
  const [showCover] = useState(() => localStorage.getItem('hexoProShowCover') !== 'false')

  const data = useMemo(() => getWorkspaceData(posts || []), [posts])
  const featured: Post | null = data.featuredDraft
  const recent: Post[] = data.recentPosts
  const pendingTodos = todos.filter(item => !item.completed)
  const completedTodos = todos.filter(item => item.completed)
  const publishedInPeriod = data.trend.reduce((total, month) => total + month.count, 0)
  const localeForDate = ['zh-CN', 'fr-FR', 'en-US'].includes(lang) ? lang : 'en-US'
  const now = new Date()
  const greeting = now.getHours() < 12 ? w.morning : now.getHours() < 18 ? w.afternoon : w.evening

  const loadContent = useCallback(async () => {
    setContentLoading(true)
    setContentError(false)
    try {
      const collection = await loadWorkspacePosts(async (page, pageSize) => {
        const response = await service.get('/hexopro/api/posts/list', { params: { published: 'all', page, pageSize } })
        return response.data
      })
      setPosts(collection)
    } catch {
      setContentError(true)
    } finally {
      setContentLoading(false)
    }
  }, [])

  const loadSystem = useCallback(async () => {
    setSystemError(false)
    try {
      const response = await service.get('/hexopro/api/dashboard/system/info')
      setSystem(response.data)
    } catch {
      setSystemError(true)
    }
  }, [])

  const loadTodos = useCallback(async () => {
    setTodoLoading(true)
    setTodoError(false)
    try {
      const response = await service.get('/hexopro/api/dashboard/todos/list')
      setTodos(Array.isArray(response.data) ? response.data : [])
    } catch {
      setTodoError(true)
    } finally {
      setTodoLoading(false)
    }
  }, [])

  const loadDistribution = useCallback(async () => {
    setDistributionLoading(true)
    setDistributionError(false)
    try {
      const [categories, tags] = await Promise.all([
        service.get('/hexopro/api/dashboard/categories/list'),
        service.get('/hexopro/api/dashboard/tags/list'),
      ])
      setDistribution({ categories: categories.data || [], tags: tags.data || [] })
    } catch {
      setDistributionError(true)
    } finally {
      setDistributionLoading(false)
    }
  }, [])

  useEffect(() => {
    loadContent()
    loadSystem()
    loadTodos()
  }, [loadContent, loadSystem, loadTodos])

  useEffect(() => {
    if (statisticsOpen && !distribution) loadDistribution()
  }, [statisticsOpen, loadDistribution])

  const dateLabel = (value?: string) => {
    const timestamp = postTimestamp(value)
    if (!timestamp) return '—'
    const date = new Date(timestamp)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const time = date.toLocaleTimeString(localeForDate, { hour: '2-digit', minute: '2-digit', hour12: false })
    if (date.toDateString() === today.toDateString()) return w.today + ' ' + time
    if (date.toDateString() === yesterday.toDateString()) return w.yesterday + ' ' + time
    return date.toLocaleDateString(localeForDate, {
      ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
      month: 'long', day: 'numeric',
    })
  }
  const updatedLabel = (post: Post) => w.updated.replace('{date}', dateLabel(postTimestamp(post.updated) ? post.updated : post.date))
  const status = (post: Post) => (
    <span className={[styles.status, post.isDraft ? styles.draftStatus : styles.publishedStatus].join(' ')}>
      {post.isDraft ? w.drafts : w.published}
    </span>
  )

  const addTodo = async (event: React.FormEvent) => {
    event.preventDefault()
    const content = todoInput.trim()
    if (!content || todoLoading) return
    setTodoLoading(true)
    try {
      await service.post('/hexopro/api/dashboard/todos/add', { content })
      setTodoInput('')
      setAddingTodo(false)
      await loadTodos()
    } catch {
      message.error(t['dashboard.error.addTodoFailed'])
    } finally {
      setTodoLoading(false)
    }
  }
  const toggleTodo = async (item: Todo) => {
    setTodoLoading(true)
    try {
      await service.put('/hexopro/api/dashboard/todos/toggle/' + item.id)
      setTodos(current => current.map(todo => todo.id === item.id ? { ...todo, completed: !todo.completed } : todo))
    } catch {
      message.error(t['dashboard.error.toggleTodoFailed'])
    } finally {
      setTodoLoading(false)
    }
  }
  const deleteTodo = async (id: string) => {
    setTodoLoading(true)
    try {
      await service.delete('/hexopro/api/dashboard/todos/delete/' + id)
      setTodos(current => current.filter(todo => todo.id !== id))
    } catch {
      message.error(t['dashboard.error.deleteTodoFailed'])
    } finally {
      setTodoLoading(false)
    }
  }
  const todoList = (items: Todo[]) => (
    <ul className={styles.todoList}>
      {items.map(item => (
        <li key={item.id}>
          <Checkbox checked={item.completed} disabled={todoLoading} onChange={() => toggleTodo(item)}>
            <span className={item.completed ? styles.completedText : ''}>{item.content}</span>
          </Checkbox>
          <Popconfirm title={t['dashboard.todo.deleteTooltip'] + ' ' + item.content + '?'} onConfirm={() => deleteTodo(item.id)}>
            <Button type="text" icon={<DeleteOutlined />} disabled={todoLoading} aria-label={t['dashboard.todo.deleteTooltip'] + ' ' + item.content} />
          </Popconfirm>
        </li>
      ))}
    </ul>
  )

  const errorRow = (retry: () => void) => (
    <div className={styles.inlineError} role="alert">
      <span>{w.loadError}</span>
      <Button type="link" onClick={retry}>{w.retry}</Button>
    </div>
  )
  const lastDeployment = system?.lastDeployTime
  const validDeployment = !!postTimestamp(lastDeployment)

  return (
    <div className={[styles.dashboardContainer, theme === 'dark' ? styles.darkMode : ''].join(' ')}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{w.title}</h1>
          <p>{now.toLocaleDateString(localeForDate, { month: 'long', day: 'numeric', weekday: 'long' })} · {greeting}</p>
        </div>
        <Button className={styles.newPostButton} icon={<PlusOutlined />} onClick={requestNewPost}>
          {t['dashboard.welcome.new.post']}
        </Button>
      </header>

      <div className={styles.overview} aria-label={t['dashboard.stats.totalPosts']}>
        <Link to="/content/posts/blogs">{w.published}<strong>{posts ? data.published : '—'}</strong></Link>
        <Link to="/content/posts/drafts">{w.drafts}<strong>{posts ? data.drafts : '—'}</strong></Link>
        <span>{w.monthlyNew}<strong>{posts ? data.monthlyNew : '—'}</strong></span>
        <p>{posts ? w.total.replace('{count}', String(data.total)) : contentError ? w.loadError : w.loading} · {w.monthHint}</p>
      </div>

      {contentError && <Alert className={styles.loadAlert} type="error" showIcon message={w.loadError}
        action={<Button size="small" onClick={loadContent} loading={contentLoading}>{w.retry}</Button>} />}
      {contentLoading && !posts ? (
        <section className={styles.loadingContent} aria-label={w.loading}><Skeleton active paragraph={{ rows: 6 }} /></section>
      ) : !posts ? null : (
        <>
          <section className={styles.featured} aria-labelledby="featured-draft-title">
            <p className={styles.eyebrow}>{featured ? w.featured : t['dashboard.welcome.new.post']}</p>
            {featured ? (
              <div className={styles.featuredBody}>
                {showCover && <PostCover src={featured.cover} featured />}
                <div className={styles.featuredCopy}>
                  <div className={styles.featuredTitle}>
                    <h2 id="featured-draft-title" title={featured.title || w.untitled}>{featured.title || w.untitled}</h2>
                    {status(featured)}
                  </div>
                  <p className={styles.excerpt}>{summaryText(featured) || w.summaryFallback}</p>
                  <p className={styles.updated}>{updatedLabel(featured)}</p>
                </div>
                <div className={styles.featuredActions}>
                  <Button type="primary" onClick={() => navigate('/post/' + documentRouteId(featured))}>
                    {w.continue}<ArrowRightOutlined />
                  </Button>
                  <Link to="/content/posts/drafts">{w.viewDrafts.replace('{count}', String(data.drafts))}</Link>
                </div>
              </div>
            ) : (
              <div className={styles.noDraft}>
                <FileTextOutlined aria-hidden />
                <div><h2 id="featured-draft-title">{w.noDraftTitle}</h2><p>{w.noDraftDescription}</p></div>
                <Button type="primary" icon={<PlusOutlined />} onClick={requestNewPost}>{t['dashboard.welcome.new.post']}</Button>
              </div>
            )}
          </section>

          <div className={styles.workspaceGrid}>
            <section className={styles.recent} aria-labelledby="recent-articles-title">
              <div className={styles.sectionHeader}>
                <h2 id="recent-articles-title">{w.recent}</h2>
                <Link to="/content/posts/blogs">{w.viewAll}<ArrowRightOutlined /></Link>
              </div>
              {recent.length ? (
                <ul className={styles.articleList}>
                  {recent.map(post => (
                    <li key={post.documentId || post.permalink || post.source}>
                      <Link className={styles.articleLink} to={'/post/' + documentRouteId(post)}>
                        {showCover && <PostCover src={post.cover} />}
                        <div className={styles.articleCopy}>
                          <h3 title={post.title}>{post.title || w.untitled}</h3>
                          <p>{updatedLabel(post)}</p>
                        </div>
                        {status(post)}
                        <span className={styles.editAction}>{post.isDraft ? w.continue : t['dashboard.todo.editTooltip']}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className={styles.emptyArticles}>{t['dashboard.articles.empty']}</p>}
            </section>

            <aside className={styles.sidebar}>
              <section className={styles.deploySection} aria-labelledby="deploy-summary-title">
                <h2 id="deploy-summary-title"><CloudOutlined />{w.deploy}</h2>
                {systemError ? errorRow(loadSystem) : !system ? <Skeleton active paragraph={{ rows: 1 }} title={false} /> : (
                  <div className={styles.deploymentTime}>
                    <span>{w.lastDeploy}</span>
                    <strong>{validDeployment ? new Date(postTimestamp(lastDeployment)).toLocaleString(localeForDate, {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
                    }) : w.unknownDeploy}</strong>
                  </div>
                )}
                <div className={styles.deployActions}>
                  <Button onClick={() => navigate('/deploy')}>{w.goDeploy}</Button>
                  <Button type="link" onClick={() => openDesktopLink('/')}>{w.viewBlog}<ExportOutlined /></Button>
                </div>
              </section>

              <section className={styles.todoSection} aria-labelledby="dashboard-todos-title">
                <div className={styles.sectionHeader}>
                  <h2 id="dashboard-todos-title"><CheckSquareOutlined />{w.todos}</h2>
                  <Button type="link" icon={<PlusOutlined />} aria-expanded={addingTodo} onClick={() => setAddingTodo(value => !value)}>{w.add}</Button>
                </div>
                {addingTodo && (
                  <form className={styles.todoForm} onSubmit={addTodo}>
                    <Input autoFocus aria-label={t['dashboard.todo.addPlaceholder']} placeholder={t['dashboard.todo.addPlaceholder']}
                      value={todoInput} onChange={event => setTodoInput(event.target.value)} maxLength={500} />
                    <Button htmlType="submit" type="primary" disabled={!todoInput.trim()} loading={todoLoading}>{w.add}</Button>
                  </form>
                )}
                {todoError ? errorRow(loadTodos) : (
                  <Spin spinning={todoLoading}>
                    {pendingTodos.length ? <>
                      <p className={styles.todoCount}>{w.pending.replace('{count}', String(pendingTodos.length))}</p>
                      {todoList(pendingTodos)}
                    </> : <p className={styles.emptyTodos}>{todoLoading ? w.loading : w.noTodos}</p>}
                    {!!completedTodos.length && (
                      <details className={styles.completedTodos}>
                        <summary>{w.completed.replace('{count}', String(completedTodos.length))}<DownOutlined /></summary>
                        {todoList(completedTodos)}
                      </details>
                    )}
                  </Spin>
                )}
              </section>

              <details className={styles.siteInfo}>
                <summary><InfoCircleOutlined /><span>{w.site}</span><RightOutlined className={styles.disclosureIcon} /></summary>
                {systemError ? errorRow(loadSystem) : system && (
                  <div className={styles.systemDetails}>
                    <dl><div><dt>{t['dashboard.system.hexoVersion']}</dt><dd>{system.hexoVersion || '—'}</dd></div>
                      <div><dt>{t['dashboard.system.theme']}</dt><dd>{system.theme || '—'}</dd></div></dl>
                    <p>{w.installedPlugins.replace('{count}', String(system.plugins?.length || 0))}</p>
                    <ul>{(system.plugins || []).map(plugin => <li key={plugin.name}><span>{plugin.name}</span><span>{plugin.version}</span></li>)}</ul>
                  </div>
                )}
              </details>
              <p className={styles.systemCaption}>{system ? 'Hexo ' + (system.hexoVersion || '—') + ' · ' + (system.theme || '—') : systemError ? '—' : w.loading}</p>
            </aside>
          </div>

          <details className={styles.statistics} onToggle={event => setStatisticsOpen(event.currentTarget.open)}>
            <summary>
              <BarChartOutlined /><h2>{w.statistics}</h2>
              <span>{w.trendSummary.replace('{count}', String(publishedInPeriod))}</span><DownOutlined className={styles.disclosureIcon} />
            </summary>
            {statisticsOpen && (
              <div className={styles.statisticsBody}>
                <section className={styles.trend}>
                  <h3>{w.trend}</h3><p>{w.trendHint}</p>
                  <Suspense fallback={<Skeleton active />}>
                    <PostTrend data={data.trend} dark={theme === 'dark'} label={w.published} />
                  </Suspense>
                  <p className={styles.trendData}>{data.trend.map(item => item.month + ': ' + item.count).join(' · ')}</p>
                </section>
                <section className={styles.distribution}>
                  {distributionError ? errorRow(loadDistribution) : distributionLoading || !distribution ? <Skeleton active /> : <>
                    <h3>{w.categories}</h3>
                    {distribution.categories.length ? <ul>{distribution.categories.slice(0, 5).map(item => (
                      <li key={item.name}><span>{item.name}</span><span>{w.articles.replace('{count}', String(item.count))}</span></li>
                    ))}</ul> : <p>{t['dashboard.empty.noCategories']}</p>}
                    <h3>{w.tags}</h3>
                    <div className={styles.tags}>{distribution.tags.length ? distribution.tags.slice(0, 8).map(tag => (
                      <Button key={tag.name} size="small" onClick={() => tag.path && openDesktopLink(tag.path)} disabled={!tag.path}>
                        {tag.name}<span>{tag.count}</span>
                      </Button>
                    )) : <p>{t['dashboard.empty.noTags']}</p>}</div>
                  </>}
                </section>
                <Button className={styles.refreshButton} type="text" icon={<ReloadOutlined />} loading={contentLoading}
                  onClick={() => { loadContent(); loadSystem(); loadDistribution() }}>{w.refresh}</Button>
              </div>
            )}
          </details>
        </>
      )}
    </div>
  )
}
