import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Divider, Progress, Space, Switch, Tag, Typography, message } from 'antd'
import { CloudDownloadOutlined, InfoCircleOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons'
import useLocale from '../../../hooks/useLocale'
import { DESKTOP_RELEASE_URL, DesktopUpdaterState, getDesktopUpdater, subscribeToUpdater } from '../../../utils/desktopUpdater'
import updateLocale from '../locale/update'

const { Text } = Typography

type ActionType = 'check' | 'download' | 'install' | 'preference' | null

const DEFAULT_UPDATER_STATE: DesktopUpdaterState = {
  status: 'idle',
  currentVersion: '',
  availableVersion: null,
  progress: 0,
  error: null,
  lastCheckedAt: null,
}

const getStatusText = (status: string, t: Record<string, string>) => {
  const statusMap: Record<string, string> = {
    idle: t['settings.update.status.idle'] || '待检查',
    checking: t['settings.update.status.checking'] || '正在检查',
    'update-available': t['settings.update.status.updateAvailable'] || '发现新版本',
    'up-to-date': t['settings.update.status.upToDate'] || '已是最新',
    downloading: t['settings.update.status.downloading'] || '下载中',
    downloaded: t['settings.update.status.downloaded'] || '下载完成',
    installing: t['settings.update.status.installing'] || '安装中',
    error: t['settings.update.status.error'] || '更新失败',
    disabled: t['settings.update.status.disabled'] || '不可用',
  }
  return statusMap[status] || status
}

const getStatusColor = (status: string) => {
  if (status === 'error') return 'error'
  if (status === 'downloaded' || status === 'up-to-date') return 'success'
  if (status === 'update-available' || status === 'checking' || status === 'downloading' || status === 'installing') return 'processing'
  if (status === 'disabled') return 'warning'
  return 'default'
}

const formatTime = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

type UpdateSettingsCardProps = {
  checkTrigger?: number
}

const UpdateSettingsCard: React.FC<UpdateSettingsCardProps> = ({ checkTrigger = 0 }) => {
  const t = useLocale()
  const ui = useLocale(updateLocale)
  const [updaterState, setUpdaterState] = useState<DesktopUpdaterState>(DEFAULT_UPDATER_STATE)
  const [actionLoading, setActionLoading] = useState<ActionType>(null)
  const [ready, setReady] = useState(false)
  const lastCheckTrigger = useRef(0)

  const updaterApi = useMemo(getDesktopUpdater, [])

  const currentVersion = updaterState.currentVersion || ((window as any).electronAPI?.getAppVersion?.() ?? '-')
  const status = updaterState.status || 'idle'
  const statusColor = getStatusColor(status)
  const statusText = getStatusText(status, t)
  const busy = Boolean(actionLoading) || ['checking', 'downloading', 'installing'].includes(status)
  const supported = ready && updaterState.supported !== false && status !== 'disabled'

  useEffect(() => {
    if (!updaterApi) {
      return
    }

    return subscribeToUpdater(updaterApi, state => {
      setUpdaterState(state)
      setReady(true)
    }, error => {
      setUpdaterState(prev => ({ ...prev, status: 'error', error: error.message }))
      setReady(true)
    })
  }, [updaterApi])

  const handleCheck = useCallback(async () => {
    if (!updaterApi) return
    try {
      setActionLoading('check')
      await updaterApi.checkForUpdates()
    } catch (error: any) {
      message.error(error?.message || t['settings.update.checkFailed'] || '检查更新失败')
    } finally {
      setActionLoading(null)
    }
  }, [t, updaterApi])

  const handleDownload = useCallback(async () => {
    if (!updaterApi) return
    try {
      setActionLoading('download')
      await updaterApi.downloadUpdate()
    } catch (error: any) {
      message.error(error?.message || t['settings.update.downloadFailed'] || '下载更新失败')
    } finally {
      setActionLoading(null)
    }
  }, [t, updaterApi])

  const handleInstall = useCallback(async () => {
    if (!updaterApi) return
    try {
      setActionLoading('install')
      await updaterApi.installUpdate()
    } catch (error: any) {
      message.error(error?.message || t['settings.update.installFailed'] || '安装更新失败')
    } finally {
      setActionLoading(null)
    }
  }, [t, updaterApi])

  useEffect(() => {
    if (!checkTrigger || !updaterApi || checkTrigger === lastCheckTrigger.current) {
      return
    }
    lastCheckTrigger.current = checkTrigger
    handleCheck()
  }, [checkTrigger, handleCheck, updaterApi])

  const canDownload = supported && !busy && (status === 'update-available' || (status === 'error' && updaterState.errorStage === 'download'))
  const canInstall = supported && !busy && status === 'downloaded'

  const handleAutoDownload = async (enabled: boolean) => {
    try {
      setActionLoading('preference')
      await updaterApi?.setAutoDownload?.(enabled)
    } catch {
      message.error(ui.saveFailed)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Card>
      <Divider orientation="left">
        <InfoCircleOutlined aria-hidden="true" /> {t['settings.helpTitle'] || '帮助与更新'}
      </Divider>

      {!updaterApi ? (
        <Alert
          showIcon
          type="warning"
          message={t['settings.update.notDesktop'] || '当前环境不支持桌面端自动更新'}
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {updaterApi.setAutoDownload && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, justifyContent: 'space-between' }}>
              <div>
                <Text strong id="auto-download-label">{ui.autoDownload}</Text>
                <div><Text type="secondary">{ui.autoDownloadHint}</Text></div>
              </div>
              <Switch
                aria-labelledby="auto-download-label"
                style={{ flexShrink: 0, marginTop: 2 }}
                checked={updaterState.autoDownload === true}
                disabled={!supported || status === 'installing'}
                loading={actionLoading === 'preference'}
                onChange={handleAutoDownload}
              />
            </div>
          )}
          <Alert
            showIcon
            type={status === 'error' ? 'error' : status === 'downloaded' || status === 'up-to-date' ? 'success' : 'info'}
            message={
              <Space size={8}>
                <span>{t['settings.update.status'] || '更新状态'}:</span>
                <Tag color={statusColor}>{statusText}</Tag>
              </Space>
            }
            description={
              <>
                {status === 'disabled' && updaterState.disabledReason ? <div>{ui[updaterState.disabledReason]}</div> : null}
                {status === 'downloaded' ? <div>{ui.ready}</div> : null}
                {updaterState.error ? <div style={{ overflowWrap: 'anywhere' }}>{(t['settings.update.errorPrefix'] || '错误') + `: ${updaterState.error}`}</div> : null}
              </>
            }
          />

          {status === 'downloading' && (
            <Progress percent={Number(updaterState.progress.toFixed(1))} aria-label={t['settings.update.progress']} />
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button icon={<ReloadOutlined aria-hidden="true" />} disabled={!supported || busy || status === 'downloaded'} loading={actionLoading === 'check' || status === 'checking'} onClick={handleCheck}>
              {t['settings.update.check'] || '检查更新'}
            </Button>
            <Button
              icon={<CloudDownloadOutlined aria-hidden="true" />}
              type="primary"
              disabled={!canDownload}
              loading={actionLoading === 'download' || status === 'downloading'}
              onClick={handleDownload}
            >
              {updaterState.errorStage === 'download' ? ui.retryDownload : t['settings.update.download'] || '下载更新'}
            </Button>
            <Button
              icon={<RocketOutlined aria-hidden="true" />}
              danger
              disabled={!canInstall}
              loading={actionLoading === 'install' || status === 'installing'}
              onClick={handleInstall}
            >
              {t['settings.update.install'] || '重启安装'}
            </Button>
          </div>

          <div style={{ padding: '12px 16px', backgroundColor: 'var(--manage-surface)', borderRadius: '6px', border: '1px solid var(--manage-line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text strong>{t['settings.update.currentVersion'] || '当前版本'}</Text>
              <Text>{currentVersion}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text strong>{t['settings.update.availableVersion'] || '可用版本'}</Text>
              <Text>{updaterState.availableVersion || '-'}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text strong>{ui.channel}</Text>
              <Text>{!updaterState.channel ? '-' : updaterState.channel === 'stable' ? ui.stable : `${ui.prerelease} (${updaterState.channel})`}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text strong>{t['settings.update.lastCheckedAt'] || '最近检查'}</Text>
              <Text>{formatTime(updaterState.lastCheckedAt)}</Text>
            </div>
          </div>
        </Space>
      )}
      <Button style={{ marginTop: 12 }} onClick={() => {
        const electronAPI = window.electronAPI
        if (electronAPI?.openExternal) {
          electronAPI.openExternal(DESKTOP_RELEASE_URL).catch((error: Error) => message.error(error.message))
        } else {
          window.open(DESKTOP_RELEASE_URL, '_blank', 'noopener,noreferrer')
        }
      }}>
        {t['settings.update.openRelease'] || '查看发布页'}
      </Button>
    </Card>
  )
}

export default UpdateSettingsCard
