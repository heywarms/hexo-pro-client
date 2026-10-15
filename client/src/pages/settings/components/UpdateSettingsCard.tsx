import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Divider, Space, Tag, Typography, message } from 'antd'
import { CloudDownloadOutlined, InfoCircleOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons'
import useLocale from '../../../hooks/useLocale'

const { Text } = Typography

type UpdaterState = {
  status?: string
  currentVersion?: string
  availableVersion?: string | null
  progress?: number
  error?: string | null
  lastCheckedAt?: string | null
}

type ActionType = 'check' | 'download' | 'install' | null

const DEFAULT_UPDATER_STATE: UpdaterState = {
  status: 'idle',
  currentVersion: '',
  availableVersion: null,
  progress: 0,
  error: null,
  lastCheckedAt: null,
}

const RELEASE_URL = 'https://github.com/wuzheng228/hexo-pro/releases'

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
  const [updaterState, setUpdaterState] = useState<UpdaterState>(DEFAULT_UPDATER_STATE)
  const [actionLoading, setActionLoading] = useState<ActionType>(null)

  const updaterApi = useMemo(() => {
    const electronAPI = (window as any).electronAPI
    return electronAPI?.updater || null
  }, [])

  const currentVersion = updaterState.currentVersion || ((window as any).electronAPI?.getAppVersion?.() ?? '-')
  const status = updaterState.status || 'idle'
  const statusColor = getStatusColor(status)
  const statusText = getStatusText(status, t)
  const progressText =
    status === 'downloading' ? `${t['settings.update.progress'] || '下载进度'}: ${Number(updaterState.progress || 0).toFixed(1)}%` : null

  useEffect(() => {
    if (!updaterApi) {
      return
    }

    updaterApi
      .getState()
      .then((state: UpdaterState) => {
        if (state && typeof state === 'object') {
          setUpdaterState((prev) => ({ ...prev, ...state }))
        }
      })
      .catch((error: Error) => {
        setUpdaterState((prev) => ({ ...prev, status: 'error', error: error?.message || String(error) }))
      })

    const unsubscribe = updaterApi.onStatusChange?.((state: UpdaterState) => {
      if (state && typeof state === 'object') {
        setUpdaterState((prev) => ({ ...prev, ...state }))
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
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
    if (!checkTrigger || !updaterApi) {
      return
    }
    handleCheck()
  }, [checkTrigger, handleCheck, updaterApi])

  const canDownload = status === 'update-available' || status === 'downloading'
  const canInstall = status === 'downloaded' || status === 'installing'

  return (
    <Card>
      <Divider orientation="left">
        <InfoCircleOutlined /> {t['settings.helpTitle'] || '帮助与更新'}
      </Divider>

      {!updaterApi ? (
        <Alert
          showIcon
          type="warning"
          message={t['settings.update.notDesktop'] || '当前环境不支持桌面端自动更新'}
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
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
                {progressText ? <div>{progressText}</div> : null}
                {updaterState.error ? <div>{(t['settings.update.errorPrefix'] || '错误') + `: ${updaterState.error}`}</div> : null}
              </>
            }
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button icon={<ReloadOutlined />} loading={actionLoading === 'check'} onClick={handleCheck}>
              {t['settings.update.check'] || '检查更新'}
            </Button>
            <Button
              icon={<CloudDownloadOutlined />}
              type="primary"
              disabled={!canDownload}
              loading={actionLoading === 'download' || status === 'downloading'}
              onClick={handleDownload}
            >
              {t['settings.update.download'] || '下载更新'}
            </Button>
            <Button
              icon={<RocketOutlined />}
              danger
              disabled={!canInstall}
              loading={actionLoading === 'install' || status === 'installing'}
              onClick={handleInstall}
            >
              {t['settings.update.install'] || '重启安装'}
            </Button>
            <Button
              onClick={() => {
                const electronAPI = (window as any).electronAPI
                if (electronAPI?.openExternal) {
                  electronAPI.openExternal(RELEASE_URL)
                  return
                }
                window.open(RELEASE_URL, '_blank')
              }}
            >
              {t['settings.update.openRelease'] || '查看发布页'}
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text strong>{t['settings.update.lastCheckedAt'] || '最近检查'}</Text>
              <Text>{formatTime(updaterState.lastCheckedAt)}</Text>
            </div>
          </div>
        </Space>
      )}
    </Card>
  )
}

export default UpdateSettingsCard
