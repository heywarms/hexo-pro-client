import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, List, message, Modal, Segmented, Space, Spin, Tag } from 'antd'
import {
  SaveOutlined,
  CloseOutlined,
  CameraOutlined,
  HistoryOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import yaml from 'js-yaml'
import service from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import type { SchemaJson } from '../themeSchema'
import YamlEditor from '@/pages/content/yaml/components/YamlEditor'
import FormMode, { type FormModeRef } from './FormMode'
import styles from '../style.module.less'

interface ThemeConfigPanelProps {
  themeId?: string
  configType?: 'theme' | 'global'
  onClose?: () => void
}

interface ThemeConfigSnapshot {
  id: string
  themeId?: string
  createdAt: string
  source: string
  note?: string
  hash: string
  size: number
}

interface ConfigSaveResult {
  success?: boolean
  message?: string
  needRestart?: boolean
}

function isDesktopEnvironment(): boolean {
  return typeof window !== 'undefined' &&
    typeof (window as any).electronAPI === 'object' &&
    (window as any).electronAPI !== null
}

function formatYamlValidationError(error: unknown): string {
  const fallback = 'YAML 语法错误'
  if (!error || typeof error !== 'object') return fallback

  const yamlError = error as { message?: string; mark?: { line?: number; column?: number } }
  const baseMessage = yamlError.message || fallback
  const line = typeof yamlError.mark?.line === 'number' ? yamlError.mark.line + 1 : undefined
  const column = typeof yamlError.mark?.column === 'number' ? yamlError.mark.column + 1 : undefined

  if (line && column) {
    return `${baseMessage} (line ${line}, column ${column})`
  }
  return baseMessage
}

function extractRequestErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: string
      response?: {
        data?: {
          message?: string
          msg?: string
          details?: string
        }
      }
    }
    const messageFromResponse = maybeError.response?.data?.message || maybeError.response?.data?.msg
    if (messageFromResponse) {
      const details = maybeError.response?.data?.details
      return details ? `${messageFromResponse} (${details})` : messageFromResponse
    }
    if (maybeError.message) return maybeError.message
  }
  return fallback
}

const ThemeConfigPanel: React.FC<ThemeConfigPanelProps> = ({
  themeId,
  configType = 'theme',
  onClose,
}) => {
  const t = useLocale()
  const isGlobalConfig = configType === 'global'
  const configId = isGlobalConfig ? 'global' : themeId
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [schemaJson, setSchemaJson] = useState<SchemaJson | null>(null)
  const [activeTab, setActiveTab] = useState<'raw' | 'form'>(isGlobalConfig ? 'raw' : 'form')
  const [snapshots, setSnapshots] = useState<ThemeConfigSnapshot[]>([])
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [creatingSnapshot, setCreatingSnapshot] = useState(false)
  const [snapshotModalVisible, setSnapshotModalVisible] = useState(false)
  const [rollingBackSnapshotId, setRollingBackSnapshotId] = useState<string | null>(null)
  const formModeRef = useRef<FormModeRef>(null)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      if (isGlobalConfig) {
        const configRes = await service.get('/hexopro/api/site/config')
        setEditContent(configRes.data?.content ?? '')
        setSchemaJson(null)
      } else {
        if (!themeId) {
          message.error('缺少主题ID')
          return
        }
        const [configRes, schemaRes] = await Promise.all([
          service.get('/hexopro/api/theme/config', { params: { themeId } }),
          service.get('/hexopro/api/theme/schema', { params: { themeId } }),
        ])
        const content = configRes.data?.content ?? ''
        setEditContent(content)
        if (schemaRes.data?.hasSchema && schemaRes.data?.schema) {
          setSchemaJson(schemaRes.data.schema)
        } else {
          setSchemaJson(null)
        }
      }
    } catch (err) {
      message.error(t['theme.config.fetchFailed'] || '获取配置失败')
    } finally {
      setLoading(false)
    }
  }, [isGlobalConfig, themeId, t])

  const fetchSnapshots = useCallback(async (showError = true) => {
    setSnapshotLoading(true)
    try {
      const endpoint = isGlobalConfig
        ? '/hexopro/api/site/config/snapshots'
        : '/hexopro/api/theme/config/snapshots'
      const requestConfig = isGlobalConfig ? undefined : { params: { themeId } }
      const res = await service.get(endpoint, requestConfig)
      setSnapshots(res.data?.snapshots ?? [])
    } catch {
      if (showError) {
        message.error(t['theme.snapshot.fetchFailed'] || '获取快照失败')
      }
    } finally {
      setSnapshotLoading(false)
    }
  }, [isGlobalConfig, themeId, t])

  useEffect(() => {
    void fetchConfig()
    void fetchSnapshots(false)
  }, [fetchConfig, fetchSnapshots])

  const handleRestartIfNeeded = useCallback(async (result: ConfigSaveResult) => {
    if (!result?.needRestart) return

    if (isDesktopEnvironment()) {
      message.loading({
        content: t['theme.config.needRestart'] || '配置已更新，正在重启服务器...',
        key: 'config-restart',
        duration: 0,
      })
      try {
        await service.post('/hexopro/api/desktop/restart')
        message.success({
          content: t['theme.restart.success'] || '服务器重启成功',
          key: 'config-restart',
          duration: 2,
        })
      } catch {
        message.error({
          content: t['theme.restart.failed'] || '服务器重启失败',
          key: 'config-restart',
          duration: 2,
        })
      }
      return
    }

    Modal.info({
      title: t['theme.config.saveSuccess'] || '配置已保存',
      content: result.message || '配置已更新，请手动重启服务器后生效',
      okText: t['universal.confirm'] || '确定',
    })
  }, [t])

  const handleSave = useCallback(async (content?: string) => {
    setSaving(true)
    try {
      const toSave = content ?? editContent
      try {
        yaml.load(toSave)
      } catch (error) {
        message.error(formatYamlValidationError(error))
        return
      }

      const saveRes = isGlobalConfig
        ? await service.post('/hexopro/api/site/config/save', { content: toSave })
        : await service.post('/hexopro/api/theme/config/save', { themeId, content: toSave })
      const saveResult = (saveRes.data || {}) as ConfigSaveResult
      message.success(saveResult.message || t['theme.config.saveSuccess'] || '配置已保存')
      if (content) setEditContent(content)
      await fetchSnapshots(false)
      await handleRestartIfNeeded(saveResult)
    } catch (error) {
      message.error(extractRequestErrorMessage(error, t['theme.config.saveFailed'] || '保存配置失败'))
    } finally {
      setSaving(false)
    }
  }, [isGlobalConfig, themeId, editContent, fetchSnapshots, handleRestartIfNeeded, t])

  const formatSnapshotSource = useCallback((source: string) => {
    if (source === 'manual') return t['theme.snapshot.source.manual'] || '手动'
    if (source === 'auto-save') return t['theme.snapshot.source.autoSave'] || '自动保存前'
    if (source === 'rollback-backup') return t['theme.snapshot.source.rollbackBackup'] || '回滚前备份'
    return source
  }, [t])

  const handleCreateSnapshot = useCallback(async () => {
    setCreatingSnapshot(true)
    try {
      const endpoint = isGlobalConfig
        ? '/hexopro/api/site/config/snapshot/create'
        : '/hexopro/api/theme/config/snapshot/create'
      const payload = isGlobalConfig ? {} : { themeId }
      const res = await service.post(endpoint, payload)
      if (res.data?.skipped) {
        message.info(t['theme.snapshot.createSkipped'] || '当前配置与最近快照一致，已跳过')
      } else {
        message.success(t['theme.snapshot.createSuccess'] || '快照已创建')
      }
      await fetchSnapshots(false)
    } catch {
      message.error(t['theme.snapshot.createFailed'] || '创建快照失败')
    } finally {
      setCreatingSnapshot(false)
    }
  }, [isGlobalConfig, themeId, fetchSnapshots, t])

  const handleRollback = useCallback((snapshot: ThemeConfigSnapshot) => {
    Modal.confirm({
      title: t['theme.snapshot.rollbackConfirmTitle'] || '确认回滚',
      content:
        (t['theme.snapshot.rollbackConfirmDesc'] || '将恢复到此快照，是否继续？') +
        `\n#${snapshot.id.slice(0, 8)}`,
      okText: t['theme.snapshot.rollback'] || '回滚',
      cancelText: t['universal.cancel'] || '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setRollingBackSnapshotId(snapshot.id)
        try {
          const endpoint = isGlobalConfig
            ? '/hexopro/api/site/config/rollback'
            : '/hexopro/api/theme/config/rollback'
          const payload = isGlobalConfig
            ? { snapshotId: snapshot.id }
            : { themeId, snapshotId: snapshot.id }
          const rollbackRes = await service.post(endpoint, payload)
          message.success(t['theme.snapshot.rollbackSuccess'] || '回滚成功')
          await Promise.all([fetchConfig(), fetchSnapshots(false)])
          await handleRestartIfNeeded((rollbackRes.data || {}) as ConfigSaveResult)
        } catch {
          message.error(t['theme.snapshot.rollbackFailed'] || '回滚失败')
        } finally {
          setRollingBackSnapshotId(null)
        }
      },
    })
  }, [isGlobalConfig, fetchConfig, fetchSnapshots, handleRestartIfNeeded, t, themeId])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className={styles.drawerConfigPanel}>
      {/* 固定顶部操作栏 */}
      <div className={styles.drawerHeader}>
        <div className={styles.drawerHeaderMain}>
          <Segmented
            value={activeTab}
            onChange={(val) => setActiveTab((val as 'raw' | 'form') ?? 'raw')}
            options={[
              {
                label: t['theme.config.formMode'] || '表单模式',
                value: 'form',
              },
              {
                label: t['theme.config.rawMode'] || 'Raw 模式',
                value: 'raw',
              },
            ]}
            style={{ flex: 1 }}
          />
          <Space>
            <Button
              icon={<CameraOutlined />}
              loading={creatingSnapshot}
              onClick={() => void handleCreateSnapshot()}
            >
              {t['theme.snapshot.create'] || '创建快照'}
            </Button>
            <Button
              icon={<HistoryOutlined />}
              onClick={() => {
                setSnapshotModalVisible(true)
                void fetchSnapshots(false)
              }}
            >
              {t['theme.snapshot.manage'] || '快照管理'}
            </Button>
          </Space>
        </div>
      </div>

      {/* 内容区域 */}
      <div className={styles.drawerContent}>
        {activeTab === 'raw' ? (
          <div>
            <YamlEditor
              id={`theme-config-${configId || 'unknown'}`}
              initialValue={editContent}
              height="calc(100vh - 180px)"
              onChange={setEditContent}
            />
          </div>
        ) : (
          <FormMode
            ref={formModeRef}
            initialYaml={editContent}
            onSave={handleSave}
            saving={saving}
            onClose={onClose}
            schemaJson={schemaJson}
          />
        )}
      </div>

      {/* 固定底部操作栏 */}
      <div className={styles.drawerFooter}>
        <Space>
          <Button onClick={onClose} icon={<CloseOutlined />}>
            {t['universal.close'] || '关闭'}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={async () => {
              if (activeTab === 'form') {
                setSaving(true)
                try {
                  await formModeRef.current?.save()
                } finally {
                  setSaving(false)
                }
              } else {
                void handleSave()
              }
            }}
          >
            {t['universal.save'] || '保存'}
          </Button>
        </Space>
      </div>

      <Modal
        title={t['theme.snapshot.manage'] || '快照管理'}
        open={snapshotModalVisible}
        onCancel={() => setSnapshotModalVisible(false)}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Spin spinning={snapshotLoading}>
          <List
            className={styles.snapshotList}
            dataSource={snapshots}
            locale={{ emptyText: t['theme.snapshot.empty'] || '暂无快照' }}
            renderItem={(item) => (
              <List.Item
                key={item.id}
                actions={[
                  <Button
                    key="rollback"
                    danger
                    icon={<RollbackOutlined />}
                    loading={rollingBackSnapshotId === item.id}
                    onClick={() => handleRollback(item)}
                  >
                    {t['theme.snapshot.rollback'] || '回滚'}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={(
                    <Space size={8} wrap>
                      <Tag>{formatSnapshotSource(item.source)}</Tag>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </Space>
                  )}
                  description={(
                    <span className={styles.snapshotMeta}>
                      #{item.id} · {item.size} B
                      {item.note ? ` · ${item.note}` : ''}
                    </span>
                  )}
                />
              </List.Item>
            )}
          />
        </Spin>
      </Modal>

    </div>
  )
}

export default ThemeConfigPanel
