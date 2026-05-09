import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Checkbox, Divider, Input, Space, Spin, Switch, Typography, message } from 'antd'
import { ApiOutlined, CopyOutlined, KeyOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import service from '@/utils/api'

const { Paragraph, Text } = Typography
const { TextArea } = Input

type McpStatus = {
  enabled: boolean
  scopes: string[]
  hasToken: boolean
  hermesConfig?: object
}

const scopeOptions = [
  { label: '读取文章', value: 'read' },
  { label: '创建/修改草稿', value: 'write' },
  { label: '发布/撤回文章', value: 'publish' },
  { label: '读取部署状态', value: 'deploy' },
]

const defaultMcpStatus: McpStatus = {
  enabled: false,
  scopes: ['read', 'write', 'publish'],
  hasToken: false,
}

const MCPSettingsCard: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<McpStatus>(defaultMcpStatus)
  const [visibleToken, setVisibleToken] = useState('')
  const [visibleConfig, setVisibleConfig] = useState<object | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await service.get('/hexopro/api/mcp/status')
      setStatus(res.data?.data || defaultMcpStatus)
      setVisibleConfig(res.data?.data?.hermesConfig || null)
    } catch (error) {
      message.error('获取 MCP 设置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const configText = useMemo(() => {
    const config = visibleConfig || status.hermesConfig || {}
    return JSON.stringify(config, null, 2)
  }, [status.hermesConfig, visibleConfig])

  const enableMcp = async () => {
    setSaving(true)
    try {
      const res = await service.post('/hexopro/api/mcp/enable', {
        scopes: status.scopes,
      })
      const data = res.data?.data
      setStatus(data)
      setVisibleToken(data.token)
      setVisibleConfig(data.hermesConfig)
      message.success('MCP Server 已开启，请复制 token 到 Agent 配置中')
    } catch (error) {
      message.error('开启 MCP Server 失败')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (next: Partial<McpStatus>) => {
    const merged = { ...status, ...next }
    setStatus(merged)
    setSaving(true)
    try {
      const res = await service.post('/hexopro/api/mcp/update', {
        enabled: merged.enabled,
        scopes: merged.scopes,
      })
      setStatus(res.data?.data || merged)
      setVisibleConfig(res.data?.data?.hermesConfig || visibleConfig)
      message.success('MCP 设置已保存')
    } catch (error) {
      message.error('保存 MCP 设置失败')
      fetchStatus()
    } finally {
      setSaving(false)
    }
  }

  const rotateToken = async () => {
    setSaving(true)
    try {
      const res = await service.post('/hexopro/api/mcp/rotate-token', {
        scopes: status.scopes,
      })
      const data = res.data?.data
      setStatus(data)
      setVisibleToken(data.token)
      setVisibleConfig(data.hermesConfig)
      message.success('MCP Token 已轮换')
    } catch (error) {
      message.error('轮换 MCP Token 失败')
    } finally {
      setSaving(false)
    }
  }

  const copyText = async (text: string, successText: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success(successText)
    } catch (error) {
      message.error('复制失败')
    }
  }

  return (
    <Card>
      <Spin spinning={loading || saving}>
        <Divider orientation="left">
          <ApiOutlined /> MCP Server
        </Divider>

        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="AI Agent 专用通道"
            description="开启后，Hermes 等 MCP 客户端可使用专用 MCP Token 调用文章工具，不需要登录页下发的用户 JWT。Token 只在生成或轮换时显示一次。"
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <Text strong>启用 MCP Agent 通道</Text>
              <br />
              <Text type="secondary">仅验证 MCP Token 和权限范围，不复用用户登录 JWT。</Text>
            </div>
            <Switch
              checked={status.enabled}
              disabled={!status.hasToken}
              checkedChildren="开启"
              unCheckedChildren="关闭"
              onChange={(checked) => updateStatus({ enabled: checked })}
            />
          </div>

          <div>
            <Text strong>
              <SafetyCertificateOutlined /> Agent 权限
            </Text>
            <div style={{ marginTop: 10 }}>
              <Checkbox.Group
                options={scopeOptions}
                value={status.scopes}
                onChange={(values) => updateStatus({ scopes: values.map(String) })}
              />
            </div>
          </div>

          <Space wrap>
            <Button type="primary" icon={<KeyOutlined />} onClick={status.hasToken ? rotateToken : enableMcp}>
              {status.hasToken ? '轮换 MCP Token' : '开启并生成 Token'}
            </Button>
            {status.hasToken && (
              <Button onClick={() => updateStatus({ enabled: !status.enabled })}>
                {status.enabled ? '暂停 MCP 通道' : '重新开启 MCP 通道'}
              </Button>
            )}
          </Space>

          {visibleToken && (
            <Alert
              type="warning"
              showIcon
              message="请立即保存这个 MCP Token"
              description={
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Input.Password value={visibleToken} readOnly />
                  <Button icon={<CopyOutlined />} onClick={() => copyText(visibleToken, 'Token 已复制')}>
                    复制 Token
                  </Button>
                </Space>
              }
            />
          )}

          <div>
            <Paragraph strong style={{ marginBottom: 8 }}>
              Hermes MCP 配置
            </Paragraph>
            <TextArea rows={10} value={configText} readOnly />
            <Button
              style={{ marginTop: 10 }}
              icon={<CopyOutlined />}
              onClick={() => copyText(configText, 'Hermes 配置已复制')}
            >
              复制配置
            </Button>
          </div>
        </Space>
      </Spin>
    </Card>
  )
}

export default MCPSettingsCard
