import React, { useCallback, useEffect, useState, useRef } from 'react'
import {
  Form,
  Input,
  Button,
  message,
  Alert,
  Spin,
  Typography,
  Space,
  Progress,
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
  CloudSyncOutlined,
  CodeOutlined,
} from '@ant-design/icons'
import { service } from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import { useLocalStorageState } from '@/pages/settings/hooks/useLocalStorageState'
import styles from './style.module.less'
import { useNavigate } from 'react-router-dom'
import ManagementPage from '../content/components/ManagementPage'
import systemLocale from '../system/locale'

const { Text } = Typography

type DeployTarget = 'github' | 'cloudflare-pages' | 'edgeone-pages'

const DeployPage: React.FC = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [deployLoading, setDeployLoading] = useState<DeployTarget | 'all' | null>(null)
  const t = useLocale()
  const ui = useLocale(systemLocale)
  const [loadError, setLoadError] = useState(false)
  const [activeTab, setActiveTab] = useState<DeployTarget>('github')
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
      setLoadError(false)
      const res = await service.get('/hexopro/api/deploy/config')
      const data = res.data
      form.setFieldsValue(data)
      const enabled = data.enabledPlatforms || ['github']
      setGithubEnabled(enabled.includes('github'))
      setCloudflareEnabled(enabled.includes('cloudflare-pages'))
      setEdgeoneEnabled(enabled.includes('edgeone-pages'))
      await fetchDeployStatus()
    } catch {
      setLoadError(true)
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
            aria-label={t['deploy.platform.enablePlatform']}
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
        rules={[{ required: true, message: ui.requiredField.replace('{field}', t['deploy.config.repository']) }]}
        tooltip={t['deploy.config.repositoryTooltip']}
      >
        <Input placeholder={t['deploy.config.repositoryPlaceholder']} prefix={<GithubOutlined />} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.branch']}
        name="branch"
        rules={[{ required: true, message: ui.requiredField.replace('{field}', t['deploy.config.branch']) }]}
      >
        <Input placeholder={t['deploy.config.branchPlaceholder']} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.message']}
        name="message"
        rules={[{ required: true, message: ui.requiredField.replace('{field}', t['deploy.config.message']) }]}
      >
        <Input placeholder={t['deploy.config.messagePlaceholder']} />
      </Form.Item>
      <Form.Item label={t['deploy.config.token']} name="token" tooltip={t['deploy.config.tokenTooltip']}>
        <Input.Password placeholder={t['deploy.config.tokenPlaceholder']} />
      </Form.Item>
      <details className={styles.advancedOptions}><summary>{ui.advancedOptions}</summary>
      <div className={styles.settingItem}>
        <div className={styles.settingHeader}>
          <Text strong>{t['settings.skipGenerate']}</Text>
          <Switch
            aria-label={t['settings.skipGenerate']}
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
      </details>
      <details className={styles.helpSection}>
        <summary>{t['deploy.help.how.github']}</summary>
      <Alert
        message={t['deploy.config.alertTitle']}
        description={t['deploy.config.alertDesc']}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

        <div style={{ margin: '4px 0 0', paddingLeft: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step1']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step2']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step3']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.note']}</Text>
        </div>
      </details>
    </div>
  )

  const renderCloudflareTab = () => (
    <div>
      <div className={styles.tabEnableRow}>
        <Space>
          <Text strong>{t['deploy.platform.enablePlatform']}</Text>
          <Switch
            size="small"
            aria-label={t['deploy.platform.enablePlatform']}
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
        rules={[{ required: true, message: ui.requiredField.replace('{field}', t['deploy.config.cloudflare.accountId']) }]}
        tooltip={t['deploy.config.cloudflare.accountIdTooltip']}
      >
        <Input placeholder={t['deploy.config.cloudflare.accountIdPlaceholder']} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.cloudflare.projectName']}
        name={['cloudflare', 'projectName']}
        rules={[{ required: true, message: ui.requiredField.replace('{field}', t['deploy.config.cloudflare.projectName']) }]}
        tooltip={t['deploy.config.cloudflare.projectNameTooltip']}
      >
        <Input placeholder={t['deploy.config.cloudflare.projectNamePlaceholder']} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.cloudflare.apiToken']}
        name={['cloudflare', 'apiToken']}
        rules={[{ required: true, message: ui.requiredField.replace('{field}', t['deploy.config.cloudflare.apiToken']) }]}
        tooltip={t['deploy.config.cloudflare.apiTokenTooltip']}
      >
        <Input.Password placeholder={t['deploy.config.cloudflare.apiTokenPlaceholder']} />
      </Form.Item>
      <details className={styles.helpSection}>
        <summary>{t['deploy.help.how.cloudflare']}</summary>
      <Alert
        message={t['deploy.config.alertTitle']}
        description={t['deploy.config.alertDesc.cloudflare']}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

        <div style={{ margin: '4px 0 0', paddingLeft: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step1.cloudflare']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step2.cloudflare']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step3.cloudflare']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.note.cloudflare']}</Text>
        </div>
      </details>
    </div>
  )

  const renderEdgeoneTab = () => (
    <div>
      <div className={styles.tabEnableRow}>
        <Space>
          <Text strong>{t['deploy.platform.enablePlatform']}</Text>
          <Switch
            size="small"
            aria-label={t['deploy.platform.enablePlatform']}
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
        rules={[{ required: true, message: ui.requiredField.replace('{field}', t['deploy.config.edgeone.projectName']) }]}
        tooltip={t['deploy.config.edgeone.projectNameTooltip']}
      >
        <Input placeholder={t['deploy.config.edgeone.projectNamePlaceholder']} prefix={<CloudServerOutlined />} />
      </Form.Item>
      <Form.Item
        label={t['deploy.config.edgeone.apiToken']}
        name={['edgeone', 'apiToken']}
        rules={[{ required: true, message: ui.requiredField.replace('{field}', t['deploy.config.edgeone.apiToken']) }]}
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
      <details className={styles.helpSection}>
        <summary>{t['deploy.help.how.edgeone']}</summary>
      <Alert
        message={t['deploy.config.alertTitle']}
        description={t['deploy.config.alertDesc.edgeone']}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

        <div style={{ margin: '4px 0 0', paddingLeft: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step1.edgeone']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step2.edgeone']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.step3.edgeone']}</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t['deploy.help.note.edgeone']}</Text>
        </div>
      </details>
    </div>
  )

  const tabItems = [
    {
      key: 'github', forceRender: true,
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
      key: 'cloudflare-pages', forceRender: true,
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
      key: 'edgeone-pages', forceRender: true,
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
    <ManagementPage sectionTitle={ui.system} title={ui.deployTitle} description={ui.deployDescription}
      count={ui.activePlatforms.replace('{count}', String(enabledTargets.length))}
      actions={<><Button icon={<CloudSyncOutlined />} onClick={() => navigate('/sync')}>{ui.syncLink}</Button><Button type="primary" icon={<RocketOutlined />} loading={deployLoading === activeTab} onClick={() => executeDeploy([activeTab])} disabled={loading || loadError || deployStatus.isDeploying || Boolean(deployLoading) || !enabledTargets.includes(activeTab)}>{t['deploy.platform.deployTo']} {activeTab === 'github' ? 'GitHub Pages' : activeTab === 'cloudflare-pages' ? 'Cloudflare Pages' : 'EdgeOne Pages'}</Button></>}>
      {loadError && <Alert type="error" showIcon message={t['deploy.config.fetchFailed']} action={<Button onClick={fetchDeployConfig}>{ui.retry}</Button>} className={styles.loadError} />}
      <div className={styles.workspace}>
        <section className={styles.configuration}>
          <div className={styles.sectionHeading}><h2>{ui.deployConfig}</h2><span>{ui.autoSave}</span></div>
          <Spin spinning={loading}>
            <Form form={form} layout="vertical" onValuesChange={onFormValuesChange} disabled={loading || loadError || deployStatus.isDeploying || Boolean(deployLoading)}
              initialValues={{ repository: '', branch: 'main', message: 'Site updated: {{ now("YYYY-MM-DD HH:mm:ss") }}', token: '',
                cloudflare: { accountId: '', projectName: '', apiToken: '' }, edgeone: { projectName: '', apiToken: '', env: 'production' } }}>
              <Tabs activeKey={activeTab} onChange={key => setActiveTab(key as DeployTarget)} items={tabItems} className={styles.deployTabs} />
            </Form>
          </Spin>
        </section>
        <aside className={styles.activity}>
          <div className={styles.sectionHeading}><h2>{ui.deployActivity}</h2><Button type="text" size="small" icon={<ReloadOutlined />} onClick={resetDeployStatus} loading={loading} disabled={deployStatus.isDeploying || Boolean(deployLoading)}>{t['deploy.action.reset']}</Button></div>
          <div className={styles.statusPanel} aria-live="polite">
            <div className={styles.stage}><span className={styles.stageIcon} data-status={deployStatus.stage}>{getStageIcon(deployStatus.stage)}</span><div><span>{t['deploy.status.currentStage']}</span><h3>{getStageText(deployStatus.stage)}</h3></div></div>
            <dl className={styles.statusDetails}>
              <div><dt>{t['deploy.status.lastTime']}</dt><dd>{deployStatus.lastDeployTime || t['deploy.status.unknownTime']}</dd></div>
              {githubEnabled && <div><dt>{t['deploy.status.status']}</dt><dd><Badge status={deployStatus.hasDeployGit ? 'success' : 'default'} text={t[deployStatus.hasDeployGit ? 'deploy.status.inited' : 'deploy.status.notInited']} /></dd></div>}
              <div><dt>{t['deploy.platform.enabledPlatforms']}</dt><dd><Space wrap size={4}>
                {enabledTargets.includes('github') && <Tag icon={<GithubOutlined />}>GitHub</Tag>}
                {enabledTargets.includes('cloudflare-pages') && <Tag icon={<CloudOutlined />}>Cloudflare</Tag>}
                {enabledTargets.includes('edgeone-pages') && <Tag icon={<CloudServerOutlined />}>EdgeOne</Tag>}
                {!enabledTargets.length && '—'}
              </Space></dd></div>
            </dl>
            {deployStatus.isDeploying && <Progress percent={deployStatus.progress} status={deployStatus.error ? 'exception' : 'active'} size="small" />}
            {deployStatus.error && <Alert type="error" showIcon message={deployStatus.error} />}
            {canDeployAll && <Button type="primary" block icon={<ThunderboltOutlined />} loading={deployLoading === 'all'} onClick={() => executeDeploy(enabledTargets)} disabled={deployStatus.isDeploying || Boolean(deployLoading) || loadError}>{t['deploy.platform.deployAll']}</Button>}
          </div>
          <section className={styles.logPanel}>
            <div className={styles.logHeading}><CodeOutlined /><h3>{t['deploy.log.title']}</h3><span>{deployStatus.logs.length}</span></div>
            {deployStatus.logs.length > 0 ? <ol className={styles.deployLogs} aria-label={t['deploy.log.title']}>
              {deployStatus.logs.map((log, index) => <li key={index}><span>{String(index + 1).padStart(2, '0')}</span><code>{log}</code></li>)}
            </ol> : <div className={styles.emptyLogs}><RocketOutlined /><strong>{ui.noDeployLogs}</strong><p>{ui.noDeployLogsHint}</p></div>}
          </section>
        </aside>
      </div>
    </ManagementPage>
  )
}

export default DeployPage
