import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Divider, Form, Input, Space, Spin, Tag, Typography, message } from 'antd'
import { CloudSyncOutlined, KeyOutlined, LinkOutlined, PullRequestOutlined, UploadOutlined } from '@ant-design/icons'
import service from '@/utils/api'

const { Paragraph } = Typography
const { TextArea } = Input

type SyncConfig = {
  repository: string
  branch: string
  commitMessage: string
  gitUserName: string
  gitUserEmail: string
  githubToken: string
  hasGithubToken?: boolean
}

type SyncStatus = {
  isSyncing: boolean
  stage: string
  error?: string | null
  logs: string[]
  lastSyncTime?: string
  hasRepository: boolean
  hasGithubToken: boolean
  gitStatus?: {
    dirty: boolean
    files: string[]
    unavailable?: boolean
  }
}

const defaultConfig: SyncConfig = {
  repository: '',
  branch: 'main',
  commitMessage: 'Sync blog: {{ now }}',
  gitUserName: 'Hexo Pro',
  gitUserEmail: 'hexo-pro@users.noreply.github.com',
  githubToken: '',
}

const defaultStatus: SyncStatus = {
  isSyncing: false,
  stage: 'idle',
  logs: [],
  hasRepository: false,
  hasGithubToken: false,
}

const GitHubSyncSettingsCard: React.FC = () => {
  const [form] = Form.useForm<SyncConfig>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<SyncStatus>(defaultStatus)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await service.get('/hexopro/api/sync/config')
      form.setFieldsValue({ ...defaultConfig, ...(res.data || {}) })
    } catch (error) {
      message.error('获取云同步配置失败')
    } finally {
      setLoading(false)
    }
  }, [form])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await service.get('/hexopro/api/sync/status')
      setStatus(res.data || defaultStatus)
    } catch (error) {
      message.error('获取云同步状态失败')
    }
  }, [])

  useEffect(() => {
    fetchConfig()
    fetchStatus()
  }, [fetchConfig, fetchStatus])

  const saveConfig = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const res = await service.post('/hexopro/api/sync/save-config', values)
      form.setFieldsValue(res.data)
      message.success('云同步配置已保存')
      await fetchStatus()
      return res.data
    } catch (error) {
      message.error('保存云同步配置失败')
      return null
    } finally {
      setSaving(false)
    }
  }

  const clearToken = async () => {
    setSaving(true)
    try {
      const res = await service.post('/hexopro/api/sync/token/clear')
      form.setFieldsValue(res.data)
      message.success('已清除 GitHub Token')
      await fetchStatus()
    } catch (error) {
      message.error('清除 GitHub Token 失败')
    } finally {
      setSaving(false)
    }
  }

  const runSyncAction = async (action: 'push' | 'pull' | 'run') => {
    setSaving(true)
    try {
      await saveConfig()
      await service.post(`/hexopro/api/sync/${action}`)
      await fetchStatus()
      message.success('云同步操作完成')
    } catch (error: any) {
      await fetchStatus()
      message.error(error?.response?.data?.msg || error?.message || '云同步操作失败')
    } finally {
      setSaving(false)
    }
  }

  const logs = (status.logs || []).join('\n')
  const connected = status.hasGithubToken

  return (
    <Card>
      <Spin spinning={loading || saving || status.isSyncing}>
        <Divider orientation="left">
          <CloudSyncOutlined /> GitHub 云同步
        </Divider>

        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="完整博客工程同步"
            description="云同步会把当前 Hexo 博客目录作为 Git 工作区同步到 GitHub。请使用 GitHub Personal Access Token，建议 Fine-grained Token 只授权当前博客仓库的 Contents 读写权限。"
          />

          <Form form={form} layout="vertical" initialValues={defaultConfig}>
            <Form.Item
              name="githubToken"
              label="GitHub Personal Access Token"
              rules={[{ required: true, message: '请输入 GitHub Personal Access Token' }]}
            >
              <Input.Password prefix={<KeyOutlined />} placeholder="Fine-grained PAT 或 classic PAT" />
            </Form.Item>

            <Form.Item
              name="repository"
              label="GitHub 仓库"
              rules={[{ required: true, message: '请输入 owner/repo 格式的仓库名' }]}
            >
              <Input prefix={<LinkOutlined />} placeholder="owner/repo" />
            </Form.Item>

            <Space style={{ width: '100%' }} size={16} align="start">
              <Form.Item name="branch" label="同步分支" rules={[{ required: true }]} style={{ flex: 1 }}>
                <Input placeholder="main" />
              </Form.Item>
              <Form.Item name="commitMessage" label="提交消息" style={{ flex: 2 }}>
                <Input placeholder="Sync blog: {{ now }}" />
              </Form.Item>
            </Space>

            <Space style={{ width: '100%' }} size={16} align="start">
              <Form.Item name="gitUserName" label="Git 提交用户名" style={{ flex: 1 }}>
                <Input />
              </Form.Item>
              <Form.Item name="gitUserEmail" label="Git 提交邮箱" style={{ flex: 1 }}>
                <Input />
              </Form.Item>
            </Space>
          </Form>

          <Space wrap>
            <Tag color={connected ? 'green' : 'default'}>
              {connected ? '已配置 GitHub Token' : '未配置 GitHub Token'}
            </Tag>
            <Tag color={status.gitStatus?.dirty ? 'orange' : 'blue'}>
              {status.gitStatus?.dirty ? `本地有 ${status.gitStatus.files.length} 个变更` : '本地工作区干净'}
            </Tag>
            {status.lastSyncTime && <Tag>上次同步 {new Date(status.lastSyncTime).toLocaleString()}</Tag>}
          </Space>

          <Space wrap>
            <Button onClick={saveConfig}>保存配置</Button>
            {connected && <Button onClick={clearToken}>清除 Token</Button>}
          </Space>

          <Space wrap>
            <Button icon={<UploadOutlined />} disabled={!connected} onClick={() => runSyncAction('push')}>
              同步到 GitHub
            </Button>
            <Button icon={<PullRequestOutlined />} disabled={!connected} onClick={() => runSyncAction('pull')}>
              从 GitHub 同步到本地
            </Button>
            <Button type="primary" icon={<CloudSyncOutlined />} disabled={!connected} onClick={() => runSyncAction('run')}>
              双向同步
            </Button>
          </Space>

          {status.error && <Alert type="error" showIcon message="云同步失败" description={status.error} />}

          <div>
            <Paragraph strong style={{ marginBottom: 8 }}>
              同步日志
            </Paragraph>
            <TextArea rows={8} readOnly value={logs} placeholder="暂无同步日志" />
          </div>
        </Space>
      </Spin>
    </Card>
  )
}

export default GitHubSyncSettingsCard
