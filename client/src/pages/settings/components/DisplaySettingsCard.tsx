import React, { useCallback } from 'react'
import { Card, Divider, Switch, Typography, message } from 'antd'
import { PictureOutlined } from '@ant-design/icons'
import useLocale from '../../../hooks/useLocale'
import { useLocalStorageState } from '../hooks/useLocalStorageState'

const { Text } = Typography

const DisplaySettingsCard: React.FC = () => {
  const t = useLocale()
  const [showCoverEnabled, setShowCoverEnabled] = useLocalStorageState<boolean>('hexoProShowCover', true, {
    serialize: (v) => v.toString(),
    deserialize: (raw) => raw === 'true',
  })

  const onChange = useCallback(
    (checked: boolean) => {
      setShowCoverEnabled(checked)
      message.success(checked ? t['settings.showCoverEnabled'] : t['settings.showCoverDisabled'])
    },
    [setShowCoverEnabled, t],
  )

  return (
    <Card>
      <Divider orientation="left">
        <PictureOutlined /> {t['settings.displayTitle']}
      </Divider>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <Text strong>{t['settings.showCover']}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {t['settings.showCoverDescription']}
            </Text>
          </div>
          <Switch checked={showCoverEnabled} onChange={onChange} checkedChildren={t['settings.show']} unCheckedChildren={t['settings.hide']} />
        </div>
      </div>

      <div style={{ padding: '12px 16px', backgroundColor: 'var(--manage-surface)', borderRadius: '6px', border: '1px solid var(--manage-line)' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {t['settings.showCoverHelp']}
        </Text>
      </div>
    </Card>
  )
}

export default DisplaySettingsCard

