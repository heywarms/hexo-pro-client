import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Input, message, Modal, Radio, Spin, Tag, theme as antdTheme } from 'antd'
import { DownloadOutlined, SettingOutlined, AppstoreOutlined, SwapOutlined, CheckCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import service from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import ThemeConfigPanel from './components/ThemeConfigPanel'
import styles from './style.module.less'
import ManagementPage from '../content/components/ManagementPage'
import shared from '../content/components/ManagementPage/style.module.less'
import systemLocale from '../system/locale'

// 检查是否为桌面环境
function isDesktopEnvironment(): boolean {
  return typeof window !== 'undefined' &&
    typeof (window as any).electronAPI === 'object' &&
    (window as any).electronAPI !== null
}

interface BuiltinTheme {
  id: string
  name: string
  description: string
  author: string
  themeDir: string
}

interface ThemeStatus {
  installed: boolean
  isCurrent?: boolean
}

const ThemeMarketPage: React.FC = () => {
  const t = useLocale()
  const ui = useLocale(systemLocale)
  const { token } = antdTheme.useToken()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState(false)
  const [themes, setThemes] = useState<BuiltinTheme[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, ThemeStatus>>({})
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [configModal, setConfigModal] = useState<{
    visible: boolean
    configType: 'theme' | 'global'
    themeId: string
    title: string
  }>({ visible: false, configType: 'theme', themeId: '', title: '' })

  const fetchThemes = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await service.get('/hexopro/api/theme/list')
      setThemes(res.data || [])
    } catch (err) {
      setError(true)
    } finally { setLoading(false) }
  }, [])

  const fetchInstalledStatus = useCallback(async () => {
    if (themes.length === 0) return
    const map: Record<string, ThemeStatus> = {}
    await Promise.all(
      themes.map(async (theme) => {
        try {
          const res = await service.get('/hexopro/api/theme/installed', {
            params: { themeId: theme.id },
          })
          map[theme.id] = res.data || { installed: false }
        } catch {
          map[theme.id] = { installed: false }
        }
      })
    )
    setStatusMap(map)
  }, [themes])

  useEffect(() => { void fetchThemes() }, [fetchThemes])

  useEffect(() => {
    if (themes.length > 0) {
      void fetchInstalledStatus()
    }
  }, [themes, fetchInstalledStatus])

  const handleInstall = async (themeId: string) => {
    setInstalling(themeId)
    try {
      await service.post('/hexopro/api/theme/install', { themeId })
      message.success(t['theme.install.success'] || '主题安装完成')
      await fetchInstalledStatus()
    } catch {
      message.error(t['theme.install.failed'] || '安装失败')
    } finally {
      setInstalling(null)
    }
  }

  // 处理主题切换
  const handleSwitchTheme = async (themeId: string) => {
    setInstalling(themeId) // 使用 loading 状态
    try {
      const res = await service.post('/hexopro/api/theme/switch', { themeId })
      const data = res.data

      if (data?.success) {
        message.success(t['theme.switch.success'] || '主题切换成功')

        // 如果需要重启
        if (data?.needRestart) {
          if (isDesktopEnvironment()) {
            // 桌面端：显示重启中提示，然后调用重启 API
            message.loading({
              content: t['theme.switch.needRestart'] || '主题已切换，正在重启服务器...',
              key: 'theme-restart',
              duration: 0,
            })

            try {
              // 调用桌面端重启 API
              await service.post('/hexopro/api/desktop/restart')
              message.success({
                content: t['theme.restart.success'] || '服务器重启成功',
                key: 'theme-restart',
                duration: 2,
              })
              // 刷新状态
              await fetchInstalledStatus()
            } catch (restartError) {
              message.error({
                content: t['theme.restart.failed'] || '服务器重启失败',
                key: 'theme-restart',
                duration: 2,
              })
            }
          } else {
            // 插件端：提示用户手动重启
            Modal.info({
              title: t['theme.switch.success'] || '主题切换成功',
              content: t['theme.switch.needRestartManual'] || '主题已切换，请手动重启服务器以生效',
              okText: t['universal.confirm'] || '确定',
              onOk: () => {
                // 刷新状态
                fetchInstalledStatus()
              },
            })
          }
        } else {
          // 不需要重启，直接刷新状态
          await fetchInstalledStatus()
        }
      } else {
        message.error(data?.message || t['theme.switch.failed'] || '切换失败')
      }
    } catch (error) {
      message.error(t['theme.switch.failed'] || '切换失败')
    } finally {
      setInstalling(null)
    }
  }

  const openConfig = (theme: BuiltinTheme) => {
    setConfigModal({
      visible: true,
      configType: 'theme',
      themeId: theme.id,
      title: theme.name,
    })
  }

  const openGlobalConfig = () => {
    setConfigModal({
      visible: true,
      configType: 'global',
      themeId: '',
      title: ui.globalConfig,
    })
  }

  const closeConfig = () => {
    setConfigModal({
      visible: false,
      configType: 'theme',
      themeId: '',
      title: '',
    })
  }

  const currentTheme = themes.find(theme => statusMap[theme.id]?.isCurrent)
  const filteredThemes = themes.filter(theme => (filter !== 'installed' || statusMap[theme.id]?.installed) &&
    `${theme.name} ${theme.author} ${theme.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const installedCount = themes.filter(theme => statusMap[theme.id]?.installed).length

  return (
    <ManagementPage sectionTitle={ui.system} title={ui.themeTitle} description={ui.themeDescription}
      count={ui.themeCount.replace('{count}', String(themes.length))}
      actions={<><Button icon={<ReloadOutlined />} onClick={fetchThemes} loading={loading} disabled={Boolean(installing)}>{ui.refresh}</Button><Button icon={<SettingOutlined />} onClick={openGlobalConfig}>{ui.globalConfig}</Button></>}>
      {currentTheme && <div className={styles.currentTheme}>
        <span className={styles.currentIcon}><AppstoreOutlined /></span>
        <div className={styles.currentInfo}><span><CheckCircleOutlined /> {ui.currentTheme}</span><h2>{currentTheme.name}</h2><p>{ui.currentThemeHint}</p></div>
        <Button type="primary" icon={<SettingOutlined />} onClick={() => openConfig(currentTheme)}>{t['theme.config']}</Button>
      </div>}
      <div className={shared.toolbar}>
        <Radio.Group className={styles.filters} value={filter} onChange={event => setFilter(event.target.value)} optionType="button" buttonStyle="solid"
          options={[{label: `${ui.allThemes} ${themes.length}`,value:'all'},{label:`${ui.installedThemes} ${installedCount}`,value:'installed'}]} />
        <Input className={shared.search} value={query} allowClear prefix={<SearchOutlined />} placeholder={ui.searchThemes} aria-label={ui.searchThemes} onChange={event => setQuery(event.target.value)} />
      </div>
      {error ? <Alert type="error" showIcon message={t['theme.list.fetchFailed']} action={<Button onClick={fetchThemes}>{ui.retry}</Button>} /> : <Spin spinning={loading}>
        <div className={styles.themeGrid}>
          {filteredThemes.map(theme => {
            const status = statusMap[theme.id]
            const isInstalling = installing === theme.id
            return <article key={theme.id} className={styles.themeCard} data-current={Boolean(status?.isCurrent)}>
              <div className={styles.themeInfo}>
                <div className={styles.themeName}><h3>{theme.name}</h3><Tag bordered={false} color={status?.isCurrent ? 'blue' : 'default'}>{status?.isCurrent ? ui.currentTheme : status?.installed ? ui.installed : ui.available}</Tag></div>
                <p className={styles.themeDesc}>{theme.description}</p>
                <div className={styles.themeAuthor}>{t['theme.author']}: {theme.author}</div>
                <div className={styles.themeActions}>
                  {!status?.installed ? <Button type="primary" icon={<DownloadOutlined />} loading={isInstalling} disabled={Boolean(installing) || !status} onClick={() => handleInstall(theme.id)}>{t['theme.install']}</Button> : <>
                    {status.isCurrent ? <Button disabled icon={<CheckCircleOutlined />}>{t['theme.current']}</Button> : <Button icon={<SwapOutlined />} loading={isInstalling} disabled={Boolean(installing)} onClick={() => handleSwitchTheme(theme.id)}>{t['theme.switch']}</Button>}
                    <Button icon={<SettingOutlined />} onClick={() => openConfig(theme)} disabled={Boolean(installing)}>{t['theme.config']}</Button>
                  </>}
                </div>
              </div>
            </article>
          })}
        </div>
        {!loading && !filteredThemes.length && <div className={shared.empty}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query || filter !== 'all' ? ui.noMatch : ui.noThemes}>
          {(query || filter !== 'all') && <Button onClick={() => { setQuery(''); setFilter('all') }}>{ui.clearSearch}</Button>}
        </Empty></div>}
      </Spin>}

      <Drawer
        title={configModal.configType === 'global'
          ? `${ui.globalConfig} · _config.yml`
          : `${t['theme.config'] || '配置'} - ${configModal.title}`}
        placement="right"
        onClose={closeConfig}
        open={configModal.visible}
        width="min(760px, 100vw)"
        rootStyle={{ '--theme-surface': token.colorFillAlter, '--theme-line': token.colorBorderSecondary, '--theme-muted': token.colorTextSecondary } as React.CSSProperties}
        destroyOnClose
        bodyStyle={{ padding: 0 }}
      >
        {configModal.visible && (
          <ThemeConfigPanel
            themeId={configModal.themeId}
            configType={configModal.configType}
            onClose={closeConfig}
          />
        )}
      </Drawer>
    </ManagementPage>
  )
}

export default ThemeMarketPage
