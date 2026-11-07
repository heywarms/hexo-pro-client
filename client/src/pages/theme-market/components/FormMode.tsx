import React, { useCallback, useEffect, useImperativeHandle, useMemo, useState, forwardRef } from 'react'
import { Alert, Button, Card, Collapse, Empty, Form, Input, InputNumber, Segmented, Select, Space, Switch, Tag, Typography, message } from 'antd'
import { get } from 'lodash'
import yaml from 'js-yaml'
import useLocale from '@/hooks/useLocale'
import type { CommentedTemplateBlock, SchemaField, SchemaJson } from '../themeSchema'
import {
  buildWorkingYaml,
  extractCommentedTemplateBlocks,
  generateSchemaFromYaml,
  getSchemaMetadataFromJson,
  getNestedValue,
  updateYamlValues,
} from '../themeSchema'
import styles from '../style.module.less'

const { Text } = Typography
const { TextArea } = Input

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStructuredValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return true
  }
  return isPlainObject(value)
}

function buildEmptyValueFromSample(sample: unknown): unknown {
  if (Array.isArray(sample)) return []
  if (isPlainObject(sample)) {
    return Object.fromEntries(
      Object.entries(sample).map(([key, value]) => [key, buildEmptyValueFromSample(value)])
    )
  }
  if (typeof sample === 'boolean') return false
  if (typeof sample === 'number') return 0
  return ''
}

interface StructuredValueEditorProps {
  value?: unknown
  onChange?: (value: unknown) => void
  sample?: unknown
  disabled?: boolean
  fieldPath?: string
  schemaJson?: SchemaJson | null
}

const StructuredValueEditor: React.FC<StructuredValueEditorProps> = ({
  value, onChange, sample, disabled, fieldPath = '', schemaJson,
}) => {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const currentValue = value ?? sample
  const metadata = getSchemaMetadataFromJson(schemaJson, fieldPath)
  const setValue = (next: unknown) => onChange?.(next)

  if (Array.isArray(currentValue)) {
    const itemSample = currentValue[0] ?? (Array.isArray(sample) ? sample[0] : undefined) ?? metadata?.item_template ?? ''
    const move = (from: number, to: number) => {
      const next = [...currentValue]
      next.splice(to, 0, next.splice(from, 1)[0])
      setValue(next)
    }
    return <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {currentValue.map((item, index) => {
        const itemMeta = getSchemaMetadataFromJson(schemaJson, `${fieldPath}.${index}`)
        const option = itemMeta?.options?.find(option => option.value === item)
        const title = isPlainObject(item) && typeof item.title === 'string' && item.title.trim()
          ? item.title : option?.label || `第 ${index + 1} 项`
        return <Card key={index} size="small" title={title} extra={
          <Space size={4}>
            <Button size="small" aria-label={`上移第 ${index + 1} 项`} disabled={disabled || index === 0} onClick={() => move(index, index - 1)}>↑</Button>
            <Button size="small" aria-label={`下移第 ${index + 1} 项`} disabled={disabled || index === currentValue.length - 1} onClick={() => move(index, index + 1)}>↓</Button>
            <Button danger size="small" disabled={disabled} onClick={() => setValue(currentValue.filter((_, i) => i !== index))}>删除</Button>
          </Space>
        }>
          <StructuredValueEditor value={item} sample={itemSample} disabled={disabled} fieldPath={`${fieldPath}.${index}`} schemaJson={schemaJson}
            onChange={nextItem => setValue(currentValue.map((entry, i) => i === index ? nextItem : entry))} />
        </Card>
      })}
      <Button type="dashed" disabled={disabled} onClick={() => setValue([...currentValue, buildEmptyValueFromSample(itemSample)])}>添加项</Button>
    </Space>
  }

  if (isPlainObject(currentValue)) {
    const objectKeys = Object.keys(currentValue)
    const addObjectKey = () => {
      const key = newKey.trim()
      if (!key || objectKeys.includes(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) return
      let parsed: unknown = newValue.trim()
      if (parsed === 'true' || parsed === 'false') parsed = parsed === 'true'
      else if (parsed !== '' && !Number.isNaN(Number(parsed))) parsed = Number(parsed)
      setValue({...currentValue, [key]: parsed})
      setNewKey(''); setNewValue('')
    }
    return <Space direction="vertical" size={16} style={{width: '100%'}}>
      {objectKeys.map(key => {
        const childPath = `${fieldPath}.${key}`
        const childMeta = getSchemaMetadataFromJson(schemaJson, childPath)
        if (childMeta?.hidden) return null
        const label = childMeta?.label || key
        return <div key={key}>
          <Space style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
            <Text strong>{label}</Text>
            {!metadata?.fixed && <Button danger size="small" disabled={disabled} onClick={() => {
              const next = {...currentValue}; delete next[key]; setValue(next)
            }}>删除</Button>}
          </Space>
          <StructuredValueEditor value={currentValue[key]} sample={isPlainObject(sample) ? sample[key] : undefined}
            disabled={disabled} fieldPath={childPath} schemaJson={schemaJson}
            onChange={next => setValue({...currentValue, [key]: next})} />
          {childMeta?.description && <Text type="secondary" style={{display: 'block', marginTop: 4}}>{childMeta.description}</Text>}
        </div>
      })}
      {!metadata?.fixed && <Card size="small" title="添加新项">
        <Space direction="vertical" size={8} style={{width: '100%'}}>
          <Input value={newKey} disabled={disabled} placeholder="键名" onChange={event => setNewKey(event.target.value)} onPressEnter={addObjectKey} />
          <Input value={newValue} disabled={disabled} placeholder="值" onChange={event => setNewValue(event.target.value)} onPressEnter={addObjectKey} />
          <Button type="dashed" block disabled={disabled || !newKey.trim() || objectKeys.includes(newKey.trim())} onClick={addObjectKey}>添加</Button>
        </Space>
      </Card>}
    </Space>
  }

  const label = metadata?.label || fieldPath.split('.').pop() || '配置值'
  if (metadata?.type === 'select' && metadata.options) {
    // The DOM Select does not accept boolean values. Resolve its string key
    // back to the schema value to preserve the original YAML type.
    return <Select aria-label={label} style={{width: '100%'}} disabled={disabled} value={String(currentValue ?? '')}
      options={metadata.options.map(option => ({value: String(option.value), label: option.label}))}
      onChange={key => setValue(metadata.options?.find(option => String(option.value) === key)?.value ?? key)} />
  }
  if (typeof currentValue === 'boolean') return <Switch aria-label={label} disabled={disabled} checked={currentValue} onChange={setValue} />
  if (typeof currentValue === 'number') return <InputNumber aria-label={label} disabled={disabled} style={{width: '100%'}} value={currentValue}
    min={typeof metadata?.min === 'number' ? metadata.min : undefined} max={typeof metadata?.max === 'number' ? metadata.max : undefined} onChange={next => setValue(next ?? 0)} />
  const text = String(currentValue ?? '')
  if (metadata?.type === 'color') return <Space style={{width: '100%'}}>
    <input aria-label={`${label}取色器`} type="color" disabled={disabled} value={/^#[\da-f]{6}$/i.test(text) ? text : '#000000'} onChange={event => setValue(event.target.value)} />
    <Input aria-label={label} disabled={disabled} maxLength={7} value={text} onChange={event => setValue(event.target.value)} />
  </Space>
  if (metadata?.type === 'textarea' || text.includes('\n')) return <TextArea aria-label={label} disabled={disabled} autoSize={{minRows: 3, maxRows: 8}} value={text} onChange={event => setValue(event.target.value)} />
  return <Input aria-label={label} disabled={disabled} placeholder={metadata?.placeholder} value={text} onChange={event => setValue(event.target.value)} />
}

interface FormModeProps {
  initialYaml: string
  onSave: (yamlContent: string) => Promise<void>
  saving: boolean
  onClose?: () => void
  /** 独立的 schema JSON，优先于 YAML 注释 */
  schemaJson?: SchemaJson | null
}

export interface FormModeRef {
  save: () => Promise<void>
}

type ViewMode = 'enabled' | 'disabled' | 'all'

const FormMode = forwardRef<FormModeRef, FormModeProps>(({
  initialYaml,
  onSave,
  saving,
  onClose,
  schemaJson,
}, ref) => {
  const t = useLocale()
  const [form] = Form.useForm()
  const [pendingTemplatePaths, setPendingTemplatePaths] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('enabled')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [activeGroupKeys, setActiveGroupKeys] = useState<string[]>([])
  const templateBlocks = useMemo(
    () => extractCommentedTemplateBlocks(initialYaml, schemaJson),
    [initialYaml, schemaJson]
  )
  const workingYaml = useMemo(
    () => buildWorkingYaml(initialYaml, templateBlocks, pendingTemplatePaths),
    [initialYaml, pendingTemplatePaths, templateBlocks]
  )

  // 基于工作态 YAML 生成 schema；待启用模板会立即出现在可编辑字段中
  const { schema, parseError } = useMemo(() => {
    try {
      const config = yaml.load(workingYaml) as Record<string, unknown>
      if (config && typeof config === 'object') {
        return {
          schema: generateSchemaFromYaml(config, workingYaml, { schemaJson }),
          parseError: '',
        }
      }
    } catch {
      // handled below
    }
    try {
      yaml.load(workingYaml)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { schema: [], parseError: message }
    }
    return { schema: [], parseError: '' }
  }, [schemaJson, workingYaml])

  // 从配置转换为表单值
  const configToFormValues = useCallback((config: Record<string, unknown>, formSchema: typeof schema) => {
    const values: Record<string, unknown> = {}
    formSchema.forEach((group) => {
      group.fields.forEach((field) => {
        const rawVal = get(config, field.key)
        let val = rawVal
        if (val === undefined || val === null) val = field.default ?? ''

        if (isStructuredValue(val)) {
          values[field.key] = val
          return
        }

        val = getNestedValue(config, field.key)
        if (val === undefined || val === null) val = field.default ?? ''
        if (field.type === 'select' && field.options && val !== '' && val !== false) {
          val = String(val)
        }
        values[field.key] = val
      })
    })
    return values
  }, [])

  useEffect(() => {
    try {
      const config = yaml.load(workingYaml) as Record<string, unknown>
      if (config && typeof config === 'object' && schema.length > 0) {
        const values = configToFormValues(config, schema)
        const currentValues = form.getFieldsValue(true)
        const definedCurrentValues = Object.fromEntries(
          Object.entries(currentValues).filter(([, value]) => value !== undefined)
        )
        form.setFieldsValue({
          ...values,
          ...definedCurrentValues,
        })
      }
    } catch {
      // ignore parse error
    }
  }, [configToFormValues, form, schema, workingYaml])

  useEffect(() => {
    setPendingTemplatePaths([])
  }, [initialYaml, schemaJson, templateBlocks.length])

  const normalizedSearchKeyword = useMemo(() => searchKeyword.trim().toLowerCase(), [searchKeyword])

  const matchesSearch = useCallback((...values: Array<string | undefined>) => {
    if (!normalizedSearchKeyword) return true
    return values.some((value) => (value || '').toLowerCase().includes(normalizedSearchKeyword))
  }, [normalizedSearchKeyword])

  const filteredSchema = useMemo(() => {
    if (viewMode === 'disabled') return []

    return schema
      .map((group) => {
        if (matchesSearch(group.key, group.label)) {
          return group
        }

        const fields = group.fields.filter((field) => (
          matchesSearch(field.key, field.label, field.description, group.key, group.label)
        ))

        if (fields.length === 0) return null
        return { ...group, fields }
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group))
  }, [matchesSearch, schema, viewMode])

  const filteredTemplateBlocks = useMemo(() => {
    if (viewMode === 'enabled') return []

    return templateBlocks.filter((block) => (
      matchesSearch(block.path, block.key, block.label, block.description, block.preview)
    ))
  }, [matchesSearch, templateBlocks, viewMode])

  const groupedTemplateBlocks = useMemo(() => {
    const groupMap = new Map<string, CommentedTemplateBlock[]>()

    filteredTemplateBlocks.forEach((block) => {
      const groupKey = block.path.split('.')[0]
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, [])
      }
      groupMap.get(groupKey)!.push(block)
    })

    return Array.from(groupMap.entries()).map(([key, blocks]) => ({
      key,
      label: t[key] || key,
      blocks,
    }))
  }, [filteredTemplateBlocks, t])

  useEffect(() => {
    if (filteredSchema.length === 0) {
      setActiveGroupKeys([])
      return
    }

    if (normalizedSearchKeyword) {
      setActiveGroupKeys(filteredSchema.map((group) => group.key))
      return
    }

    setActiveGroupKeys((prev) => {
      const validKeys = prev.filter((key) => filteredSchema.some((group) => group.key === key))
      if (validKeys.length > 0) return validKeys
      return [filteredSchema[0].key]
    })
  }, [filteredSchema, normalizedSearchKeyword])

  const normalizeFieldValue = useCallback((field: SchemaField, rawValue: unknown, oldValue: unknown): unknown => {
    const finalVal = rawValue

    if (field.type === 'select' && typeof rawValue === 'string') {
      if (rawValue === 'false') return false
      if (!Number.isNaN(Number(rawValue))) return Number(rawValue)
      return rawValue
    }

    const shouldParseYamlText =
      typeof rawValue === 'string' &&
      (Array.isArray(oldValue) ||
        (!!oldValue && typeof oldValue === 'object') ||
        Array.isArray(field.default) ||
        (!!field.default && typeof field.default === 'object'))

    if (shouldParseYamlText) {
      const trimmed = rawValue.trim()
      if (trimmed === '') return undefined
      try {
        return yaml.load(trimmed)
      } catch {
        return rawValue
      }
    }

    return finalVal
  }, [])

  const stringifyComparableValue = useCallback((value: unknown): string => {
    if (value && typeof value === 'object') {
      try {
        return yaml.dump(value, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
        }).trim()
      } catch {
        return JSON.stringify(value)
      }
    }
    return String(value)
  }, [])

  const formatYamlError = useCallback((error: unknown): string => {
    const fallback = t['theme.config.parseError'] || 'YAML 解析失败'
    if (!error || typeof error !== 'object') {
      return fallback
    }

    const yamlError = error as { message?: string; mark?: { line?: number; column?: number } }
    const baseMessage = yamlError.message || fallback
    const line = typeof yamlError.mark?.line === 'number' ? yamlError.mark.line + 1 : undefined
    const column = typeof yamlError.mark?.column === 'number' ? yamlError.mark.column + 1 : undefined

    if (line && column) {
      return `${baseMessage} (line ${line}, column ${column})`
    }
    return baseMessage
  }, [t])

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields()
      const baseConfig = yaml.load(workingYaml) as Record<string, unknown>

      // 收集变更的字段
      const changes: Record<string, unknown> = {}
      schema.forEach((group) => {
        group.fields.forEach((field) => {
          const newVal = values[field.key]
          if (newVal === undefined) return
          const oldVal = get(baseConfig || {}, field.key)
          const finalVal = normalizeFieldValue(field, newVal, oldVal)
          if (stringifyComparableValue(finalVal) !== stringifyComparableValue(oldVal)) {
            changes[field.key] = finalVal
          }
        })
      })

      // 基于工作态 YAML 保存，允许用户在启用模板后立即编辑其中字段
      const yamlContent = updateYamlValues(workingYaml, changes)
      try {
        yaml.load(yamlContent)
      } catch (error) {
        message.error(formatYamlError(error))
        return
      }
      await onSave(yamlContent)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // validation error, form will show
      }
    }
  }, [form, formatYamlError, normalizeFieldValue, onSave, schema, stringifyComparableValue, workingYaml])

  useImperativeHandle(ref, () => ({
    save: handleSave,
  }), [handleSave])

  const toggleTemplateBlock = useCallback((path: string) => {
    setPendingTemplatePaths((prev) => (
      prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]
    ))
  }, [])

  const renderTemplateBlock = (block: CommentedTemplateBlock) => {
    const pending = pendingTemplatePaths.includes(block.path)
    const label = t[block.label] || block.label
    const description = block.description ? (t[block.description] || block.description) : undefined

    return (
      <Card
        key={block.path}
        size="small"
        className={styles.templateBlockCard}
        title={
          <Space size={8}>
            <Text strong>{label}</Text>
            <Tag color={pending ? 'gold' : 'default'}>
              {pending ? (t['theme.config.templatePending'] || '保存后启用') : (t['theme.config.templateAvailable'] || '可启用')}
            </Tag>
          </Space>
        }
        extra={
          <Button type={pending ? 'default' : 'primary'} size="small" onClick={() => toggleTemplateBlock(block.path)}>
            {pending ? (t['universal.cancel'] || '取消') : (t['theme.config.enableTemplate'] || '启用')}
          </Button>
        }
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text type="secondary">{block.path}</Text>
          {description ? <Text type="secondary">{description}</Text> : null}
          <pre className={styles.templateBlockPreview}>{block.preview}</pre>
        </Space>
      </Card>
    )
  }

  const renderField = (field: SchemaField) => {
    const label = t[field.label] || field.label
    const placeholder = field.placeholder ? (t[field.placeholder] || field.placeholder) : undefined
    const description = field.description ? (t[field.description] || field.description) : undefined
    const structuredDefault = field.default

    if (isStructuredValue(structuredDefault)) {
      return (
        <Form.Item key={field.key} name={field.key} label={label} help={description}>
          <StructuredValueEditor sample={structuredDefault} disabled={saving} fieldPath={field.key} schemaJson={schemaJson} />
        </Form.Item>
      )
    }

    switch (field.type) {
      case 'switch':
        return (
          <Form.Item
            key={field.key}
            name={field.key}
            label={label}
            valuePropName="checked"
            help={description}
          >
            <Switch />
          </Form.Item>
        )
      case 'number':
        return (
          <Form.Item key={field.key} name={field.key} label={label} help={description}>
            <InputNumber style={{ width: '100%' }} placeholder={placeholder} />
          </Form.Item>
        )
      case 'select':
        return (
          <Form.Item key={field.key} name={field.key} label={label} help={description}>
            <Select
              placeholder={placeholder}
              allowClear
              options={field.options?.map((o) => ({
                value: o.value,
                label: t[String(o.label)] || String(o.label),
              }))}
            />
          </Form.Item>
        )
      case 'textarea':
        return (
          <Form.Item key={field.key} name={field.key} label={label} help={description}>
            <TextArea
              rows={typeof field.default === 'object' && field.default !== null ? 10 : 4}
              placeholder={placeholder}
            />
          </Form.Item>
        )
      case 'color':
        return (
          <Form.Item key={field.key} name={field.key} label={label} help={description}>
            <Input placeholder={placeholder} type="text" maxLength={7} />
          </Form.Item>
        )
      default:
        return (
          <Form.Item key={field.key} name={field.key} label={label} help={description}>
            <Input placeholder={placeholder} />
          </Form.Item>
        )
    }
  }

  const showEnabledSection = viewMode !== 'disabled'
  const showDisabledSection = viewMode !== 'enabled'
  const hasVisibleContent = filteredSchema.length > 0 || groupedTemplateBlocks.length > 0

  if (schema.length === 0 && templateBlocks.length === 0) {
    return (
      <div className={styles.formMode} style={{ padding: 40, textAlign: 'center' }}>
        {parseError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16, textAlign: 'left' }}
            message={t['theme.config.parseError'] || 'YAML 解析失败'}
            description={parseError}
          />
        ) : null}
        <Empty description={t['theme.config.noFields'] || '无可编辑字段'} />
      </div>
    )
  }

  return (
    <div className={styles.formMode}>
      <div className={styles.formModeToolbar}>
        <Segmented
          value={viewMode}
          onChange={(value) => setViewMode(value as ViewMode)}
          options={[
            { label: t['theme.config.enabledView'] || '已启用', value: 'enabled' },
            { label: t['theme.config.disabledView'] || '未启用', value: 'disabled' },
            { label: t['theme.config.allView'] || '全部', value: 'all' },
          ]}
        />
        <Input.Search
          allowClear
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          placeholder={t['theme.config.searchPlaceholder'] || '搜索分组、字段或配置路径'}
          className={styles.formModeSearch}
        />
      </div>

      {showDisabledSection && groupedTemplateBlocks.length > 0 ? (
        <div className={styles.templateBlockSection}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t['theme.config.templateTitle'] || '可从注释中启用的配置'}
            description={t['theme.config.templateDescription'] || '这些配置当前仍是注释状态，可在表单模式中直接启用，保存后会自动取消注释。'}
          />
          <Collapse
            className={styles.templateBlockCollapse}
            items={groupedTemplateBlocks.map((group) => ({
              key: group.key,
              label: (
                <Space size={8}>
                  <Text strong>{group.label}</Text>
                  <Tag>{group.blocks.length}</Tag>
                </Space>
              ),
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {group.blocks.map((block) => renderTemplateBlock(block))}
                </Space>
              ),
            }))}
          />
        </div>
      ) : null}

      {showEnabledSection && filteredSchema.length > 0 ? (
        <Form form={form} layout="vertical" preserve={false}>
          <Collapse
            activeKey={activeGroupKeys}
            onChange={(keys) => {
              const keyList = Array.isArray(keys) ? keys : [keys]
              setActiveGroupKeys(keyList.map(String))
            }}
            items={filteredSchema.map((group) => ({
              key: group.key,
              label: (
                <Space size={8}>
                  <Text strong>{t[group.label] || group.label}</Text>
                  <Tag>{group.fields.length}</Tag>
                </Space>
              ),
              children: (
                <div style={{ padding: '8px 0' }}>
                  {group.fields.map((field) => renderField(field))}
                </div>
              ),
            }))}
          />
        </Form>
      ) : null}

      {!hasVisibleContent ? (
        <div className={styles.formModeEmpty}>
          <Empty description={t['theme.config.noSearchResult'] || '没有匹配的配置'} />
        </div>
      ) : null}
    </div>
  )
})

FormMode.displayName = 'FormMode'

export default FormMode
