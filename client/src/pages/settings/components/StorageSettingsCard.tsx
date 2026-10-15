import React, { useCallback, useEffect, useState } from 'react'
import { Card, Divider, Input, Select, Typography, message } from 'antd'
import { CloudOutlined } from '@ant-design/icons'
import useLocale from '../../../hooks/useLocale'
import service from '@/utils/api'

const { Option } = Select
const { Text } = Typography

type StorageType = 'local' | 'aliyun' | 'qiniu' | 'tencent'

interface AliyunConfig {
  region: string
  bucket: string
  accessKeyId: string
  accessKeySecret: string
  domain: string
}

interface QiniuConfig {
  region: string
  bucket: string
  accessKey: string
  secretKey: string
  domain: string
}

interface TencentConfig {
  region: string
  bucket: string
  secretId: string
  secretKey: string
  domain: string
}

interface StoragePayload {
  storageType: StorageType
  customPath: string
  aliyunConfig: AliyunConfig
  qiniuConfig: QiniuConfig
  tencentConfig: TencentConfig
}

const defaultAliyunConfig: AliyunConfig = {
  region: '',
  bucket: '',
  accessKeyId: '',
  accessKeySecret: '',
  domain: '',
}

const defaultQiniuConfig: QiniuConfig = {
  region: '',
  bucket: '',
  accessKey: '',
  secretKey: '',
  domain: '',
}

const defaultTencentConfig: TencentConfig = {
  region: '',
  bucket: '',
  secretId: '',
  secretKey: '',
  domain: '',
}

const normalizeStorageType = (value: string): StorageType => {
  if (value === 'aliyun' || value === 'qiniu' || value === 'tencent') return value
  return 'local'
}

const StorageSettingsCard: React.FC = () => {
  const t = useLocale()
  const [loading, setLoading] = useState(false)
  const [storageType, setStorageType] = useState<StorageType>('local')
  const [persistedStorageType, setPersistedStorageType] = useState<StorageType>('local')
  const [customPath, setCustomPath] = useState('images')
  const [aliyunConfig, setAliyunConfig] = useState<AliyunConfig>(defaultAliyunConfig)
  const [qiniuConfig, setQiniuConfig] = useState<QiniuConfig>(defaultQiniuConfig)
  const [tencentConfig, setTencentConfig] = useState<TencentConfig>(defaultTencentConfig)

  const isAliyunConfigValid = (cfg: AliyunConfig) => {
    if (!cfg.bucket) return false
    if (cfg.domain) return true
    return Boolean(cfg.region && cfg.accessKeyId && cfg.accessKeySecret)
  }

  const isQiniuConfigValid = (cfg: QiniuConfig) => {
    return Boolean(cfg.bucket && cfg.domain && cfg.accessKey && cfg.secretKey)
  }

  const isTencentConfigValid = (cfg: TencentConfig) => {
    if (!cfg.bucket) return false
    if (cfg.domain) return true
    return Boolean(cfg.region && cfg.secretId && cfg.secretKey)
  }

  const fetchStorageConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await service.get('/hexopro/api/images/config/get')
      const cfg = res?.data?.data || {}
      const currentType = normalizeStorageType(cfg.type || 'local')
      setStorageType(currentType)
      setPersistedStorageType(currentType)
      setCustomPath(cfg.customPath || 'images')
      setAliyunConfig({
        ...defaultAliyunConfig,
        ...(cfg.aliyun || {}),
      })
      setQiniuConfig({
        ...defaultQiniuConfig,
        ...(cfg.qiniu || {}),
      })
      setTencentConfig({
        ...defaultTencentConfig,
        ...(cfg.tencent || {}),
      })
    } catch (error) {
      message.error(t['settings.storageFetchFailed'] || '获取图床配置失败')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchStorageConfig()
  }, [fetchStorageConfig])

  const saveStorageConfig = async (next?: Partial<StoragePayload>, silent = false) => {
    const payload: StoragePayload = {
      storageType: next?.storageType ?? storageType,
      customPath: next?.customPath ?? customPath,
      aliyunConfig: next?.aliyunConfig ?? aliyunConfig,
      qiniuConfig: next?.qiniuConfig ?? qiniuConfig,
      tencentConfig: next?.tencentConfig ?? tencentConfig,
    }

    try {
      await service.post('/hexopro/api/images/config/set', payload)
      setPersistedStorageType(payload.storageType)
      if (!silent) {
        message.success(t['settings.storageSettingsSaved'] || '图床设置已保存')
      }
    } catch (error) {
      if (!silent) {
        message.error(t['settings.storageSaveFailed'] || '保存图床配置失败')
      }
    }
  }

  const handleStorageTypeChange = async (nextTypeRaw: string) => {
    const nextType = normalizeStorageType(nextTypeRaw)
    setStorageType(nextType)

    let canSave = false
    if (nextType === 'local') canSave = true
    if (nextType === 'aliyun') canSave = isAliyunConfigValid(aliyunConfig)
    if (nextType === 'qiniu') canSave = isQiniuConfigValid(qiniuConfig)
    if (nextType === 'tencent') canSave = isTencentConfigValid(tencentConfig)

    if (canSave) {
      await saveStorageConfig({ storageType: nextType })
      return
    }
    message.warning(t['settings.storageConfigIncomplete'] || '配置不完整，未保存，请先填写完整配置再切换图床类型')
  }

  const handleCustomPathBlur = async () => {
    const normalized = (customPath || '').trim() || 'images'
    if (normalized !== customPath) {
      setCustomPath(normalized)
    }
    await saveStorageConfig({ customPath: normalized })
  }

  const persistAliyunConfig = async (next: AliyunConfig) => {
    const activeAndValid = storageType === 'aliyun' && isAliyunConfigValid(next)
    await saveStorageConfig(
      {
        aliyunConfig: next,
        storageType: activeAndValid ? 'aliyun' : persistedStorageType,
      },
      !activeAndValid,
    )
  }

  const persistQiniuConfig = async (next: QiniuConfig) => {
    const activeAndValid = storageType === 'qiniu' && isQiniuConfigValid(next)
    await saveStorageConfig(
      {
        qiniuConfig: next,
        storageType: activeAndValid ? 'qiniu' : persistedStorageType,
      },
      !activeAndValid,
    )
  }

  const persistTencentConfig = async (next: TencentConfig) => {
    const activeAndValid = storageType === 'tencent' && isTencentConfigValid(next)
    await saveStorageConfig(
      {
        tencentConfig: next,
        storageType: activeAndValid ? 'tencent' : persistedStorageType,
      },
      !activeAndValid,
    )
  }

  return (
    <Card loading={loading}>
      <Divider orientation="left">
        <CloudOutlined /> {t['settings.storageTitle'] || '图床设置'}
      </Divider>

      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <Text strong>{t['settings.storageType'] || '存储类型'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {t['settings.storageTypeDescription'] || '选择图片存储方式'}
          </Text>
        </div>
        <Select style={{ width: '100%' }} value={storageType} onChange={handleStorageTypeChange}>
          <Option value="local">{t['settings.storageTypeLocal'] || '本地存储'}</Option>
          <Option value="aliyun">{t['settings.storageTypeAliyun'] || '阿里云 OSS'}</Option>
          <Option value="qiniu">{t['settings.storageTypeQiniu'] || '七牛云'}</Option>
          <Option value="tencent">{t['settings.storageTypeTencent'] || '腾讯云 COS'}</Option>
        </Select>
      </div>

      {storageType === 'local' && (
        <div style={{ marginLeft: 16, marginTop: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <Text strong>{t['settings.storageCustomPath'] || '自定义存储路径'}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {t['settings.storageCustomPathDescription'] || '设置本地图片存储的自定义路径（相对于 source 目录）'}
            </Text>
          </div>
          <Input
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            onBlur={handleCustomPathBlur}
            placeholder={t['settings.storageCustomPathPlaceholder'] || '例如：images, assets/images'}
            style={{ width: '100%' }}
          />
        </div>
      )}

      {storageType === 'aliyun' && (
        <div style={{ marginLeft: 16, marginTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageAliyunRegion'] || '地域'}</Text>
            <Input
              value={aliyunConfig.region}
              onChange={(e) => setAliyunConfig((prev) => ({ ...prev, region: e.target.value }))}
              onBlur={(e) => persistAliyunConfig({ ...aliyunConfig, region: e.target.value })}
              placeholder="oss-cn-hangzhou"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageAliyunBucket'] || 'Bucket 名称'}</Text>
            <Input
              value={aliyunConfig.bucket}
              onChange={(e) => setAliyunConfig((prev) => ({ ...prev, bucket: e.target.value }))}
              onBlur={(e) => persistAliyunConfig({ ...aliyunConfig, bucket: e.target.value })}
              placeholder="my-bucket"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageAliyunAccessKeyId'] || 'Access Key ID'}</Text>
            <Input
              value={aliyunConfig.accessKeyId}
              onChange={(e) => setAliyunConfig((prev) => ({ ...prev, accessKeyId: e.target.value }))}
              onBlur={(e) => persistAliyunConfig({ ...aliyunConfig, accessKeyId: e.target.value })}
              placeholder="LTAI..."
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageAliyunAccessKeySecret'] || 'Access Key Secret'}</Text>
            <Input.Password
              value={aliyunConfig.accessKeySecret}
              onChange={(e) => setAliyunConfig((prev) => ({ ...prev, accessKeySecret: e.target.value }))}
              onBlur={(e) => persistAliyunConfig({ ...aliyunConfig, accessKeySecret: e.target.value })}
              placeholder="AccessKeySecret"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageAliyunDomain'] || '自定义域名（可选）'}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {t['settings.storageAliyunDomainDescription'] || '图片访问的自定义域名，留空则使用默认 OSS 域名'}
            </Text>
            <Input
              value={aliyunConfig.domain}
              onChange={(e) => setAliyunConfig((prev) => ({ ...prev, domain: e.target.value }))}
              onBlur={(e) => persistAliyunConfig({ ...aliyunConfig, domain: e.target.value })}
              placeholder="https://img.example.com"
              style={{ marginTop: 8 }}
            />
          </div>
        </div>
      )}

      {storageType === 'qiniu' && (
        <div style={{ marginLeft: 16, marginTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageQiniuRegion'] || '存储区域'}</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={qiniuConfig.region}
              onChange={(value) => {
                const next = { ...qiniuConfig, region: value }
                setQiniuConfig(next)
                persistQiniuConfig(next)
              }}
              placeholder={t['settings.storageQiniuRegionSelect'] || '选择存储区域'}
            >
              <Option value="z0">z0 (华东)</Option>
              <Option value="z1">z1 (华北)</Option>
              <Option value="z2">z2 (华南)</Option>
              <Option value="na0">na0 (北美)</Option>
              <Option value="as0">as0 (东南亚)</Option>
            </Select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageQiniuBucket'] || '空间名称'}</Text>
            <Input
              value={qiniuConfig.bucket}
              onChange={(e) => setQiniuConfig((prev) => ({ ...prev, bucket: e.target.value }))}
              onBlur={(e) => persistQiniuConfig({ ...qiniuConfig, bucket: e.target.value })}
              placeholder="my-space"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageQiniuAccessKey'] || 'Access Key'}</Text>
            <Input
              value={qiniuConfig.accessKey}
              onChange={(e) => setQiniuConfig((prev) => ({ ...prev, accessKey: e.target.value }))}
              onBlur={(e) => persistQiniuConfig({ ...qiniuConfig, accessKey: e.target.value })}
              placeholder="AccessKey"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageQiniuSecretKey'] || 'Secret Key'}</Text>
            <Input.Password
              value={qiniuConfig.secretKey}
              onChange={(e) => setQiniuConfig((prev) => ({ ...prev, secretKey: e.target.value }))}
              onBlur={(e) => persistQiniuConfig({ ...qiniuConfig, secretKey: e.target.value })}
              placeholder="SecretKey"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageQiniuDomain'] || '访问域名'}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {t['settings.storageQiniuDomainDescription'] || '七牛云 CDN 加速域名'}
            </Text>
            <Input
              value={qiniuConfig.domain}
              onChange={(e) => setQiniuConfig((prev) => ({ ...prev, domain: e.target.value }))}
              onBlur={(e) => persistQiniuConfig({ ...qiniuConfig, domain: e.target.value })}
              placeholder="https://cdn.example.com"
              style={{ marginTop: 8 }}
            />
          </div>
        </div>
      )}

      {storageType === 'tencent' && (
        <div style={{ marginLeft: 16, marginTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageTencentRegion'] || '地域'}</Text>
            <Input
              value={tencentConfig.region}
              onChange={(e) => setTencentConfig((prev) => ({ ...prev, region: e.target.value }))}
              onBlur={(e) => persistTencentConfig({ ...tencentConfig, region: e.target.value })}
              placeholder="ap-beijing"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageTencentBucket'] || 'Bucket 名称'}</Text>
            <Input
              value={tencentConfig.bucket}
              onChange={(e) => setTencentConfig((prev) => ({ ...prev, bucket: e.target.value }))}
              onBlur={(e) => persistTencentConfig({ ...tencentConfig, bucket: e.target.value })}
              placeholder="my-bucket-1250000000"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageTencentSecretId'] || 'Secret ID'}</Text>
            <Input
              value={tencentConfig.secretId}
              onChange={(e) => setTencentConfig((prev) => ({ ...prev, secretId: e.target.value }))}
              onBlur={(e) => persistTencentConfig({ ...tencentConfig, secretId: e.target.value })}
              placeholder="AKID..."
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageTencentSecretKey'] || 'Secret Key'}</Text>
            <Input.Password
              value={tencentConfig.secretKey}
              onChange={(e) => setTencentConfig((prev) => ({ ...prev, secretKey: e.target.value }))}
              onBlur={(e) => persistTencentConfig({ ...tencentConfig, secretKey: e.target.value })}
              placeholder="SecretKey"
              style={{ marginTop: 8 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{t['settings.storageTencentDomain'] || '自定义域名（可选）'}</Text>
            <Input
              value={tencentConfig.domain}
              onChange={(e) => setTencentConfig((prev) => ({ ...prev, domain: e.target.value }))}
              onBlur={(e) => persistTencentConfig({ ...tencentConfig, domain: e.target.value })}
              placeholder="https://img.example.com"
              style={{ marginTop: 8 }}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 16px', backgroundColor: 'var(--manage-surface)', borderRadius: '6px', border: '1px solid var(--manage-line)' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {t['settings.storageAutoSave'] || '图床设置会自动保存，无需点击保存按钮'}
        </Text>
      </div>
    </Card>
  )
}

export default StorageSettingsCard
