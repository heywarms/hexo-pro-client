import React, { useCallback, useEffect } from 'react'
import { Alert, Button, Spin, Tabs, message } from 'antd'
import { ApiOutlined, CloudOutlined, CloudSyncOutlined, EditOutlined, LinkOutlined, PictureOutlined, QuestionCircleOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import styles from './style/index.module.less'
import useLocale from '../../hooks/useLocale'
import useDeviceDetect from '@/hooks/useDeviceDetect'
import ManagementPage from '../content/components/ManagementPage'
import systemLocale from '../system/locale'
import { useFirstUse } from './hooks/useFirstUse'
import AccountSettingsCard from './components/AccountSettingsCard'
import LinkRedirectSettingsCard from './components/LinkRedirectSettingsCard'
import EditorSettingsCard from './components/EditorSettingsCard'
import DisplaySettingsCard from './components/DisplaySettingsCard'
import AISettingsCard from './components/AISettingsCard'
import StorageSettingsCard from './components/StorageSettingsCard'
import UpdateSettingsCard from './components/UpdateSettingsCard'
import MCPSettingsCard from './components/MCPSettingsCard'
import GitHubSyncSettingsCard from './components/GitHubSyncSettingsCard'

const SettingsPage: React.FC = () => {
  const t = useLocale()
  const ui = useLocale(systemLocale)
  const { isMobile } = useDeviceDetect()
  const [searchParams, setSearchParams] = useSearchParams()
  const [checkTrigger, setCheckTrigger] = React.useState(0)
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam && ['account', 'link', 'editor', 'display', 'storage', 'sync', 'ai', 'mcp', 'help'].includes(tabParam) ? tabParam : 'account'
  // 跳过设置直接进入
  const skipSettings = useCallback(() => {
    // 设置一个标记，表示用户选择了跳过设置
    localStorage.setItem('hexoProSkipSettings', 'true')
    message.success(t['settings.skipSetupMessage'])
    window.location.href = '/pro'
  }, [t])

  const { isFirstUse, loading, error, refresh } = useFirstUse()

  useEffect(() => {
    if (!error) return
    message.error(t['settings.checkSystemStatusFailed'])
  }, [error, t])

  useEffect(() => {
    const action = searchParams.get('action')
    if (activeTab !== 'help' || action !== 'check-update') return

    setCheckTrigger((value) => value + 1)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('action')
    setSearchParams(nextParams, { replace: true })
  }, [activeTab, searchParams, setSearchParams])

  const onTabChange = useCallback(
    (key: string) => {
      const nextParams = new URLSearchParams(searchParams)
      if (key === 'account') {
        nextParams.delete('tab')
      } else {
        nextParams.set('tab', key)
      }
      nextParams.delete('action')
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const sections = [
    { key: 'account', label: ui.accountTitle, icon: <UserOutlined />, description: ui.accountDescription, content: <AccountSettingsCard isFirstUse={false} showTitle={false} showWelcomeAlert={false} onSkipSettings={skipSettings} /> },
    { key: 'link', label: t['settings.linkRedirectTitle'], icon: <LinkOutlined />, description: ui.linkDescription, content: <LinkRedirectSettingsCard /> },
    { key: 'editor', label: t['settings.editorTitle'], icon: <EditOutlined />, description: ui.editorDescription, content: <EditorSettingsCard /> },
    { key: 'display', label: t['settings.displayTitle'], icon: <PictureOutlined />, description: ui.displayDescription, content: <DisplaySettingsCard /> },
    { key: 'storage', label: t['settings.storageTitle'], icon: <CloudOutlined />, description: ui.storageDescription, content: <StorageSettingsCard /> },
    { key: 'sync', label: 'GitHub 云同步', icon: <CloudSyncOutlined />, description: ui.syncSettingsDescription, content: <GitHubSyncSettingsCard /> },
    { key: 'ai', label: t['ai.config'], icon: <ThunderboltOutlined />, description: ui.aiDescription, content: <AISettingsCard /> },
    { key: 'mcp', label: 'MCP Server', icon: <ApiOutlined />, description: ui.mcpDescription, content: <MCPSettingsCard /> },
    { key: 'help', label: t['settings.helpTitle'], icon: <QuestionCircleOutlined />, description: ui.helpDescription, content: <UpdateSettingsCard checkTrigger={checkTrigger} /> },
  ]

  return (
    <ManagementPage sectionTitle={ui.system} title={ui.settingsTitle} description={ui.settingsDescription} className={styles.container}>
      <Spin spinning={loading}>
        {error ? <Alert type="error" showIcon message={t['settings.checkSystemStatusFailed']} action={<Button onClick={refresh}>{ui.retry}</Button>} /> : isFirstUse == null ? null : isFirstUse ? (
          <div className={styles.firstUse}><AccountSettingsCard isFirstUse showWelcomeAlert onSkipSettings={skipSettings} /></div>
        ) : (
          <Tabs className={styles.settingsTabs} activeKey={activeTab} onChange={onTabChange} tabPosition={isMobile ? 'top' : 'left'}
            animated={{ inkBar: false, tabPane: false }} aria-label={ui.settingsNavigation}
            items={sections.map(section => ({key: section.key,
              label: <span className={styles.tabLabel}>{section.icon}{section.label}</span>,
              children: <section className={styles.sectionContent}><div className={styles.sectionHeading}><h2>{section.label}</h2><p>{section.description}</p></div>{section.content}</section>,
            }))} />
        )}
      </Spin>
    </ManagementPage>
  )
}

export default SettingsPage
