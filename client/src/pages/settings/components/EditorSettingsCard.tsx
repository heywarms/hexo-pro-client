import React, { useCallback } from 'react'
import { Card, Divider, Select, Typography, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import useLocale from '../../../hooks/useLocale'
import { useLocalStorageState } from '../hooks/useLocalStorageState'

const { Option } = Select
const { Text } = Typography

const EditorSettingsCard: React.FC = () => {
  const t = useLocale()
  const [editorMode, setEditorMode] = useLocalStorageState<string>('hexoProEditorEngine', 'blocks', {
    serialize: (v) => v,
    deserialize: (raw) => raw,
  })

  const onChange = useCallback(
    (mode: string) => {
      setEditorMode(mode)
      message.success(t['settings.editorModeSaved'])
    },
    [setEditorMode, t],
  )

  return (
    <Card>
      <Divider orientation="left">
        <EditOutlined /> {t['settings.editorTitle']}
      </Divider>

      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <Text strong>默认编辑方式</Text>
          <br />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            块编辑支持斜杠菜单、拖动排序和选中文字格式化；源码编辑保留全部 Markdown 语法。
          </Text>
        </div>
        <Select style={{ width: '100%' }} value={editorMode} onChange={onChange} placeholder={t['settings.editorModeSelect']}>
          <Option value="blocks">块编辑（推荐）</Option>
          <Option value="source">Markdown 源码</Option>
        </Select>
      </div>

      <div style={{ padding: '12px 16px', backgroundColor: 'var(--manage-surface)', borderRadius: '6px', border: '1px solid var(--manage-line)' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          文章仍保存为 Markdown。包含 Hexo 标签、HTML 等特殊内容时，编辑器会自动保留源码模式。写作界面的“主题预览”可查看当前主题下的文章效果，草稿也可预览。
        </Text>
      </div>
    </Card>
  )
}

export default EditorSettingsCard
