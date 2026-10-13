import React, { useCallback, useEffect, useState, useRef } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  message,
  Divider,
  Alert,
  Spin,
  Typography,
  Space,
  Row,
  Col,
  Progress,
  Timeline,
  Switch,
  Tabs,
  Badge,
  Tag,
  Select,
} from 'antd'
import {
  GithubOutlined,
  RocketOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  CloudOutlined,
  ThunderboltOutlined,
  CloudServerOutlined,
} from '@ant-design/icons'
import { service } from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import { useLocalStorageState } from '@/pages/settings/hooks/useLocalStorageState'
import styles from './style.module.less'
import { useNavigate } from 'react-router-dom'

const { Paragraph, Text } = Typography

type DeployTarget = 'github' | 'cloudflare-pages' | 'edgeone-pages'

const DeployPage: React.FC = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [deployLoading, setDeployLoading] = useState<DeployTarget | 'all' | null>(null)
  const t = useLocale()
  const [activeTab, setActiveTab] = useState('github')
  const [githubEnabled, setGithubEnabled] = useState(true)
  const [cloudflareEnabled, setCloudflareEnabled] = useState(false)
  const [edgeoneEnabled, setEdgeoneEnabled] = useState(false)
  const [skipGenerateEnabled, setSkipGenerateEnabled] = useLocalStorageState<boolean>(
    'hexoProSkipGenerate',
    false,
    {
      serialize: (v) => v.toString(),
      deserialize: (raw) => raw === 'true',
    },
  )

  const onSkipGenerateChange = useCallback(
    (checked: boolean) => {
      setSkipGenerateEnabled(checked)
      message.success(checked ? t['settings.skipGenerateEnabled'] : t['settings.skipGenerateDisabled'])
    },
    [setSkipGenerateEnabled, t],
  )

  const [deployStatus, setDeployStatus] = useState({
    isDeploying: false,
    progress: 0,
    stage: 'idle',
    lastDeployTime: t['deploy.status.unknownTime'],
    logs: [] as string[],
    hasDeployGit: false,
    error: null as string | null,
  })
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const githubEnabledRef = useRef(githubEnabled)
  const cloudflareEnabledRef = useRef(cloudflareEnabled)
  const edgeoneEnabledRef = useRef(edgeoneEnabled)

  useEffect(() => {
    githubEnabledRef.current = githubEnabled
  }, [githubEnabled])
  useEffect(() => {
    cloudflareEnabledRef.current = cloudflareEnabled
  }, [cloudflareEnabled])
  useEffect(() => {
    edgeoneEnabledRef.current = edgeoneEnabled
  }, [edgeoneEnabled])

  const saveConfig = useCallback(async () => {
    try {
      const values = form.getFieldsValue(true)
      const enabledPlatforms: DeployTarget[] = []
      if (githubEnabledRef.current) enabledPlatforms.push('github')
      if (cloudflareEnabledRef.current) enabledPlatforms.push('cloudflare-pages')
      if (edgeoneEnabledRef.current) enabledPlatforms.push('edgeone-pages')
      if (enabledPlatforms.length === 0) enabledPlatforms.push('github')
      const payload = { ...values, enabledPlatforms }
      await service.post('/hexopro/api/deploy/save-config', payload)
      message.success(t['deploy.config.saveSuccess'], 1.5)
    } catch {
      message.error(t['deploy.config.saveFailed'])
    }
  }, [form, t])

  const debouncedSave = useCallback(() => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      saveDebounceRef.current = null
      saveConfig()
    }, 1500)
  }, [saveConfig])

  const onFormValuesChange = useCallback(() => {
    debouncedSave()
  }, [debouncedSave])

  const fetchDeployConfig = async () => {
    try {
      setLoading(true)
      const res = await service.get('/hexopro/api/deploy/config')
      const data = res.data
      form.setFieldsValue(data)
      const enabled = data.enabledPlatforms || ['github']
      setGithubEnabled(enabled.includes('github'))
      setCloudflareEnabled(enabled.includes('cloudflare-pages'))
      setEdgeoneEnabled(enabled.includes('edgeone-pages'))
      await fetchDeployStatus()
    } catch {
      message.error(t['deploy.config.fetchFailed'])
    } finally {
      setLoading(false)
    }
  }

  const fetchDeployStatus = async () => {
    try {
      const statusRes = await service.get('/hexopro/api/deploy/status')
      statusRes.data.logs = (statusRes.data.logs || []).map((item: string) => t[item] || item)
      setDeployStatus(statusRes.data)
      return statusRes.data
    } catch {
      message.error(t['deploy.status.fetchFailed'])
      return null
    }
  }

  const executeDeploy = async (targets: DeployTarget[]) => {
    try {
      setDeployLoading(targets.length > 1 ? 'all' : targets[0])

      const fieldsToValidate: (string | string[])[] = []
      if (targets.includes('github')) {
        fieldsToValidate.push('repository', 'branch', 'message')
      }
      if (targets.includes('cloudflare-pages')) {
        fieldsToValidate.push(
          ['cloudflare', 'accountId'],
          ['cloudflare', 'projectName'],
          ['cloudflare', 'apiToken'],
        )
      }
      if (targets.includes('edgeone-pages')) {
        fieldsToValidate.push(
          ['edgeone', 'projectName'],
          ['edgeone', 'apiToken'],
        )
      }
      const valid = await form.validateFields(fieldsToValidate).catch(() => null)
      if (!valid) {
        setDeployLoading(null)
        return
      }
      const values = form.getFieldsValue(true)
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)

      const enabledPlatforms: DeployTarget[] = []
      if (githubEnabled) enabledPlatforms.push('github')
      if (cloudflareEnabled) enabledPlatforms.push('cloudflare-pages')
      if (edgeoneEnabled) enabledPlatforms.push('edgeone-pages')
      if (enabledPlatforms.length === 0) enabledPlatforms.push('github')

      const config = {
        ...values,
        enabledPlatforms,
      }

      const res = await service.post('/hexopro/api/deploy/execute', {
        skipGenerate: skipGenerateEnabled,
        deployTargets: targets,
        config,
      })

      if (res.data.isDeploying) {
        message.success(t['deploy.status.deploySuccess'])
        startPolling()
      } else {
        message.success(t['deploy.status.deployCompleted'])
      }
    } catch (error: any) {
      message.error(t['deploy.status.deployFailed'] + (error?.response?.data || error?.message || ''))
    } finally {
      setDeployLoading(null)
    }
  }

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      const status = await fetchDeployStatus()
      if (status && !status.isDeploying) {
        if (status.error) {
          message.error(t['deploy.status.deployFailed'] + status.error)
        } else if (status.stage === 'completed') {
          message.success(t['deploy.status.completedMessage'])
        }
        stopPolling()
      }
    }, 3000)
  }

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const getStageText = (stage: string) => {
    const stageMap: Record<string, string> = {
      idle: t['deploy.status.idle'],
      started: t['deploy.status.started'],
      cleaning: t['deploy.status.cleaning'],
      generating: t['deploy.status.generating'],
      deploying: t['deploy.status.deployingStage'],
      completed: t['deploy.status.completed'],
      failed: t['deploy.status.failed'],
    }
    return stageMap[stage] || stage
  }

  const getStageIcon = (stage: string) => {
    if (deployStatus.isDeploying) return <LoadingOutlined style={{ color: '#1890ff' }} />
    if (stage === 'completed') return <CheckCircleOutlined style={{ color: '#52c41a' }} />
    if (stage === 'failed') return <CloseCircleOutlined style={{ color: '#f5222d' }} />
    return <InfoCircleOutlined />
  }

  useEffect(() => {
    fetchDeployConfig()
    fetchDeployStatus().then((status) => {
      if (status?.isDeploying) startPolling()
    })
    return () => {
      stopPolling()
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetDeployStatus = async () => {
    try {
      setLoading(true)
      await service.post('/hexopro/api/deploy/reset-status')
      message.success(t['deploy.status.resetSuccess'])
      await fetchDeployStatus()
    } catch {
      message.error(t['deploy.status.resetFailed'])
    } finally {
      setLoading(false)
    }
  }

  const cleanupDeployDir = async () => {
    try {
      setLoading(true)
      const res = await service.post('/hexopro/api/deploy/cleanup')
      message.success(res.data.message)
      await fetchDeployStatus()
    } catch {
      message.error(t['deploy.cleanup.failed'] || '清理部署目录失败')
    } finally {
      setLoading(false)
    }
  }

  const enabledTargets: DeployTarget[] = []
  if (githubEnabled) enabledTargets.push('github')
  if (cloudflareEnabled) enabledTargets.push('cloudflare-pages')
  if (edgeoneEnabled) enabledTargets.push('edgeone-pages')
  const canDeployAll = enabledTargets.length > 1

  const renderPlatformBadge = (enabled: boolean) => (
    <Tag color={enabled ? 'success' : 'default'} style={{ marginLeft: 6, fontSize: 11, lineHeight: '18px' }}>
      {enabled ? t['settings.enabled'] : t['settings.disabled']}
    </Tag>
  )

  const renderGithubTab = () => (
    <div>
      <div className={styles.tabEnableRow}>
        <Space>
          <Text strong>{t['deploy.platform.enablePlatform']}</Text>
          <Switch
            size="small"
            checked={githubEnabled}
            onChange={(checked) => {
              setGithubEnabled(checked)
              setTimeout(() => debouncedSave(), 0)
            }}
          />
        </Space>
      </div>
      <Form.Item
        label={t['deploy.config.repository']}
        name="repository"
        rules={[{ required: true, message: t['deploy.config.repository'] + t['settings.usernameRequired'] }]}
        tooltip={t['deploy.config.repositoryTooltip']}
      >
        <Input placeholder={t['deploy.config.repositoryPlaceholder']} prefix={<GithubOutlined />} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.branch']}
        name="branch"
        rules={[{ required: true, message: t['deploy.config.branch'] + t['settings.usernameRequired'] }]}
      >
        <Input placeholder={t['deploy.config.branchPlaceholder']} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.message']}
        name="message"
        rules={[{ required: true, message: t['deploy.config.message'] + t['settings.usernameRequired'] }]}
      >
        <Input placeholder={t['deploy.config.messagePlaceholder']} />
      </Form.Item>
      <Form.Item label={t['deploy.config.token']} name="token" tooltip={t['deploy.config.tokenTooltip']}>
        <Input.Password placeholder={t['deploy.config.tokenPlaceholder']} />
      </Form.Item>
      <Alert
        message={t['deploy.config.alertTitle']}
        description={t['deploy.config.alertDesc']}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <div className={styles.settingItem}>
        <div className={styles.settingHeader}>
          <Text strong>{t['settings.skipGenerate']}</Text>
          <Switch
            checked={skipGenerateEnabled}
            onChange={onSkipGenerateChange}
            checkedChildren={t['settings.enabled']}
            unCheckedChildren={t['settings.disabled']}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t['settings.skipGenerateDescription']}
        </Text>
        <div className={styles.settingHint}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t['settings.skipGenerateHelp']}
          </Text>
        </div>
      </div>
      {githubEnabled && deployStatus.hasDeployGit && (
        <Button
          danger
          block
          style={{ marginBottom: 16 }}
          loading={loading}
          onClick={cleanupDeployDir}
          disabled={deployStatus.isDeploying}
        >
          {t['deploy.cleanup.button']}
        </Button>
      )}
      <Divider />
      <div className={styles.helpSection}>
        <Text strong style={{ fontSize: 13 }}>{t['deploy.help.how.github']}</Text>
        <div style={{ margin: '4px 0 0', paddingLeft: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step1']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step2']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step3']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.note']}</Text>
        </div>
      </div>
      <Divider />
      <Button
        type="primary"
        icon={<RocketOutlined />}
        size="large"
        block
        loading={deployLoading === 'github'}
        onClick={() => executeDeploy(['github'])}
        disabled={deployStatus.isDeploying || !githubEnabled}
      >
        {t['deploy.platform.deployTo']} {t['deploy.config.deployType.github']}
      </Button>
    </div>
  )

  const renderCloudflareTab = () => (
    <div>
      <div className={styles.tabEnableRow}>
        <Space>
          <Text strong>{t['deploy.platform.enablePlatform']}</Text>
          <Switch
            size="small"
            checked={cloudflareEnabled}
            onChange={(checked) => {
              setCloudflareEnabled(checked)
              setTimeout(() => debouncedSave(), 0)
            }}
          />
        </Space>
      </div>
      <Form.Item
        label={t['deploy.config.cloudflare.accountId']}
        name={['cloudflare', 'accountId']}
        rules={[{ required: true, message: t['deploy.config.cloudflare.accountId'] + t['settings.usernameRequired'] }]}
        tooltip={t['deploy.config.cloudflare.accountIdTooltip']}
      >
        <Input placeholder={t['deploy.config.cloudflare.accountIdPlaceholder']} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.cloudflare.projectName']}
        name={['cloudflare', 'projectName']}
        rules={[{ required: true, message: t['deploy.config.cloudflare.projectName'] + t['settings.usernameRequired'] }]}
        tooltip={t['deploy.config.cloudflare.projectNameTooltip']}
      >
        <Input placeholder={t['deploy.config.cloudflare.projectNamePlaceholder']} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.cloudflare.apiToken']}
        name={['cloudflare', 'apiToken']}
        rules={[{ required: true, message: t['deploy.config.cloudflare.apiToken'] + t['settings.usernameRequired'] }]}
        tooltip={t['deploy.config.cloudflare.apiTokenTooltip']}
      >
        <Input.Password placeholder={t['deploy.config.cloudflare.apiTokenPlaceholder']} />
      </Form.Item>
      <Alert
        message={t['deploy.config.alertTitle']}
        description={t['deploy.config.alertDesc.cloudflare']}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Divider />
      <div className={styles.helpSection}>
        <Text strong style={{ fontSize: 13 }}>{t['deploy.help.how.cloudflare']}</Text>
        <div style={{ margin: '4px 0 0', paddingLeft: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step1.cloudflare']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step2.cloudflare']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step3.cloudflare']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.note.cloudflare']}</Text>
        </div>
      </div>
      <Divider />
      <Button
        type="primary"
        icon={<RocketOutlined />}
        size="large"
        block
        loading={deployLoading === 'cloudflare-pages'}
        onClick={() => executeDeploy(['cloudflare-pages'])}
        disabled={deployStatus.isDeploying || !cloudflareEnabled}
      >
        {t['deploy.platform.deployTo']} {t['deploy.config.deployType.cloudflare']}
      </Button>
    </div>
  )

  const renderEdgeoneTab = () => (
    <div>
      <div className={styles.tabEnableRow}>
        <Space>
          <Text strong>{t['deploy.platform.enablePlatform']}</Text>
          <Switch
            size="small"
            checked={edgeoneEnabled}
            onChange={(checked) => {
              setEdgeoneEnabled(checked)
              setTimeout(() => debouncedSave(), 0)
            }}
          />
        </Space>
      </div>
      <Form.Item
        label={t['deploy.config.edgeone.projectName']}
        name={['edgeone', 'projectName']}
        rules={[{ required: true, message: t['deploy.config.edgeone.projectName'] + t['settings.usernameRequired'] }]}
        tooltip={t['deploy.config.edgeone.projectNameTooltip']}
      >
        <Input placeholder={t['deploy.config.edgeone.projectNamePlaceholder']} prefix={<CloudServerOutlined />} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.edgeone.apiToken']}
        name={['edgeone', 'apiToken']}
        rules={[{ required: true, message: t['deploy.config.edgeone.apiToken'] + t['settings.usernameRequired'] }]}
        tooltip={t['deploy.config.edgeone.apiTokenTooltip']}
      >
        <Input.Password placeholder={t['deploy.config.edgeone.apiTokenPlaceholder']} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.edgeone.env']}
        name={['edgeone', 'env']}
        tooltip={t['deploy.config.edgeone.envTooltip']}
      >
        <Select
          options={[
            { value: 'production', label: t['deploy.config.edgeone.envProduction'] },
            { value: 'preview', label: t['deploy.config.edgeone.envPreview'] },
          ]}
        />
      </Form.Item>
      <Alert
        message={t['deploy.config.alertTitle']}
        description={t['deploy.config.alertDesc.edgeone']}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Divider />
      <div className={styles.helpSection}>
        <Text strong style={{ fontSize: 13 }}>{t['deploy.help.how.edgeone']}</Text>
        <div style={{ margin: '4px 0 0', paddingLeft: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step1.edgeone']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step2.edgeone']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step3.edgeone']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.note.edgeone']}</Text>
        </div>
      </div>
      <Divider />
      <Button
        type="primary"
        icon={<RocketOutlined />}
        size="large"
        block
        loading={deployLoading === 'edgeone-pages'}
        onClick={() => executeDeploy(['edgeone-pages'])}
        disabled={deployStatus.isDeploying || !edgeoneEnabled}
      >
        {t['deploy.platform.deployTo']} {t['deploy.config.deployType.edgeone']}
      </Button>
    </div>
  )

  const tabItems = [
    {
      key: 'github',
      label: (
        <Space size={4}>
          <GithubOutlined />
          <span>{t['deploy.config.deployType.github']}</span>
          {renderPlatformBadge(githubEnabled)}
        </Space>
      ),
      children: renderGithubTab(),
    },
    {
      key: 'cloudflare-pages',
      label: (
        <Space size={4}>
          <CloudOutlined />
          <span>{t['deploy.config.deployType.cloudflare']}</span>
          {renderPlatformBadge(cloudflareEnabled)}
        </Space>
      ),
      children: renderCloudflareTab(),
    },
    {
      key: 'edgeone-pages',
      label: (
        <Space size={4}>
          <CloudServerOutlined />
          <span>{t['deploy.config.deployType.edgeone']}</span>
          {renderPlatformBadge(edgeoneEnabled)}
        </Space>
      ),
      children: renderEdgeoneTab(),
    },
  ]

  return (
    <div className={styles.deployContainer}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="部署网站"
        description="在这里将网站发布到 GitHub Pages、Cloudflare Pages 或 EdgeOne Pages。手机与电脑之间同步文章、主题和配置，请使用云同步。"
        action={<Button onClick={() => navigate('/sync')}>前往云同步</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card bodyStyle={{ paddingTop: 0 }}>
            <Spin spinning={loading}>
              <Form
                form={form}
                layout="vertical"
                onValuesChange={onFormValuesChange}
                initialValues={{
                  repository: '',
                  branch: 'main',
                  message: 'Site updated: {{ now("YYYY-MM-DD HH:mm:ss") }}',
                  token: '',
                  cloudflare: { accountId: '', projectName: '', apiToken: '' },
                  edgeone: { projectName: '', apiToken: '', env: 'production' },
                }}
              >
                <Tabs
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  items={tabItems}
                  className={styles.deployTabs}
                />
              </Form>
            </Spin>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <RocketOutlined />
                <span>{t['deploy.action.title']}</span>
              </Space>
            }
            extra={
              <Button type="link" size="small" icon={<ReloadOutlined />} onClick={resetDeployStatus} loading={loading}>
                {t['deploy.action.reset']}
              </Button>
            }
          >
            <Spin spinning={loading}>
              <div className={styles.deployStatus}>
                <Paragraph style={{ marginBottom: 8 }}>
                  <Text strong>{t['deploy.status.lastTime']}: </Text>
                  <Text>{deployStatus.lastDeployTime}</Text>
                </Paragraph>

                {githubEnabled && (
                  <Paragraph style={{ marginBottom: 8 }}>
                    <Text strong>{t['deploy.status.status']}: </Text>
                    {deployStatus.hasDeployGit ? (
                      <Badge status="success" text={t['deploy.status.inited']} />
                    ) : (
                      <Badge status="warning" text={t['deploy.status.notInited']} />
                    )}
                  </Paragraph>
                )}

                <Paragraph style={{ marginBottom: 8 }}>
                  <Text strong>{t['deploy.platform.enabledPlatforms']}: </Text>
                  {enabledTargets.length === 0 ? (
                    <Text type="secondary">-</Text>
                  ) : (
                    <Space size={4}>
                      {enabledTargets.includes('github') && <Tag icon={<GithubOutlined />} color="default">GitHub</Tag>}
                      {enabledTargets.includes('cloudflare-pages') && <Tag icon={<CloudOutlined />} color="processing">Cloudflare</Tag>}
                      {enabledTargets.includes('edgeone-pages') && <Tag icon={<CloudServerOutlined />} color="cyan">EdgeOne</Tag>}
                    </Space>
                  )}
                </Paragraph>

                {canDeployAll && (
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    size="middle"
                    block
                    loading={deployLoading === 'all'}
                    onClick={() => executeDeploy(enabledTargets)}
                    disabled={deployStatus.isDeploying}
                    style={{ marginBottom: 12 }}
                  >
                    {t['deploy.platform.deployAll']}
                  </Button>
                )}

                {deployStatus.isDeploying && (
                  <>
                    <Divider style={{ margin: '12px 0' }} />
                    <div className={styles.deployProgress}>
                      <Paragraph style={{ marginBottom: 4 }}>
                        <Text strong>{t['deploy.status.currentStage']}: </Text>
                        <Text>{getStageText(deployStatus.stage)}</Text>
                      </Paragraph>
                      <Progress
                        percent={deployStatus.progress}
                        status={deployStatus.error ? 'exception' : 'active'}
                        size="small"
                      />
                    </div>
                  </>
                )}
              </div>
            </Spin>
          </Card>

          {deployStatus.logs && deployStatus.logs.length > 0 && (
            <Card
              title={
                <Space>
                  <InfoCircleOutlined />
                  <span>{t['deploy.log.title']}</span>
                </Space>
              }
              style={{ marginTop: 16 }}
              bodyStyle={{ padding: '12px 16px' }}
            >
              <div className={styles.deployLogs}>
                <Timeline style={{ padding: '10px 0', maxHeight: '300px', overflowY: 'auto' }}>
                  {deployStatus.logs.map((log, index) => (
                    <Timeline.Item
                      key={index}
                      dot={index === deployStatus.logs.length - 1 ? getStageIcon(deployStatus.stage) : undefined}
                    >
                      <Text style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontSize: 12 }}>{log}</Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              </div>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  )
}

export default DeployPage
