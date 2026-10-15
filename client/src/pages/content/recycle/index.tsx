import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Input, Modal, Radio, Space, Table, Tag, Tooltip, message } from 'antd'
import { DeleteOutlined, FileOutlined, FileTextOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons'
import service from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import ManagementPage from '../components/ManagementPage'
import managementLocale from '../components/ManagementPage/locale'
import shared from '../components/ManagementPage/style.module.less'
import styles from './style.module.less'

type RecycleItem = { _id: string; type: 'post' | 'page'; title: string; permalink: string; originalSource: string; discardedPath: string; isDraft?: boolean; deletedAt: string }

export default function RecyclePage() {
  const locale = useLocale()
  const ui = useLocale(managementLocale)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [list, setList] = useState<RecycleItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [type, setType] = useState<'all' | 'post' | 'page'>('all')
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const request = useRef(0)

  const fetchList = useCallback(async () => {
    const revision = ++request.current
    setLoading(true)
    setError('')
    try {
      const res = await service.get('/hexopro/api/recycle/list', { params: { type, page, pageSize, query: searchQuery || undefined } })
      if (revision !== request.current) return
      const count = res.data?.total || 0
      setList(res.data?.data || [])
      setTotal(count)
      if (page > 1 && page > Math.ceil(count / pageSize)) setPage(Math.max(1, Math.ceil(count / pageSize)))
    } catch (err: any) {
      if (revision === request.current) setError(err.message)
    } finally { if (revision === request.current) setLoading(false) }
  }, [type, page, pageSize, searchQuery])
  useEffect(() => { fetchList(); return () => { request.current++ } }, [fetchList])
  useEffect(() => { setSelectedRowKeys([]) }, [type, page, pageSize, searchQuery])

  function onRestore(item?: RecycleItem) {
    const ids = item ? [item._id] : selectedRowKeys as string[]
    if (!ids.length) return
    let strategy = 'keepBoth'
    Modal.confirm({
      title: locale['recycle.restore.title'],
      content: <Space direction="vertical" size={16}><div>{locale['recycle.restore.desc']}</div><Radio.Group defaultValue={strategy} onChange={e => { strategy = e.target.value }}><Space direction="vertical"><Radio value="keepBoth">{locale['recycle.strategy.keepBoth']}</Radio><Radio value="overwrite">{locale['recycle.strategy.overwrite']}</Radio><Radio value="rename">{locale['recycle.strategy.rename']}</Radio></Space></Radio.Group></Space>,
      okText: ui.restore, cancelText: locale['universal.cancel'],
      onOk: async () => {
        setBusy(true)
        try {
          for (const id of ids) await service.post('/hexopro/api/recycle/restore', { id, conflictStrategy: strategy })
          message.success(locale['recycle.restore.success']); setSelectedRowKeys([]); await fetchList()
        } catch (err: any) { message.error(err.message || locale['recycle.restore.failed']); throw err }
        finally { setBusy(false) }
      },
    })
  }

  function onDelete(item?: RecycleItem) {
    const ids = item ? [item._id] : selectedRowKeys as string[]
    if (!ids.length) return
    Modal.confirm({ title: locale['recycle.delete.title'], content: locale['recycle.delete.desc'], okText: ui.permanentlyDelete, cancelText: locale['universal.cancel'], okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true)
        try {
          for (const id of ids) await service.post('/hexopro/api/recycle/delete', { id })
          message.success(locale['recycle.delete.success']); setSelectedRowKeys([]); await fetchList()
        } catch (err: any) { message.error(err.message || locale['recycle.delete.failed']); throw err }
        finally { setBusy(false) }
      },
    })
  }

  function onEmpty() {
    Modal.confirm({ title: locale['recycle.empty.title'], content: locale['recycle.empty.desc'], okText: locale['recycle.action.empty'], cancelText: locale['universal.cancel'], okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true)
        try {
          await service.post('/hexopro/api/recycle/empty', { type })
          message.success(locale['recycle.empty.success']); setSelectedRowKeys([]); await fetchList()
        } catch (err: any) { message.error(err.message || locale['recycle.empty.failed']); throw err }
        finally { setBusy(false) }
      },
    })
  }

  const columns = [
    { title: ui.deletedContent, key: 'title', render: (_: any, item: RecycleItem) => <div className={styles.document}><span className={styles.documentIcon}>{item.type === 'post' ? <FileTextOutlined /> : <FileOutlined />}</span><div><strong>{item.title}</strong><span className={styles.source}>{item.originalSource}</span></div></div> },
    { title: locale['recycle.table.type'], dataIndex: 'type', key: 'type', width: 100, render: (value: string) => <Tag bordered={false} color={value === 'post' ? 'blue' : 'default'}>{locale[value === 'post' ? 'navbar.search.tag.post' : 'navbar.search.tag.page']}</Tag> },
    { title: locale['recycle.table.deletedAt'], dataIndex: 'deletedAt', key: 'deletedAt', width: 170, render: (value: string) => <span className={styles.date}>{String(value || '—').replace('T', ' ').slice(0, 16)}</span> },
    { title: locale['content.articleList.table.option'], key: 'action', width: 155, render: (_: any, item: RecycleItem) => <Space size={6}><Button type="text" icon={<UndoOutlined />} disabled={busy} onClick={() => onRestore(item)}>{ui.restore}</Button><Tooltip title={ui.permanentlyDelete}><Button type="text" danger icon={<DeleteOutlined />} aria-label={`${ui.permanentlyDelete} ${item.title}`} disabled={busy} onClick={() => onDelete(item)} /></Tooltip></Space> },
  ]

  return <ManagementPage title={locale['menu.recycle']} description={ui.recycleDescription} count={ui.total.replace('{count}', String(total))}
    actions={<><Button icon={<ReloadOutlined />} loading={loading} disabled={busy} onClick={fetchList}>{ui.refresh}</Button><Button danger icon={<DeleteOutlined />} disabled={!total || busy} onClick={onEmpty}>{locale['recycle.action.empty']}</Button></>}>
    <div className={shared.toolbar}>
      <Radio.Group className={styles.filters} value={type} optionType="button" buttonStyle="solid" onChange={e => { setType(e.target.value); setPage(1) }} options={[{label: ui.all, value: 'all'}, {label: locale['navbar.search.tag.post'], value: 'post'}, {label: locale['navbar.search.tag.page'], value: 'page'}]} />
      <Input.Search className={shared.search} prefix={<SearchOutlined />} placeholder={locale['recycle.search.placeholder']} aria-label={locale['recycle.search.placeholder']} value={query} allowClear onChange={e => { setQuery(e.target.value); if (!e.target.value) { setSearchQuery(''); setPage(1) } }} onSearch={value => { setSearchQuery(value.trim()); setPage(1) }} />
    </div>
    {selectedRowKeys.length > 0 && <div className={shared.batchBar} role="status"><span>{ui.selected.replace('{count}', String(selectedRowKeys.length))}</span><Button icon={<UndoOutlined />} disabled={busy} onClick={() => onRestore()}>{locale['recycle.action.batchRestore']}</Button><Button danger disabled={busy} onClick={() => onDelete()}>{locale['recycle.action.batchDelete']}</Button><Button type="text" disabled={busy} onClick={() => setSelectedRowKeys([])}>{locale['universal.cancel']}</Button></div>}
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={fetchList}>{ui.retry}</Button>} /> : <Table className={styles.table} rowKey="_id" loading={loading || busy} dataSource={list} columns={columns} scroll={{x: 680}}
      pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [12,24,48], showTotal: count => ui.total.replace('{count}', String(count)), onChange: (p, size) => { setPage(p); setPageSize(size) } }}
      rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys, getCheckboxProps: () => ({disabled: busy}) }}
      locale={{emptyText:<div className={shared.empty}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={searchQuery ? ui.noResults : <><strong>{ui.emptyRecycle}</strong><p>{ui.recycleEmptyHint}</p></>} /></div>}} />}
    <div className={styles.note}><InfoCircleOutlined /><span>{ui.recycleNote}</span></div>
  </ManagementPage>
}
