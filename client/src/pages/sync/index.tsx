import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Collapse, Empty, Form, Input, Modal, Select, Space, Spin, Table, Tag, Typography, theme } from 'antd'
import { CloudSyncOutlined, CloudUploadOutlined, DownloadOutlined, FolderOutlined, GithubOutlined, LinkOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import service from '@/utils/api'
import styles from './style.module.less'

type Config = { repository: string; branch: string; githubToken: string; commitMessage?: string; gitUserName?: string; gitUserEmail?: string; hasGithubToken?: boolean; hasDeployCredential?: boolean; projectPath?: string; suggestedRepository?: string; suggestedBranch?: string }
type Change = { path: string; direction: 'upload' | 'download' | 'merge' | 'conflict'; localExists: boolean; remoteExists: boolean }
type Preview = { id: string; firstSync: boolean; repository: string; branch: string; localCount: number; remoteCount: number; uploadCount: number; downloadCount: number; conflictCount: number; changes: Change[] }
type Status = { isSyncing?: boolean; lastSyncTime?: string; error?: string; stage?: string }
const errorText = (error: any) => error?.response?.data?.msg || error?.response?.data?.message || error?.message || '操作失败，请稍后重试'

export default function SyncPage() {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const [form] = Form.useForm<Config>()
  const [config, setConfig] = useState<Config>({ repository: '', branch: 'main', githubToken: '' })
  const [status, setStatus] = useState<Status>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [connected, setConnected] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, string>>({})
  const [diff, setDiff] = useState<{ path: string; local: string; remote: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [settings, state] = await Promise.all([service.get('/hexopro/api/sync/config'), service.get('/hexopro/api/sync/status')])
      setConfig(settings.data)
      form.setFieldsValue({ ...settings.data, repository: settings.data.repository || settings.data.suggestedRepository,
        branch: settings.data.repository ? settings.data.branch : settings.data.suggestedBranch || 'main' })
      setStatus(state.data)
      setError(state.data.error || '')
    } catch (err) { setError(errorText(err)) } finally { setLoading(false) }
  }, [form])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!status.isSyncing) return
    const timer = setInterval(() => {
      service.get('/hexopro/api/sync/status').then(res => { setStatus(res.data); if (res.data.error) setError(res.data.error) }).catch(() => undefined)
    }, 2000)
    return () => clearInterval(timer)
  }, [status.isSyncing])

  const save = async () => {
    const values = await form.validateFields()
    const response = await service.post('/hexopro/api/sync/save-config', values)
    setConfig(response.data)
    form.setFieldsValue(response.data)
  }

  const check = async (withPreview: boolean) => {
    setBusy(withPreview ? 'preview' : 'check'); setError(''); setNotice(''); setPreview(null); setResolutions({})
    try {
      await save()
      const response = await service.post(`/hexopro/api/sync/${withPreview ? 'preview' : 'check'}`)
      setConnected(true)
      if (withPreview) setPreview(response.data)
      else setNotice('已连接 GitHub，仓库和分支可以访问。')
    } catch (err: any) {
      setConnected(false)
      if (!err.errorFields) setError(errorText(err))
    } finally { setBusy('') }
  }

  const importDeploy = async () => {
    setBusy('import'); setError(''); setPreview(null); setConnected(false)
    try {
      const response = await service.post('/hexopro/api/sync/import-deploy')
      setConfig(response.data); form.setFieldsValue(response.data)
      setNotice('已填入部署页的 GitHub 连接，请检查仓库和分支是否与手机相同。')
    } catch (err) { setError(errorText(err)) } finally { setBusy('') }
  }

  const apply = async () => {
    if (!preview) return
    setBusy('apply'); setError(''); setNotice('')
    try {
      const result = await service.post('/hexopro/api/sync/apply', { id: preview.id, resolutions })
      setStatus({ lastSyncTime: result.data.lastSyncTime })
      setNotice(`同步完成：已上传 ${result.data.uploaded} 个文件，已下载 ${result.data.downloaded} 个文件。${result.data.refreshWarning || ''}`)
      setPreview(null); setResolutions({})
    } catch (err) { setError(errorText(err)); setPreview(null) } finally { setBusy('') }
  }

  const disabled = Boolean(busy) || Boolean(status.isSyncing)
  const unresolved = preview?.changes.filter(change => change.direction === 'conflict' && !resolutions[change.path]).length || 0
  const countDirection = (direction: string) => preview?.changes.filter(change => change.direction === direction || change.direction === 'merge' || (change.direction === 'conflict' && resolutions[change.path] === direction)).length || 0
  const showDiff = async (file: string) => {
    try { const result = await service.post('/hexopro/api/sync/diff', { id: preview?.id, path: file }); setDiff(result.data) }
    catch (err) { setError(errorText(err)) }
  }
  const actionLabel = (change: Change) => {
    const direction = change.direction === 'conflict' ? resolutions[change.path] : change.direction
    if (direction === 'upload') return <Tag color={change.localExists ? 'blue' : 'red'}>{change.localExists ? '上传到 GitHub' : '从 GitHub 删除'}</Tag>
    if (direction === 'download') return <Tag color={change.remoteExists ? 'green' : 'red'}>{change.remoteExists ? '下载到本机' : '从本机删除'}</Tag>
    if (direction === 'merge') return <Tag color="cyan">合并文章 ID</Tag>
    return <Tag color="orange">选择保留版本</Tag>
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><Typography.Title level={3}>云同步</Typography.Title><Typography.Text type="secondary">把博客源文件连起来，随时在手机和电脑之间继续写作。</Typography.Text></div>
      <Button icon={<CloudUploadOutlined aria-hidden />} onClick={() => navigate('/deploy')}>部署网站</Button>
    </header>
    <Spin spinning={loading}>
      <div className={styles.layout}>
        <Card title={<Space><GithubOutlined aria-hidden />GitHub 连接</Space>} className={styles.connection}>
          <div className={styles.project}><FolderOutlined aria-hidden /><div><Typography.Text type="secondary">当前博客</Typography.Text><div className={styles.path}>{config.projectPath || '正在读取…'}</div></div></div>
          <Form form={form} layout="vertical" initialValues={{ branch: 'main' }} disabled={disabled}
            onValuesChange={() => { setPreview(null); setConnected(false); setNotice('') }}>
            <Form.Item name="repository" label="源码仓库" rules={[{ required: true, message: '请输入 GitHub 仓库' }]} extra="与手机使用同一个仓库，里面应包含 Markdown 源文件。">
              <Input prefix={<GithubOutlined aria-hidden />} placeholder="用户名 / 仓库名" autoComplete="off" />
            </Form.Item>
            <Form.Item name="branch" label="同步分支" rules={[{ required: true, message: '请输入同步分支' }]}><Input placeholder="main" autoComplete="off" /></Form.Item>
            <Form.Item name="githubToken" label="GitHub 访问凭据" rules={[{ required: true, message: '请粘贴 GitHub 生成的完整令牌' }]}
              extra="令牌需授权该仓库的 Contents 读写权限；同步工作流时还需 Workflows 写入权限。">
              <Input.Password autoComplete="new-password" placeholder="粘贴 Personal Access Token" />
            </Form.Item>
            <Collapse ghost size="small" items={[{ key: 'advanced', label: '更多选项', children: <>
              <Form.Item name="commitMessage" label="同步记录说明"><Input placeholder="Sync blog: {{ now }}" /></Form.Item>
              <Form.Item name="gitUserName" label="提交用户名"><Input placeholder="Hexo Pro" /></Form.Item>
              <Form.Item name="gitUserEmail" label="提交邮箱"><Input placeholder="hexo-pro@users.noreply.github.com" /></Form.Item>
            </> }]} />
          </Form>
          <Space wrap className={styles.formActions}>
            <Button icon={<LinkOutlined aria-hidden />} onClick={() => check(false)} disabled={disabled} loading={busy === 'check'}>保存并测试连接</Button>
            {config.hasDeployCredential && <Button type="link" onClick={importDeploy} disabled={disabled}>使用部署页凭据</Button>}
          </Space>
        </Card>
        <div className={styles.content}>
          <Card>
            <div className={styles.statusRow}>
              <div><Typography.Title level={4}>手机和电脑，共用一份博客</Typography.Title>
                <Badge status={connected ? 'success' : 'default'} text={connected ? 'GitHub 已连接' : config.hasGithubToken ? '凭据已保存，待检查' : '填写连接后开始同步'} />
              </div>
              <Button type={preview ? 'default' : 'primary'} size="large" icon={<CloudSyncOutlined aria-hidden />} onClick={() => check(true)} disabled={disabled} loading={busy === 'preview'}>检查变更</Button>
            </div>
            <div className={styles.scope}><SafetyCertificateOutlined aria-hidden /><span>同步文章、图片、主题、配置和文章 ID。保留 Front Matter，跳过依赖、缓存和本机凭据。</span></div>
            {status.lastSyncTime && <Typography.Text type="secondary">上次同步：{new Date(status.lastSyncTime).toLocaleString()}</Typography.Text>}
          </Card>
          <div aria-live="polite">
            {error && <Alert type="error" showIcon message="操作未完成" description={error} />}
            {notice && <Alert type="success" showIcon message={notice} />}
            {disabled && <Alert type="info" showIcon icon={<CloudSyncOutlined spin aria-hidden />} message={busy === 'apply' || status.stage === 'syncing' ? '正在同步，请保持应用打开…' : '正在检查 GitHub 和本机文件…'} />}
          </div>
          {preview ? <Card title="本次变更" extra={<Typography.Text type="secondary">{preview.repository} · {preview.branch}</Typography.Text>}>
            <div className={styles.stats}>
              <div><CloudUploadOutlined aria-hidden /><strong>{countDirection('upload')}</strong><span>待上传</span></div>
              <div><DownloadOutlined aria-hidden /><strong>{countDirection('download')}</strong><span>待下载</span></div>
              <div><strong>{unresolved}</strong><span>需选择版本</span></div>
            </div>
            {preview.firstSync && <Typography.Paragraph type="secondary">首次同步会保留两边各自新增的文件。同名文件内容不同时，请选择要保留的版本。</Typography.Paragraph>}
            <Table<Change> rowKey="path" size="small" dataSource={preview.changes} pagination={{ pageSize: 8, showSizeChanger: false, hideOnSinglePage: true }}
              locale={{ emptyText: '两边文件一致，可以确认同步记录。' }} columns={[
                { title: '文件', dataIndex: 'path', render: (name: string) => <Button type="link" className={styles.fileName} onClick={() => showDiff(name)} disabled={disabled}>{name}</Button> },
                { title: '变更', width: 130, render: (_, change) => actionLabel(change) },
                ...(preview.conflictCount ? [{ title: '保留版本', width: 140, render: (_: unknown, change: Change) => change.direction === 'conflict' ?
                  <Select aria-label={`保留 ${change.path} 的版本`} placeholder="请选择" value={resolutions[change.path]} disabled={disabled} style={{ width: '100%' }}
                    onChange={value => setResolutions(current => ({ ...current, [change.path]: value }))}
                    options={[{ value: 'upload', label: change.localExists ? '本机版本' : '本机的删除' }, { value: 'download', label: change.remoteExists ? 'GitHub 版本' : 'GitHub 的删除' }]} /> : null }] : []),
              ]} />
            <div className={styles.reviewActions}>
              <Typography.Text type="secondary">{unresolved ? `还有 ${unresolved} 个文件需要选择版本` : '已列出全部变更；下载覆盖前会保留本机备份。'}</Typography.Text>
              <Button type="primary" onClick={apply} disabled={disabled || unresolved > 0} loading={busy === 'apply'}>{preview.changes.length ? '同步这些变更' : '确认同步'}</Button>
            </div>
          </Card> : <Card className={styles.emptyCard}><Empty image={<CloudSyncOutlined className={styles.emptyIcon} />} description={<div><Typography.Title level={5}>先检查，再同步</Typography.Title><Typography.Paragraph type="secondary">检查变更后，这里会列出需要上传和下载的文件。<br />网站发布仍在「部署网站」中完成。</Typography.Paragraph></div>} /></Card>}
        </div>
      </div>
    </Spin>
    <Modal open={Boolean(diff)} onCancel={() => setDiff(null)} title={diff?.path} width={1000} footer={<Button onClick={() => setDiff(null)}>关闭</Button>}>
      <div className={styles.diff}>
        {diff && (['local', 'remote'] as const).map(side => <section key={side}><Typography.Title level={5}>{side === 'local' ? '本机版本' : 'GitHub 版本'}</Typography.Title>
          <pre style={{ background: token.colorFillAlter, color: token.colorText }}>{diff[side]}</pre></section>)}
      </div>
    </Modal>
  </div>
}
