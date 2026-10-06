import React, { useCallback, useContext, useEffect } from 'react'
import { Spin, Tabs, message } from 'antd'
import { ApiOutlined, CloudOutlined, CloudSyncOutlined, EditOutlined, LinkOutlined, PictureOutlined, QuestionCircleOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import styles from './style/index.module.less'
import useLocale from '../../hooks/useLocale'
import { GlobalContext } from '@/context'
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
  const { theme } = useContext(GlobalContext)
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

  const { isFirstUse, loading, error } = useFirstUse()

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

  return (
    <div className={styles.container} data-theme={theme}>
      <Spin spinning={loading}>
        {isFirstUse == null ? null : isFirstUse ? (
          <AccountSettingsCard isFirstUse showWelcomeAlert onSkipSettings={skipSettings} />
        ) : (
          <Tabs
            className={styles.settingsTabs}
            activeKey={activeTab}
            onChange={onTabChange}
            animated={{ inkBar: false, tabPane: false }}
            items={[
              {
                key: 'account',
                label: (
                  <span className={styles.tabLabel}>
                    <UserOutlined className={styles.tabIcon} />
                    {t['settings.title']}
                  </span>
                ),
                children: <AccountSettingsCard isFirstUse={false} showTitle={false} showWelcomeAlert={false} onSkipSettings={skipSettings} />,
              },
              {
                key: 'link',
                label: (
                  <span className={styles.tabLabel}>
                    <LinkOutlined className={styles.tabIcon} />
                    {t['settings.linkRedirectTitle']}
                  </span>
                ),
                children: <LinkRedirectSettingsCard />,
              },
              {
                key: 'editor',
                label: (
                  <span className={styles.tabLabel}>
                    <EditOutlined className={styles.tabIcon} />
                    {t['settings.editorTitle']}
                  </span>
                ),
                children: <EditorSettingsCard />,
              },
              {
                key: 'display',
                label: (
                  <span className={styles.tabLabel}>
                    <PictureOutlined className={styles.tabIcon} />
                    {t['settings.displayTitle']}
                  </span>
                ),
                children: <DisplaySettingsCard />,
              },
              {
                key: 'storage',
                label: (
                  <span className={styles.tabLabel}>
                    <CloudOutlined className={styles.tabIcon} />
                    {t['settings.storageTitle'] || '图床设置'}
                  </span>
                ),
                children: <StorageSettingsCard />,
              },
              {
                key: 'sync',
                label: (
                  <span className={styles.tabLabel}>
                    <CloudSyncOutlined className={styles.tabIcon} />
                    GitHub 云同步
                  </span>
                ),
                children: <GitHubSyncSettingsCard />,
              },
              {
                key: 'ai',
                label: (
                  <span className={styles.tabLabel}>
                    <ThunderboltOutlined className={styles.tabIcon} />
                    {t['ai.config']}
                  </span>
                ),
                children: <AISettingsCard />,
              },
              {
                key: 'mcp',
                label: (
                  <span className={styles.tabLabel}>
                    <ApiOutlined className={styles.tabIcon} />
                    MCP Server
                  </span>
                ),
                children: <MCPSettingsCard />,
              },
              {
                key: 'help',
                label: (
                  <span className={styles.tabLabel}>
                    <QuestionCircleOutlined className={styles.tabIcon} />
                    {t['settings.helpTitle'] || '帮助与更新'}
                  </span>
                ),
                children: <UpdateSettingsCard checkTrigger={checkTrigger} />,
              },
            ]}
          />
        )}
      </Spin>
    </div>
  )
}

export default SettingsPage
