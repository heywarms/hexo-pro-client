import React, { useCallback, useEffect, useState } from 'react'
import { Card, Col, Empty, List, Pagination, Row, Spin, Tag, Typography, message, theme as antdTheme } from 'antd'
import service from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import { useNavigate } from 'react-router-dom'
import { documentRouteId } from '@/utils/documentIdentity'
import styles from './style/index.module.less'
import ArticleRow from '../components/ArticleRow/ArticleRow'

const { Text } = Typography

type CategoryItem = {
  name: string
  count: number
  path: string
}

type CategoryPostItem = {
  _id: string
  title: string
  permalink: string
  documentId?: string
  date: string
  updated: string
  isDraft: boolean
  cover?: string
}

export default function CategoriesPage() {
  const t = useLocale()
  const { token } = antdTheme.useToken()
  const navigate = useNavigate()

  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [posts, setPosts] = useState<CategoryPostItem[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [loadingPosts, setLoadingPosts] = useState(false)

  const pageSize = 10

  const fetchCategories = useCallback(async () => {
    try {
      setLoadingCategories(true)
      const res = await service.get('/hexopro/api/categories/list')
      const list = (res.data || []) as CategoryItem[]
      setCategories(list)
      if (!selectedCategory && list.length) {
        setSelectedCategory(list[0].name)
      }
    } catch (err: any) {
      message.error(err?.message || (t['content.categories.fetchFailed'] || '获取分类列表失败'))
    } finally {
      setLoadingCategories(false)
    }
  }, [selectedCategory, t])

  const fetchCategoryPosts = useCallback(async (categoryName: string, page: number) => {
    if (!categoryName) {
      setPosts([])
      setTotal(0)
      return
    }
    try {
      setLoadingPosts(true)
      const res = await service.get('/hexopro/api/categories/posts', {
        params: {
          name: categoryName,
          page,
          pageSize,
          includeDraft: 'true',
        },
      })
      setPosts((res.data?.data || []) as CategoryPostItem[])
      setTotal(res.data?.total || 0)
    } catch (err: any) {
      message.error(err?.message || (t['content.categories.postsFetchFailed'] || '获取分类文章失败'))
    } finally {
      setLoadingPosts(false)
    }
  }, [pageSize, t])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    fetchCategoryPosts(selectedCategory, currentPage)
  }, [currentPage, fetchCategoryPosts, selectedCategory])

  const shortTime = (value?: string) => {
    if (!value) return '-'
    const m = String(value).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/)
    return m ? `${m[1]} ${m[2]}` : String(value)
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8} lg={7}>
        <Card
          loading={loadingCategories}
          title={t['content.categories.listTitle'] || '分类列表'}
          bodyStyle={{ padding: 0 }}
        >
          {categories.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t['content.categories.empty'] || '暂无分类'} />
          ) : (
            <List
              dataSource={categories}
              renderItem={(item: CategoryItem) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    padding: '12px 16px',
                    backgroundColor: item.name === selectedCategory ? token.controlItemBgActive : 'transparent',
                    borderInlineStart: `3px solid ${item.name === selectedCategory ? token.colorPrimary : 'transparent'}`,
                  }}
                  onClick={() => {
                    setSelectedCategory(item.name)
                    setCurrentPage(1)
                  }}
                >
                  <Text strong={item.name === selectedCategory} style={item.name === selectedCategory ? { color: token.colorPrimary } : undefined}>{item.name}</Text>
                  <Tag>{item.count}</Tag>
                </List.Item>
              )}
            />
          )}
        </Card>
      </Col>
      <Col xs={24} md={16} lg={17}>
        <Card
          title={
            selectedCategory
              ? `${t['content.categories.postListTitle'] || '分类文章'}: ${selectedCategory}`
              : (t['content.categories.postListTitle'] || '分类文章')
          }
        >
          {!selectedCategory ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t['content.categories.selectHint'] || '请选择一个分类'} />
          ) : (
            <>
            <Spin spinning={loadingPosts}>
              {posts.length === 0 && !loadingPosts ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t['content.articleList.empty'] || '暂无文章'} />
              ) : (
                <div className={styles.rowList}>
                  {posts.map((record) => (
                    <ArticleRow
                      key={record.documentId || record.permalink}
                      title={record.title}
                      cover={record.cover}
                      onClick={() => navigate(`/post/${documentRouteId(record)}`)}
                      titleExtra={
                        <Tag color={record.isDraft ? 'default' : 'processing'} bordered={false}>
                          {record.isDraft ? (t['content.categories.status.draft'] || '草稿') : (t['content.categories.status.published'] || '已发布')}
                        </Tag>
                      }
                      meta={`${t['content.articleList.row.updatedAt'] || '更新于'} ${shortTime(record.updated || record.date)}`}
                      actions={
                        <Typography.Link onClick={() => navigate(`/post/${documentRouteId(record)}`)}>
                          {t['content.articleList.btn.edit'] || '编辑'}
                        </Typography.Link>
                      }
                    />
                  ))}
                </div>
              )}
            </Spin>
            {total > 0 && (
              <div className={styles.footer}>
                <Text type="secondary">
                  {(t['content.articleList.footer.total'] || '共 {count} 篇文章').replace('{count}', String(total))}
                </Text>
                <Pagination
                  current={currentPage}
                  pageSize={pageSize}
                  total={total}
                  showSizeChanger={false}
                  onChange={(page) => setCurrentPage(page)}
                />
              </div>
            )}
          </>
          )}
        </Card>
      </Col>
    </Row>
  )
}
