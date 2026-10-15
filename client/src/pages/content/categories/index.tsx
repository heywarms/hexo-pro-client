import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Input, Pagination, Spin, Tag } from 'antd'
import { ArrowRightOutlined, FolderOutlined, FolderOpenOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import service from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import { useNavigate } from 'react-router-dom'
import { documentRouteId } from '@/utils/documentIdentity'
import ArticleRow from '../components/ArticleRow/ArticleRow'
import ManagementPage from '../components/ManagementPage'
import managementLocale from '../components/ManagementPage/locale'
import shared from '../components/ManagementPage/style.module.less'
import styles from './style/index.module.less'

type CategoryItem = { name: string; count: number; path: string }
type CategoryPostItem = { _id: string; title: string; permalink: string; documentId?: string; date: string; updated: string; isDraft: boolean; cover?: string }

export default function CategoriesPage() {
  const t = useLocale()
  const ui = useLocale(managementLocale)
  const navigate = useNavigate()
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<CategoryPostItem[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [error, setError] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const request = useRef(0)
  const pageSize = 10

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true)
    setCategoryError('')
    try {
      const res = await service.get('/hexopro/api/categories/list')
      const list = (res.data || []) as CategoryItem[]
      setCategories(list)
      setSelectedCategory(current => list.some(item => item.name === current) ? current : list[0]?.name || '')
    } catch (err: any) {
      setCategoryError(err?.message || ui.loadFailed)
    } finally { setLoadingCategories(false) }
  }, [ui.loadFailed])

  const fetchPosts = useCallback(async () => {
    const revision = ++request.current
    setError('')
    if (!selectedCategory) { setPosts([]); setTotal(0); setLoadingPosts(false); return }
    setLoadingPosts(true)
    try {
      const res = await service.get('/hexopro/api/categories/posts', { params: { name: selectedCategory, page: currentPage, pageSize, includeDraft: 'true' } })
      if (revision !== request.current) return
      setPosts(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (err: any) {
      if (revision === request.current) setError(err?.message || ui.loadFailed)
    } finally { if (revision === request.current) setLoadingPosts(false) }
  }, [selectedCategory, currentPage, ui.loadFailed])

  useEffect(() => { fetchCategories() }, [fetchCategories])
  useEffect(() => { fetchPosts(); return () => { request.current++ } }, [fetchPosts])
  const filtered = categories.filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const shortTime = (value?: string) => value ? String(value).replace('T', ' ').slice(0, 16) : '—'

  return <ManagementPage title={t['menu.categories'] || t['menu.content.categories'] || '分类管理'} description={ui.categoriesDescription}
    count={ui.categoryCount.replace('{count}', String(categories.length))}
    actions={<Button icon={<ReloadOutlined />} loading={loadingCategories || loadingPosts} onClick={() => { fetchCategories(); fetchPosts() }}>{ui.refresh}</Button>}>
    <div className={styles.workspace}>
      <aside className={styles.directory} aria-label={ui.categoryDirectory}>
        <div className={styles.directoryHeading}><span>{ui.categoryDirectory}</span><span>{categories.length}</span></div>
        <Input className={styles.search} prefix={<SearchOutlined />} placeholder={ui.categorySearch} aria-label={ui.categorySearch} allowClear value={query} onChange={e => setQuery(e.target.value)} />
        {categoryError && <Alert type="error" showIcon message={categoryError} action={<Button size="small" onClick={fetchCategories}>{ui.retry}</Button>} />}
        <Spin spinning={loadingCategories}>
          <nav className={styles.categoryList}>
            {filtered.map(item => <button key={item.name} className={styles.category} aria-pressed={selectedCategory === item.name} onClick={() => { setSelectedCategory(item.name); setCurrentPage(1) }}>
              {selectedCategory === item.name ? <FolderOpenOutlined /> : <FolderOutlined />}<span className={styles.name}>{item.name}</span><span className={styles.number}>{item.count}</span>
            </button>)}
            {!loadingCategories && !categoryError && filtered.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? ui.noResults : ui.noCategories} />}
          </nav>
        </Spin>
        <p className={styles.hint}>{ui.categoryHint}</p>
      </aside>
      <div className={styles.content}>
        <div className={styles.contentHeader}><div><FolderOpenOutlined /><h2>{selectedCategory || ui.categoryArticles}</h2></div><span>{ui.categoryPosts.replace('{count}', String(total))}</span></div>
        {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={fetchPosts}>{ui.retry}</Button>} /> : <Spin spinning={loadingPosts}>
          <div className={styles.posts}>
            {posts.map(record => <ArticleRow key={record.documentId || record.permalink} title={record.title} cover={record.cover}
              onClick={() => navigate(`/post/${documentRouteId(record)}`)}
              titleExtra={<Tag bordered={false} color={record.isDraft ? 'default' : 'blue'}>{record.isDraft ? ui.draft : ui.published}</Tag>}
              meta={`${t['content.articleList.row.updatedAt']} ${shortTime(record.updated || record.date)}`}
              actions={<Button type="text" aria-label={`${t['content.articleList.btn.edit']} ${record.title}`} icon={<ArrowRightOutlined />} onClick={() => navigate(`/post/${documentRouteId(record)}`)} />} />)}
            {!loadingPosts && !posts.length && <div className={shared.empty}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedCategory ? t['content.articleList.empty'] : ui.selectCategory} /></div>}
          </div>
        </Spin>}
        {total > 0 && <div className={shared.footer}><span>{ui.categoryPosts.replace('{count}', String(total))}</span><Pagination current={currentPage} pageSize={pageSize} total={total} showSizeChanger={false} onChange={setCurrentPage} responsive /></div>}
      </div>
    </div>
  </ManagementPage>
}
