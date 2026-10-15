import React, { useEffect, useState } from 'react'
import {
  Button,
  Alert,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Pagination,
  Tabs,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CodeOutlined,
  FileTextOutlined,
  SearchOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import service from '@/utils/api'
import useLocale from '@/hooks/useLocale'
import useDeviceDetect from '@/hooks/useDeviceDetect'
import styles from './style/index.module.less'
import YamlEditor from './components/YamlEditor'
import TemplateManager from './components/TemplateManager'
import ManagementPage from '../components/ManagementPage'
import managementLocale from '../components/ManagementPage/locale'

const { Paragraph } = Typography
const { Option } = Select
const { TabPane } = Tabs

interface YamlFile {
  name: string;
  path: string;
  content: string;
  lastModified: string;
}

interface YamlTemplate {
  id: string;
  name: string;
  description: string;
  structure: any;
  variables: any[];
}

const YamlManager: React.FC = () => {
  const t = useLocale()
  const ui = useLocale(managementLocale)
  const [fileQuery, setFileQuery] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [saving, setSaving] = useState(false)
  const { isMobile } = useDeviceDetect()

  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  const [yamlFiles, setYamlFiles] = useState<YamlFile[]>([])
  const [templates, setTemplates] = useState<YamlTemplate[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [currentFile, setCurrentFile] = useState<YamlFile | null>(null)
  const [createFileVisible, setCreateFileVisible] = useState(false)
  const [createTemplateVisible, setCreateTemplateVisible] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFilePath, setNewFilePath] = useState('')
  const [newTemplateData, setNewTemplateData] = useState({
    name: '',
    description: '',
    structure: {},
    variables: []
  })
  const [activeTab, setActiveTab] = useState('files')

  // 获取YAML文件列表
  const fetchYamlFiles = async () => {
    setLoading(true)
    setFileError('')
    try {
      const res = await service.get('/hexopro/api/yaml/list', {
        params: {
          page: currentPage,
          pageSize: pageSize
        }
      })
      setYamlFiles(res.data.files || [])
      setCurrentFile(current => current || res.data.files?.[0] || null)
      setTotal(res.data.total)
    } catch (error) {
      setFileError(t['content.yaml.fetchFailed'] || ui.loadFailed)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { setDraftContent(currentFile?.content || '') }, [currentFile?.path])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (currentFile && draftContent !== currentFile.content) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [currentFile, draftContent])

  // 获取模板列表
  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await service.get('/hexopro/api/yaml/templates')
      setTemplates(res.data)
    } catch (error) {
      message.error(t['content.yaml.fetchTemplatesFailed'] || '获取模板列表失败')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // 创建新YAML文件
  const handleCreateFile = async () => {
    if (!newFileName.trim()) {
      message.error(t['content.yaml.fileNameRequired'] || '文件名称不能为空')
      return
    }

    try {
      await service.post('/hexopro/api/yaml/create', {
        name: newFileName,
        path: newFilePath,
        content: '# 新建YAML文件\n'
      })
      message.success(t['content.yaml.createSuccess'] || '创建文件成功')
      setCreateFileVisible(false)
      setNewFileName('')
      setNewFilePath('')
      fetchYamlFiles()
    } catch (error) {
      message.error(t['content.yaml.createFailed'] || '创建文件失败')
      console.error(error)
    }
  }

  // 创建新模板
  const handleCreateTemplate = async () => {
    if (!newTemplateData.name.trim()) {
      message.error(t['content.yaml.templateNameRequired'] || '模板名称不能为空')
      return
    }

    try {
      // 获取表单中的变量数据
      const formElement = document.querySelector('form')
      const formData = new FormData(formElement as HTMLFormElement)
      const variables = []

      // 从表单中提取变量数据
      const formFields = formElement?.querySelectorAll('.ant-row')
      if (formFields && formFields.length > 0) {
        formFields.forEach((row) => {
          const nameInput = row.querySelector('input[placeholder="title"]')
          const typeSelect = row.querySelector('.ant-select-selection-item')
          const defaultInput = row.querySelector('input[placeholder="默认值"]')
          const descInput = row.querySelector('input[placeholder="变量描述"]')

          if (nameInput) {
            const name = (nameInput as HTMLInputElement).value
            const type = typeSelect ? (typeSelect as HTMLElement).textContent || 'string' : 'string'
            const defaultValue = defaultInput ? (defaultInput as HTMLInputElement).value : ''
            const description = descInput ? (descInput as HTMLInputElement).value : ''

            if (name) {
              variables.push({
                name,
                type,
                default: defaultValue,
                description
              })
            }
          }
        })
      }

      const templateData = {
        ...newTemplateData,
        variables: variables.length > 0 ? variables : newTemplateData.variables
      }

      await service.post('/hexopro/api/yaml/template/create', templateData)
      message.success(t['content.yaml.createTemplateSuccess'] || '创建模板成功')
      setCreateTemplateVisible(false)
      setNewTemplateData({
        name: '',
        description: '',
        structure: {},
        variables: []
      })
      fetchTemplates()
    } catch (error) {
      message.error(t['content.yaml.createTemplateFailed'] || '创建模板失败')
      console.error(error)
    }
  }

  // 保存YAML文件
  const handleSaveFile = async (file: YamlFile, content: string) => {
    setSaving(true)
    try {
      await service.post('/hexopro/api/yaml/update', {
        path: file.path,
        content: content
      })
      setCurrentFile(current => current?.path === file.path ? { ...current, content } : current)
      message.success(t['content.yaml.saveSuccess'] || '保存成功')
      fetchYamlFiles()
    } catch (error) {
      message.error(t['content.yaml.saveFailed'] || '保存失败')
      console.error(error)
    } finally { setSaving(false) }
  }

  // 删除YAML文件
  const handleDeleteFile = async (file: YamlFile) => {
    try {
      await service.post('/hexopro/api/yaml/delete', {
        path: file.path
      })
      message.success(t['content.yaml.deleteSuccess'] || '删除成功')
      if (currentFile && currentFile.path === file.path) {
        setCurrentFile(null)
      }
      fetchYamlFiles()
    } catch (error) {
      message.error(t['content.yaml.deleteFailed'] || '删除失败')
      console.error(error)
    }
  }

  // 应用模板
  const handleApplyTemplate = async (template: YamlTemplate, values: any, targetPath: string) => {
    try {
      await service.post('/hexopro/api/yaml/apply-template', {
        templateId: template.id,
        values: values,
        targetPath: targetPath
      })
      message.success(t['content.yaml.applyTemplateSuccess'] || '应用模板成功')
      fetchYamlFiles()
    } catch (error) {
      message.error(t['content.yaml.applyTemplateFailed'] || '应用模板失败')
      console.error(error)
    }
  }

  // 处理页面变化
  const handlePageChange = (page: number, pageSize?: number) => {
    setCurrentPage(page)
    if (pageSize) setPageSize(pageSize)
  }

  // 初始加载和依赖变化时获取数据
  useEffect(() => {
    fetchYamlFiles()
  }, [currentPage, pageSize])

  useEffect(() => {
    fetchTemplates()
  }, [])

  // 新增状态
  const [fileListCollapsed, setFileListCollapsed] = useState(false)
  const [fullscreenMode, setFullscreenMode] = useState(false)

  // 切换文件列表收起/展开状态
  const toggleFileList = () => {
    setFileListCollapsed(!fileListCollapsed)
  }

  // 切换全屏编辑模式
  const toggleFullscreen = () => {
    setFullscreenMode(!fullscreenMode)

    // 全屏模式下自动调整编辑器大小
    setTimeout(() => {
      const editor = document.getElementById('yaml-editor') as any
      if (editor && editor.layout) {
        editor.layout()
      }
    }, 100)
  }

  const hasChanges = !!currentFile && draftContent !== currentFile.content
  const chooseFile = (file: YamlFile) => {
    if (file.path === currentFile?.path) return
    const open = () => { setCurrentFile(file); setDraftContent(file.content); if (isMobile) setFileListCollapsed(true) }
    if (hasChanges) Modal.confirm({title:ui.discardTitle,content:ui.discardDescription,okText:ui.discard,cancelText:t['universal.cancel'],onOk:open})
    else open()
  }
  const filteredFiles = yamlFiles.filter(file => `${file.name} ${file.path}`.toLowerCase().includes(fileQuery.trim().toLowerCase()))

  return (
    <ManagementPage className={styles.yamlManager} title={ui.yamlTitle} description={ui.yamlDescription}
      count={ui.fileCount.replace('{count}',String(total))}
      actions={<><Button icon={<SettingOutlined />} onClick={()=>setCreateTemplateVisible(true)}>{t['content.yaml.createTemplate']}</Button><Button type="primary" icon={<FileAddOutlined />} onClick={()=>setCreateFileVisible(true)}>{t['content.yaml.createFile']}</Button></>}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} className={styles.tabs}>
        <TabPane tab={t['content.yaml.files']} key="files">
          <div className={`${styles.workspace} ${fullscreenMode?styles.fullscreenContainer:''}`} data-collapsed={fileListCollapsed}>
            {!fileListCollapsed && <aside className={styles.fileDirectory} aria-label={ui.fileDirectory}>
              <div className={styles.directoryHeader}><strong>{ui.fileDirectory}</strong><Button type="text" size="small" icon={<ReloadOutlined />} aria-label={ui.refresh} loading={loading} onClick={fetchYamlFiles} /></div>
              <Input className={styles.fileSearch} prefix={<SearchOutlined />} placeholder={ui.searchFiles} aria-label={ui.searchFiles} value={fileQuery} allowClear onChange={e=>setFileQuery(e.target.value)} />
              {fileError && <Alert type="error" showIcon message={fileError} action={<Button size="small" onClick={fetchYamlFiles}>{ui.retry}</Button>} />}
              <Spin spinning={loading}>
                <div className={styles.fileList}>
                  {filteredFiles.map(file=><button key={file.path} className={styles.fileItem} aria-pressed={currentFile?.path===file.path} onClick={()=>chooseFile(file)}><FileTextOutlined /><span><strong>{file.name}</strong><small>{file.path}</small></span>{currentFile?.path===file.path && <span className={styles.activeDot} />}</button>)}
                  {!loading && !fileError && filteredFiles.length===0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={fileQuery?ui.fileSearchEmpty:t['content.yaml.noFiles']} />}
                </div>
              </Spin>
              {total>pageSize && <div className={styles.filePagination}><Pagination current={currentPage} pageSize={pageSize} total={total} onChange={handlePageChange} simple showSizeChanger={false} /></div>}
            </aside>}
            <div className={styles.editorColumn}>
              <div className={styles.editorToolbar}>
                <div className={styles.editorFile}><Button type="text" icon={fileListCollapsed?<MenuUnfoldOutlined />:<MenuFoldOutlined />} onClick={toggleFileList} aria-label={fileListCollapsed?ui.expandFiles:ui.collapseFiles} title={fileListCollapsed?ui.expandFiles:ui.collapseFiles} /><CodeOutlined /><span title={currentFile?.path}>{currentFile?.name || ui.chooseFile}</span>{hasChanges && <span className={styles.unsavedDot} />}</div>
                <div className={styles.editorActions}>
                  {currentFile && <Popconfirm title={t['content.yaml.deleteConfirm']} onConfirm={()=>handleDeleteFile(currentFile)} okText={t['content.yaml.ok']} cancelText={t['content.yaml.cancel']}><Button type="text" danger icon={<DeleteOutlined />} aria-label={t['universal.delete']} disabled={saving} /></Popconfirm>}
                  <Button type="text" icon={fullscreenMode?<FullscreenExitOutlined />:<FullscreenOutlined />} onClick={toggleFullscreen} title={fullscreenMode?ui.exitFullscreen:ui.fullscreen} aria-label={fullscreenMode?ui.exitFullscreen:ui.fullscreen} />
                  <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!currentFile || !hasChanges} onClick={()=>currentFile && handleSaveFile(currentFile,draftContent)}>{t['content.yaml.save']}</Button>
                </div>
              </div>
              <div className={styles.editorBody}>
                {currentFile ? <YamlEditor key={currentFile.path} id="yaml-editor" initialValue={draftContent} height="100%" onChange={setDraftContent} /> : <div className={styles.editorEmpty}><CodeOutlined /><h3>{ui.chooseFile}</h3><p>{ui.chooseFileHint}</p></div>}
              </div>
              <div className={styles.editorStatus}><span>{currentFile?.path || ui.fileDirectory}</span><span>{hasChanges?ui.unsaved:ui.saved}<span className={styles.statusDivider}>·</span>YAML<span className={styles.statusDivider}>·</span>UTF-8</span></div>
            </div>
          </div>
        </TabPane>
        <TabPane tab={t['content.yaml.templates']} key="templates">
          <div className={styles.templates}><TemplateManager templates={templates} yamlFiles={yamlFiles} onApplyTemplate={handleApplyTemplate} onRefresh={fetchTemplates} /></div>
        </TabPane>
      </Tabs>

      {/* 新建文件对话框 */}
      <Modal
        title={t['content.yaml.createFile'] || '新建YAML文件'}
        open={createFileVisible}
        onOk={handleCreateFile}
        onCancel={() => {
          setCreateFileVisible(false)
          setNewFileName('')
          setNewFilePath('')
        }}
        okText={t['content.yaml.ok'] || '确定'}
        cancelText={t['content.yaml.cancel'] || '取消'}
      >
        <Form layout="vertical">
          <Form.Item
            label={t['content.yaml.fileName'] || '文件名'}
            required
          >
            <Input
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              placeholder={t['content.yaml.fileNamePlaceholder'] || '请输入文件名，例如：config.yml'}
            />
          </Form.Item>
          <Form.Item
            label={t['content.yaml.filePath'] || '文件路径'}
          >
            <Input
              value={newFilePath}
              onChange={e => setNewFilePath(e.target.value)}
              placeholder={t['content.yaml.filePathPlaceholder'] || '请输入文件路径，例如：themes/my-theme/'}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建模板对话框 */}
      <Modal
        title={t['content.yaml.createTemplate'] || '新建模板'}
        open={createTemplateVisible}
        onOk={handleCreateTemplate}
        onCancel={() => {
          setCreateTemplateVisible(false)
          setNewTemplateData({
            name: '',
            description: '',
            structure: {},
            variables: []
          })
        }}
        okText={t['content.yaml.ok'] || '确定'}
        cancelText={t['content.yaml.cancel'] || '取消'}
        width={700}
      >
        <Form layout="vertical">
          <Form.Item
            label={t['content.yaml.templateName'] || '模板名称'}
            required
          >
            <Input
              value={newTemplateData.name}
              onChange={e => setNewTemplateData({ ...newTemplateData, name: e.target.value })}
              placeholder={t['content.yaml.templateNamePlaceholder'] || '请输入模板名称'}
            />
          </Form.Item>
          <Form.Item
            label={t['content.yaml.templateDescription'] || '模板描述'}
          >
            <Input.TextArea
              value={newTemplateData.description}
              onChange={e => setNewTemplateData({ ...newTemplateData, description: e.target.value })}
              placeholder={t['content.yaml.templateDescriptionPlaceholder'] || '请输入模板描述'}
              rows={3}
            />
          </Form.Item>
          <Divider>{t['content.yaml.templateStructure'] || '模板结构'}</Divider>
          <Paragraph>
            {t['content.yaml.templateStructureDescription'] || '请在下方编辑器中输入模板的YAML结构，使用 ${变量名} 作为变量占位符。'}
          </Paragraph>
          <YamlEditor
            id="template-structure-editor"
            initialValue="# 示例模板结构\ntitle: ${title}\ndescription: ${description}\nitems:\n  - name: ${item1_name}\n    value: ${item1_value}\n  - name: ${item2_name}\n    value: ${item2_value}"
            height="200px"
            onChange={(value) => {
              try {
                setNewTemplateData({
                  ...newTemplateData,
                  structure: value
                })
              } catch (e) {
                console.error('Invalid YAML structure', e)
              }
            }}
          />
          <Divider>{t['content.yaml.templateVariables'] || '模板变量'}</Divider>
          <Form.List
            name="variables"
            initialValue={[{ name: '', description: '', type: 'string', default: '' }]}
          >
            {(fields, { add, remove }) => (
              <>
                {fields.map(field => (
                  <Row key={field.key} gutter={16}>
                    <Col span={6}>
                      <Form.Item
                        {...field}
                        label={t['content.yaml.variableName'] || '变量名'}
                        name={[field.name, 'name']}
                      >
                        <Input placeholder="title" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        {...field}
                        label={t['content.yaml.variableType'] || '类型'}
                        name={[field.name, 'type']}
                      >
                        <Select defaultValue="string">
                          <Option value="string">字符串</Option>
                          <Option value="number">数字</Option>
                          <Option value="boolean">布尔值</Option>
                          <Option value="array">数组</Option>
                          <Option value="object">对象</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        {...field}
                        label={t['content.yaml.variableDefault'] || '默认值'}
                        name={[field.name, 'default']}
                      >
                        <Input placeholder="默认值" />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item
                        {...field}
                        label={t['content.yaml.variableDescription'] || '描述'}
                        name={[field.name, 'description']}
                      >
                        <Input placeholder="变量描述" />
                      </Form.Item>
                    </Col>
                    <Col span={1} style={{ display: 'flex', alignItems: 'center', marginTop: 30 }}>
                      <DeleteOutlined onClick={() => remove(field.name)} />
                    </Col>
                  </Row>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                  >
                    {t['content.yaml.addVariable'] || '添加变量'}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </ManagementPage>
  )
}

export default YamlManager
