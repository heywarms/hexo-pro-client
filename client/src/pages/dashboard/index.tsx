import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  Row,
  Col,
  Card,
  List,
  Button,
  Input,
  Typography,
  Timeline,
  Spin,
  Modal,
  Form,
  message,
  Tooltip,
  Badge,
  Checkbox,
  Empty,
  Tag,
  Select,
} from 'antd'
import {
  FileAddOutlined,
  EditOutlined,
  SettingOutlined,
  TagsOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  RocketOutlined,
  BarChartOutlined,
  PieChartOutlined,
  DeleteOutlined,
  CodeOutlined,
  BgColorsOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { GlobalContext } from '@/context'
import useLocale from '@/hooks/useLocale'
import useDeviceDetect from '@/hooks/useDeviceDetect'
import service from '@/utils/api'
import { documentRouteId } from '@/utils/documentIdentity'
import styles from './style/index.module.less'
import { Column, Pie, WordCloud } from '@ant-design/charts'

const { Title, Text, Paragraph } = Typography
const { Search } = Input

type CategoryItem = { name: string; count: number }
type TagItem = { name: string; count: number; path: string }
type RecentPostItem = {
  title: string
  permalink: string
  documentId?: string
  date?: string
  updated?: string
  isDraft?: boolean
}

type TodoItem = {
  id: string
  content: string
  completed: boolean
  createdAt: string
}

type PluginItem = {
  name: string
  version: string
  enabled: boolean
}

type DashboardStats = {
  totalPosts: number
  draftPosts: number
  publishedPosts: number
  categories: CategoryItem[]
  tags: TagItem[]
  recentPosts: RecentPostItem[]
}

type SystemInfo = {
  hexoVersion: string
  theme: string
  plugins: PluginItem[]
  lastDeployTime: string
  author: string
}

const DEFAULT_STATS: DashboardStats = {
  totalPosts: 0,
  draftPosts: 0,
  publishedPosts: 0,
  categories: [],
  tags: [],
  recentPosts: [],
}

const DEFAULT_SYSTEM_INFO: SystemInfo = {
  hexoVersion: 'N/A',
  theme: 'N/A',
  plugins: [],
  lastDeployTime: 'N/A',
  author: '',
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { theme } = useContext(GlobalContext)
  const t = useLocale()
  const { isMobile } = useDeviceDetect()
  const [form] = Form.useForm()

  const [loading, setLoading] = useState(true)
  const [todoLoading, setTodoLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [categoryLoading, setCategoryLoading] = useState(false)

  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS)
  const [systemInfo, setSystemInfo] = useState<SystemInfo>(DEFAULT_SYSTEM_INFO)
  const [todoItems, setTodoItems] = useState<TodoItem[]>([])
  const [todoInput, setTodoInput] = useState('')
  const [deployLogs, setDeployLogs] = useState<string[]>([])
  const [monthlyNewPosts, setMonthlyNewPosts] = useState(0)
  const [monthlyPostStats, setMonthlyPostStats] = useState<{ month: string; count: number }[]>([])

  const isDark = theme === 'dark'

  const checkTitleExists = async (title: string): Promise<boolean> => {
    try {
      const res = await service.get('/hexopro/api/posts/check-title', {
        params: { title },
      })
      return !!res.data?.exists
    } catch {
      return false
    }
  }

  const normalizeCategoryValues = (values: string[] = []) => {
    return Array.from(new Set(values.map(item => item.trim()).filter(Boolean)))
  }

  const createNewPost = async (title: string, categories: string[] = []) => {
    const exists = await checkTitleExists(title)
    const finalTitle = exists ? `${title} (${Date.now()})` : title
    if (exists) {
      message.info(t['dashboard.welcome.new.title.duplicated'] || '已存在同名文章，已自动添加区分字符')
    }

    const res = await service.post('/hexopro/api/posts/new', { title: finalTitle, categories })
    if (res.data?.permalink) {
      message.success(t['dashboard.success.createPost'])
      navigate(`/post/${documentRouteId(res.data)}`)
    }
  }

  const fetchCategoryOptions = useCallback(async () => {
    try {
      setCategoryLoading(true)
      const res = await service.get('/hexopro/api/tags-categories-and-metadata')
      const categoryMap = res.data?.categories || {}
      const options = Object.keys(categoryMap).map(key => categoryMap[key]).filter(Boolean)
      setCategoryOptions(options)
    } catch {
      setCategoryOptions([])
    } finally {
      setCategoryLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      const [
        postsRes,
        categoriesRes,
        tagsRes,
        recentPostsRes,
        monthlyStatsRes,
        monthlyNewRes,
        systemRes,
      ] = await Promise.all([
        service.get('/hexopro/api/dashboard/posts/stats'),
        service.get('/hexopro/api/dashboard/categories/list'),
        service.get('/hexopro/api/dashboard/tags/list'),
        service.get('/hexopro/api/dashboard/posts/recent', { params: { limit: 8 } }),
        service.get('/hexopro/api/dashboard/posts/monthly-stats'),
        service.get('/hexopro/api/dashboard/posts/monthly-new'),
        service.get('/hexopro/api/dashboard/system/info'),
      ])

      setStats({
        totalPosts: postsRes.data?.total || 0,
        draftPosts: postsRes.data?.drafts || 0,
        publishedPosts: postsRes.data?.published || 0,
        categories: categoriesRes.data || [],
        tags: tagsRes.data || [],
        recentPosts: recentPostsRes.data || [],
      })
      setMonthlyPostStats(monthlyStatsRes.data || [])
      setMonthlyNewPosts(monthlyNewRes.data?.count || 0)
      setSystemInfo(systemRes.data || DEFAULT_SYSTEM_INFO)
    } catch {
      message.error(t['dashboard.error.fetchFailed'])
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchTodoItems = useCallback(async () => {
    try {
      setTodoLoading(true)
      const todoRes = await service.get('/hexopro/api/dashboard/todos/list')
      setTodoItems(todoRes.data || [])
    } catch {
      message.error(t['dashboard.error.fetchFailed'])
    } finally {
      setTodoLoading(false)
    }
  }, [t])

  const fetchDeployLogs = useCallback(async () => {
    try {
      const res = await service.get('/hexopro/api/deploy/status')
      const logs = (res.data?.logs || []).map((item: string) => t[item] || item)
      setDeployLogs(logs)
    } catch {
      setDeployLogs([])
    }
  }, [t])

  useEffect(() => {
    fetchStats()
    fetchTodoItems()
    fetchDeployLogs()
  }, [fetchDeployLogs, fetchStats, fetchTodoItems])

  const addTodoItem = async (content: string) => {
    const value = content.trim()
    if (!value) return
    try {
      setTodoLoading(true)
      await service.post('/hexopro/api/dashboard/todos/add', { content: value })
      message.success(t['dashboard.success.addTodo'])
      setTodoInput('')
      await fetchTodoItems()
    } catch {
      message.error(t['dashboard.error.addTodoFailed'])
      setTodoLoading(false)
    }
  }

  const handleDeleteTodo = async (id: string) => {
    try {
      setTodoLoading(true)
      await service.delete(`/hexopro/api/dashboard/todos/delete/${id}`)
      setTodoItems(prev => prev.filter(item => item.id !== id))
      message.success(t['dashboard.success.deleteTodo'])
    } catch {
      message.error(t['dashboard.error.deleteTodoFailed'])
    } finally {
      setTodoLoading(false)
    }
  }

  const handleToggleTodo = async (id: string) => {
    try {
      setTodoLoading(true)
      await service.put(`/hexopro/api/dashboard/todos/toggle/${id}`)
      setTodoItems(prev => prev.map(item => (item.id === id ? { ...item, completed: !item.completed } : item)))
    } catch {
      message.error(t['dashboard.error.toggleTodoFailed'])
    } finally {
      setTodoLoading(false)
    }
  }

  const getWelcomeMessage = () => {
    const hour = new Date().getHours()
    if (hour < 6) return t['dashboard.welcome.night']
    if (hour < 9) return t['dashboard.welcome.morning']
    if (hour < 12) return t['dashboard.welcome.forenoon']
    if (hour < 14) return t['dashboard.welcome.noon']
    if (hour < 18) return t['dashboard.welcome.afternoon']
    if (hour < 22) return t['dashboard.welcome.evening']
    return t['dashboard.welcome.night']
  }

  const localeForDate = t.lang === 'zh-CN' ? 'zh-CN' : t.lang === 'fr-FR' ? 'fr-FR' : 'en-US'
  const todayText = t['dashboard.welcome.today'].replace(
    '{date}',
    new Date().toLocaleDateString(localeForDate, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  )

  const enabledPluginsCount = useMemo(
    () => (systemInfo.plugins || []).filter(plugin => plugin.enabled).length,
    [systemInfo.plugins],
  )

  const metricCards = useMemo(
    () => [
      {
        key: 'total',
        icon: <FileTextOutlined />,
        label: t['dashboard.stats.totalPosts'],
        value: stats.totalPosts,
        hint: t['dashboard.metric.totalHint'] || '所有文章总量',
        onClick: () => navigate('/content/posts/blogs'),
      },
      {
        key: 'month',
        icon: <BarChartOutlined />,
        label: t['dashboard.stats.monthlyNew'],
        value: monthlyNewPosts,
        hint: t['dashboard.metric.monthHint'] || '近 30 天新增文章',
        onClick: () => navigate('/content/posts/blogs'),
      },
      {
        key: 'draft',
        icon: <EditOutlined />,
        label: t['dashboard.stats.drafts'],
        value: stats.draftPosts,
        hint: t['dashboard.metric.draftHint'] || '待完善内容',
        onClick: () => navigate('/content/posts/drafts'),
      },
      {
        key: 'todo',
        icon: <ClockCircleOutlined />,
        label: t['dashboard.stats.todos'],
        value: todoItems.length,
        hint: t['dashboard.metric.todoHint'] || '今天的任务清单',
      },
    ],
    [monthlyNewPosts, navigate, stats.draftPosts, stats.totalPosts, t, todoItems.length],
  )

  const trendChartConfig = useMemo(
    () => ({
      data: monthlyPostStats,
      xField: 'month',
      yField: 'count',
      height: 240,
      color: '#2b6bff',
      columnStyle: {
        radius: [6, 6, 0, 0],
        fill: 'l(90) 0:#2b6bff 1:#5ea3ff',
      },
      xAxis: {
        label: {
          autoHide: true,
          style: { fill: isDark ? '#c8d2e8' : '#66708a' },
        },
      },
      yAxis: {
        label: {
          style: { fill: isDark ? '#c8d2e8' : '#66708a' },
        },
      },
      animation: { appear: { animation: 'scale-in-y', duration: 650 } },
      tooltip: {
        formatter: (datum: { count: number }) => ({ name: t['dashboard.stats.monthlyNew'], value: datum.count }),
      },
      interactions: [{ type: 'element-active' }],
      theme: isDark ? 'dark' : 'light',
    }),
    [isDark, monthlyPostStats, t],
  )

  const categoryPieConfig = useMemo(
    () => ({
      data: (stats.categories || []).map(item => ({ type: item.name, value: item.count })),
      angleField: 'value',
      colorField: 'type',
      radius: 0.82,
      innerRadius: 0.62,
      height: 250,
      label: {
        type: 'outer',
        content: '{name}',
        style: { fontSize: 12 },
      },
      legend: { position: 'bottom' as const },
      interactions: [{ type: 'element-active' }, { type: 'pie-statistic-active' }],
      theme: isDark ? 'dark' : 'light',
    }),
    [isDark, stats.categories],
  )

  const tagCloudConfig = useMemo(
    () => ({
      data: (stats.tags || []).map(tag => ({ name: tag.name, value: tag.count, path: tag.path })),
      wordField: 'name',
      weightField: 'value',
      colorField: 'name',
      height: 220,
      spiral: 'rectangular' as const,
      random: () => Math.random(),
      wordStyle: {
        fontFamily: 'Verdana',
        fontSize: [14, 36] as [number, number],
        rotation: 0,
        fontWeight: 700,
      },
      interactions: [{ type: 'element-active' }],
      tooltip: {
        formatter: (datum: { text: string; value: number }) => ({ name: datum.text, value: datum.value }),
      },
      style: {
        background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(244,248,255,0.8)',
        borderRadius: 10,
      },
      theme: isDark ? 'dark' : 'light',
    }),
    [isDark, stats.tags],
  )

  const handleCreatePost = async () => {
    try {
      const values = await form.validateFields()
      await createNewPost(values.title, normalizeCategoryValues(values.categories))
      setCreateModalOpen(false)
      form.resetFields()
    } catch {
      // no-op
    }
  }

  useEffect(() => {
    if (createModalOpen) {
      fetchCategoryOptions()
    }
  }, [createModalOpen, fetchCategoryOptions])

  return (
    <div className={`${styles.dashboardContainer} ${isDark ? styles.darkMode : ''}`}>
      <Card className={styles.heroCard} bordered={false}>
        <div className={styles.heroTop}>
          <div>
            <Title level={3} className={styles.heroTitle}>
              {getWelcomeMessage()}
              {systemInfo.author ? `，${systemInfo.author}` : ''}
            </Title>
            <Paragraph className={styles.heroSubtitle}>{todayText}</Paragraph>
          </div>
          <div className={styles.heroActions}>
            <Button type="primary" icon={<FileAddOutlined />} onClick={() => setCreateModalOpen(true)}>
              {t['dashboard.welcome.new.post']}
            </Button>
            <Button icon={<EditOutlined />} onClick={() => navigate('/content/posts/drafts')}>
              {t['dashboard.welcome.new.draft']}
            </Button>
            <Button icon={<RocketOutlined />} onClick={() => navigate('/deploy')}>
              {t['dashboard.welcome.new.deploy']}
            </Button>
            <Button icon={<HomeOutlined />} onClick={() => window.open('/', '_blank')}>
              {t['dashboard.welcome.new.blog.front.end']}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchStats} />
          </div>
        </div>
        <div className={styles.heroStatusRow}>
          <Tag className={styles.statusTag} icon={<CodeOutlined />}>
            {t['dashboard.system.hexoVersion']}: {systemInfo.hexoVersion || 'N/A'}
          </Tag>
          <Tag className={styles.statusTag} icon={<BgColorsOutlined />}>
            {t['dashboard.system.theme']}: {systemInfo.theme || 'N/A'}
          </Tag>
          <Tag className={styles.statusTag} icon={<ClockCircleOutlined />}>
            {t['dashboard.system.lastDeploy']}: {systemInfo.lastDeployTime || t['universal.empty']}
          </Tag>
          <Tag className={styles.statusTag} icon={<SettingOutlined />}>
            {t['dashboard.system.pluginsCount']
              .replace('{enabled}', String(enabledPluginsCount))
              .replace('{total}', String(systemInfo.plugins?.length || 0))}
          </Tag>
        </div>
      </Card>

      <Row gutter={[14, 14]} className={styles.metricsRow}>
        {metricCards.map(item => (
          <Col xs={12} md={6} key={item.key}>
            <Card
              bordered={false}
              className={`${styles.metricCard} ${item.onClick ? styles.metricCardClickable : ''}`}
              onClick={item.onClick}
            >
              <div className={styles.metricIcon}>{item.icon}</div>
              <div className={styles.metricValue}>{item.value}</div>
              <div className={styles.metricLabel}>{item.label}</div>
              <div className={styles.metricHint}>{item.hint}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[14, 14]} className={styles.mainRow}>
        <Col xs={24} xl={16}>
          <Card
            title={
              <span>
                <BarChartOutlined /> {t['dashboard.chart.postTrend']}
              </span>
            }
            className={`${styles.sectionCard} ${styles.trendCard}`}
            bordered={false}
          >
            <div className={`${styles.chartWrap} ${styles.trendChartWrap}`}>
              {loading || monthlyPostStats.length === 0 ? (
                <Empty description={t['dashboard.empty.noData']} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Column {...trendChartConfig} />
              )}
            </div>
          </Card>

          <Row gutter={[14, 14]} className={styles.secondaryRow}>
            <Col xs={24} md={12}>
              <Card
                title={
                  <span>
                    <PieChartOutlined /> {t['dashboard.chart.categoryDist']}
                  </span>
                }
                className={styles.sectionCard}
                bordered={false}
              >
                <div className={styles.chartWrap}>
                  {loading || stats.categories.length === 0 ? (
                    <Empty description={t['dashboard.empty.noCategories']} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <Pie {...categoryPieConfig} />
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card
                title={
                  <span>
                    <TagsOutlined /> {t['dashboard.chart.tagCloud']}
                  </span>
                }
                className={styles.sectionCard}
                bordered={false}
              >
                <div className={styles.chartWrap}>
                  {loading || stats.tags.length === 0 ? (
                    <Empty description={t['dashboard.empty.noTags']} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <WordCloud
                      {...tagCloudConfig}
                      onReady={plot => {
                        plot.chart.on('element:click', e => {
                          const datum = e?.data?.data?.datum
                          if (datum?.path) {
                            window.open(datum.path, '_blank')
                          }
                        })
                      }}
                    />
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          <Card
            title={
              <span>
                <EditOutlined /> {t['dashboard.articles.recent']}
              </span>
            }
            className={`${styles.sectionCard} ${styles.recentCard}`}
            bordered={false}
          >
            <List
              dataSource={stats.recentPosts}
              locale={{ emptyText: <Empty description={t['dashboard.articles.empty']} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              renderItem={article => (
                <List.Item
                  className={styles.recentListItem}
                  onClick={() => navigate(`/post/${documentRouteId(article)}`)}
                  actions={[
                    <Button type="link" size="small" icon={<EditOutlined />} key={`edit-${article.permalink}`}>
                      {t['dashboard.todo.editTooltip']}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <div className={styles.recentTitle}>
                        {article.isDraft && <Badge status="warning" text={t['dashboard.articles.draftBadge']} className={styles.draftBadge} />}
                        <Text ellipsis>{article.title}</Text>
                      </div>
                    }
                    description={
                      <div className={styles.recentMeta}>
                        <ClockCircleOutlined /> {article.updated || article.date || '-'}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <div className={styles.sideColumn}>
            <Card
              title={<span><EditOutlined /> {t['dashboard.todo.title']}</span>}
              className={`${styles.sectionCard} ${styles.todoCard}`}
              bordered={false}
              extra={
                <Search
                  placeholder={t['dashboard.todo.addPlaceholder']}
                  enterButton={isMobile ? <FileAddOutlined /> : t['dashboard.todo.addButton']}
                  value={todoInput}
                  onChange={e => setTodoInput(e.target.value)}
                  onSearch={addTodoItem}
                  loading={todoLoading}
                  className={styles.todoInput}
                />
              }
            >
              <Spin spinning={todoLoading}>
                <List
                  dataSource={todoItems}
                  locale={{ emptyText: <Empty description={t['dashboard.todo.empty']} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  renderItem={(item: TodoItem) => (
                    <List.Item
                      actions={[
                        <Tooltip title={t['dashboard.todo.deleteTooltip']} key={`del-${item.id}`}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleDeleteTodo(item.id)}
                          />
                        </Tooltip>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Checkbox checked={item.completed} onChange={() => handleToggleTodo(item.id)} />}
                        title={<Text delete={item.completed}>{item.content}</Text>}
                        description={t['dashboard.todo.createdAt'].replace('{date}', item.createdAt)}
                      />
                    </List.Item>
                  )}
                />
              </Spin>
            </Card>

            <Card
              title={<span><SettingOutlined /> {t['dashboard.system.title']}</span>}
              className={`${styles.sectionCard} ${styles.systemCard}`}
              bordered={false}
            >
              <div className={styles.systemList}>
                <div className={styles.systemListItem}>
                  <span><CodeOutlined /> {t['dashboard.system.hexoVersion']}</span>
                  <Text strong>{systemInfo.hexoVersion || 'N/A'}</Text>
                </div>
                <div className={styles.systemListItem}>
                  <span><BgColorsOutlined /> {t['dashboard.system.theme']}</span>
                  <Text strong>{systemInfo.theme || 'N/A'}</Text>
                </div>
                <div className={styles.systemListItem}>
                  <span><ClockCircleOutlined /> {t['dashboard.system.lastDeploy']}</span>
                  <Text strong>{systemInfo.lastDeployTime || t['universal.empty']}</Text>
                </div>
                <div className={styles.systemListItem}>
                  <span><TagsOutlined /> {t['dashboard.system.plugins']}</span>
                  <Text strong>
                    {t['dashboard.system.pluginsCount']
                      .replace('{enabled}', String(enabledPluginsCount))
                      .replace('{total}', String(systemInfo.plugins?.length || 0))}
                  </Text>
                </div>
              </div>
            </Card>

            <Card
              title={<span><RocketOutlined /> {t['dashboard.deploy.log.title']}</span>}
              className={`${styles.sectionCard} ${styles.deployCard}`}
              bordered={false}
            >
              {deployLogs.length === 0 ? (
                <Empty description={t['universal.empty']} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Timeline
                  items={deployLogs.slice(-8).map((log, index) => ({
                    key: `${index}-${log}`,
                    children: log,
                  }))}
                />
              )}
            </Card>
          </div>
        </Col>
      </Row>

      <Modal
        title={t['dashboard.welcome.new.post']}
        open={createModalOpen}
        onOk={handleCreatePost}
        onCancel={() => {
          setCreateModalOpen(false)
          form.resetFields()
        }}
        okText={t['universal.create']}
        cancelText={t['universal.cancel']}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label={t['dashboard.welcome.new.blog.title']}
            rules={[{ required: true, message: t['universal.input.placeholder'] }]}
          >
            <Input placeholder={t['universal.input.placeholder']} />
          </Form.Item>
          <Form.Item
            name="categories"
            label={t['dashboard.welcome.new.blog.category'] || '分类'}
          >
            <Select
              mode="tags"
              loading={categoryLoading}
              placeholder={t['dashboard.welcome.new.blog.category.placeholder'] || '请选择或输入分类'}
              options={categoryOptions.map(item => ({ label: item, value: item }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Dashboard
