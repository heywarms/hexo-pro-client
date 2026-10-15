import React from 'react'
import { Button, Card, Typography } from 'antd'
import { CloudSyncOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

export default function GitHubSyncSettingsCard() {
  const navigate = useNavigate()
  return <Card>
    <Typography.Paragraph type="secondary">云同步已有独立入口，可以检查本机与 GitHub 的文件差异，并与手机同步文章、主题和配置。</Typography.Paragraph>
    <Button type="primary" icon={<CloudSyncOutlined />} onClick={() => navigate('/sync')}>打开云同步</Button>
  </Card>
}
