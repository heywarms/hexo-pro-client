import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Empty, List, Row, Table, Tag, Typography, message } from 'antd'
import service from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import { useNavigate } from 'react-router-dom'
import { documentRouteId } from '@/utils/documentIdentity'
import styles from './style/index.module.less'

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
}

export default function CategoriesPage() {
  const t = useLocale()
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

  const columns = useMemo(() => {
    return [
      {
        title: t['content.categories.column.title'] || '标题',
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
        render: (_: string, record: CategoryPostItem) => (
          <Button
            type="link"
            className={styles.titleLink}
            onClick={() => navigate(`/post/${documentRouteId(record)}`)}
          >
            {record.title}
          </Button>
        ),
      },
      {
        title: t['content.categories.column.status'] || '状态',
        dataIndex: 'isDraft',
        key: 'isDraft',
        width: 110,
        render: (isDraft: boolean) => (
          <Tag color={isDraft ? 'default' : 'blue'}>
            {isDraft ? (t['content.categories.status.draft'] || '草稿') : (t['content.categories.status.published'] || '已发布')}
          </Tag>
        ),
      },
      {
        title: t['content.categories.column.date'] || '日期',
        dataIndex: 'date',
        key: 'date',
        width: 188,
        render: (date: string) => <Text className={styles.dateText}>{date || '-'}</Text>,
      },
      {
        title: t['content.categories.column.updated'] || '更新',
        dataIndex: 'updated',
        key: 'updated',
        width: 188,
        render: (updated: string) => <Text className={styles.dateText}>{updated || '-'}</Text>,
      },
    ]
  }, [navigate, t])

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
                    backgroundColor: item.name === selectedCategory ? 'rgba(24, 144, 255, 0.08)' : 'transparent',
                  }}
                  onClick={() => {
                    setSelectedCategory(item.name)
                    setCurrentPage(1)
                  }}
                >
                  <Text strong={item.name === selectedCategory}>{item.name}</Text>
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
            <Table
              className={styles.categoryPostsTable}
              rowKey={record => record.documentId || record.permalink}
              loading={loadingPosts}
              columns={columns}
              dataSource={posts}
              tableLayout="fixed"
              scroll={{ x: 860 }}
              pagination={{
                current: currentPage,
                pageSize,
                total,
                onChange: (page) => setCurrentPage(page),
              }}
            />
          )}
        </Card>
      </Col>
    </Row>
  )
}
