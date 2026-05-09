import React, { useContext, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Vditor from 'vditor'
import "vditor/src/assets/less/index.less"
import "./style/index.less"
import service from '@/utils/api'
import { GlobalContext } from '@/context'
import useLocale from '@/hooks/useLocale'
import useDeviceDetect from '@/hooks/useDeviceDetect'
import { Modal, Pagination, Image, Spin, Empty, Select, Row, Col, Card, Typography, Upload, Input, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import SelectionToolbar, { type SelectionActionType } from './SelectionToolbar'
import { aiChatStream } from '@/utils/aiService'
import { isAISConfigured } from '@/utils/aiSettings'

const { Text } = Typography
const { Option } = Select

interface HexoProVditorProps {
    initValue: string;
    handleChangeContent: (content: string) => void;
    handleUploadingImage: (isUploading: boolean) => void;
    onReady?: () => void;
}

// 添加上传结果接口
interface UploadResult {
    url?: string;
    path?: string;
    src?: string;
    msg?: string;
    code?: number;
}

interface MigrateItemResult extends UploadResult {
    success: boolean;
    sourceUrl: string;
}

// 图片项接口
interface ImageItem {
    name: string;
    path: string;
    url: string;
    size: number;
    lastModified: string;
}

// 文件夹数据接口
interface FolderData {
    images: ImageItem[];
    folders: string[];
    total: number;
    page: number;
    pageSize: number;
}

export default function HexoProVditor({ initValue, handleChangeContent, handleUploadingImage, onReady }: HexoProVditorProps) {
    // 'emoji', 'headings', 'bold', 'italic', 'strike', '|', 'line', 'quote', 'list', 'ordered-list', 'check', 'outdent', 'indent', 'code', 'inline-code', 'insert-after', 'insert-before', 'undo', 'redo', 'upload', 'link', 'table', 'edit-mode', 'preview', 'fullscreen', 'outline', 'export'
    const { isMobile } = useDeviceDetect() // 添加设备检测
    const [imagePickerVisible, setImagePickerVisible] = useState(false)
    const [imageData, setImageData] = useState<FolderData>({
        images: [],
        folders: [],
        total: 0,
        page: 1,
        pageSize: 12
    })
    const [currentImagePage, setCurrentImagePage] = useState(1)
    const [imagePageSize, setImagePageSize] = useState(isMobile ? 8 : 12)
    const [currentImageFolder, setCurrentImageFolder] = useState('')
    const [loadingImages, setLoadingImages] = useState(false)
    // 添加上传图片相关状态
    const [uploadModalVisible, setUploadModalVisible] = useState(false)
    const [isMigratingExternalImages, setIsMigratingExternalImages] = useState(false)
    const [uploadFolder, setUploadFolder] = useState('')
    const [uploadFileName, setUploadFileName] = useState('')
    const [storageType, setStorageType] = useState('local')
    const [availableStorages, setAvailableStorages] = useState<string[]>(['local'])
    const isLocal = storageType === 'local'
    const initValueRef = useRef(initValue)


    const t = useLocale()

    useEffect(() => {
        initValueRef.current = initValue
    }, [initValue])

    // 统一的 URL 处理：
    // - 远程图床一般已返回完整且已编码的绝对 URL，直接使用
    // - 本地仅返回相对路径，需要进行一次 encodeURI
    // - 若字符串已包含 %（可能已编码），避免再次编码
    function toMarkdownUrl(raw: string): string {
        if (!raw) return raw
        const isAbsolute = /^(?:https?:)?\/\//i.test(raw)
        const hasPercent = raw.includes('%')
        if (isAbsolute || hasPercent) return raw
        return encodeURI(raw)
    }

    // 修改上传图片函数，添加文件夹参数
    function uploadImage(image, filename, folder = '') {
        const promise = new Promise((f, r) => {
            service.post('/hexopro/api/images/upload', {
                data: image,
                filename: filename,
                folder: folder,
                storageType: storageTypeRef.current
            }).then(res => {
                f(res.data)
            }).catch(err => {
                r(err)
            })
        })
        return promise
    }

    const [vd, setVd] = useState(undefined)
    const vdRef = useRef<any>(null)
    const [isUploadingImage, setIsUPloadingImage] = useState(false)
    const isMigratingExternalImagesRef = useRef(false)

    const [isEditorFocus, setIsEditorFocus] = useState(false)

    // 选中文字浮动工具栏
    const [selectionToolbarVisible, setSelectionToolbarVisible] = useState(false)
    const [selectionToolbarPosition, setSelectionToolbarPosition] = useState({ top: 0, left: 0 })
    const [selectionToolbarFlipped, setSelectionToolbarFlipped] = useState(false)
    const [selectedText, setSelectedText] = useState('')
    const [selectionToolbarLoading, setSelectionToolbarLoading] = useState(false)
    const savedSelectionRangeRef = useRef<Range | null>(null)
    const selectionAbortRef = useRef<AbortController | null>(null)

    // AI 结果对话框
    const [aiResultVisible, _setAiResultVisible] = useState(false)
    const [aiResultContent, setAiResultContent] = useState('')
    const [aiResultReasoning, setAiResultReasoning] = useState('')
    const [aiResultReasoningExpanded, setAiResultReasoningExpanded] = useState(true)
    const [aiResultReasoningDurationMs, setAiResultReasoningDurationMs] = useState<number | undefined>(undefined)
    const [aiResultStreaming, _setAiResultStreaming] = useState(false)
    const aiReasoningStartAtRef = useRef<number | null>(null)
    const aiReasoningDurationSetRef = useRef(false)
    const lastActionTypeRef = useRef<SelectionActionType>('explain')
    const aiResultVisibleRef = useRef(false)
    const aiResultStreamingRef = useRef(false)
    const setAiResultVisible = (v: boolean) => {
        aiResultVisibleRef.current = v
        _setAiResultVisible(v)
    }
    const setAiResultStreaming = (v: boolean) => {
        aiResultStreamingRef.current = v
        _setAiResultStreaming(v)
    }

    // 从localStorage读取编辑器模式设置
    const [editorMode, setEditorMode] = useState(() => {
        return localStorage.getItem('hexoProEditorMode') || 'ir'
    })

    // 监听localStorage中编辑器模式的变化
    useEffect(() => {
        const handleStorageChange = () => {
            const newMode = localStorage.getItem('hexoProEditorMode') || 'ir'
            if (newMode !== editorMode) {
                setEditorMode(newMode)
            }
        }

        // 监听storage事件（其他窗口的localStorage变化）
        window.addEventListener('storage', handleStorageChange)

        // 每秒检查一次当前窗口的localStorage变化
        const interval = setInterval(handleStorageChange, 1000)

        return () => {
            window.removeEventListener('storage', handleStorageChange)
            clearInterval(interval)
        }
    }, [editorMode])

    const { theme, lang } = useContext(GlobalContext)


    function getLocale() {
        if (lang === 'zh-CN') {
            return 'zh_CN'
        } else {
            return 'en_US'
        }
    }

    function getVditorCdn() {
        const customCdn = localStorage.getItem('hexoProVditorCdn')?.trim()
        if (customCdn) {
            return customCdn.replace(/\/+$/, '')
        }
        return 'https://cdn.jsdelivr.net/npm/vditor@3.11.1'
    }

    // 使用 ref 确保异步回调读取到最新的图床类型
    const storageTypeRef = useRef(storageType)
    useEffect(() => { storageTypeRef.current = storageType }, [storageType])

    // 使用 ref 确保在粘贴上传（Vditor handler 闭包）中读取到最新的目录
    const uploadFolderRef = useRef(uploadFolder)
    const currentImageFolderRef = useRef(currentImageFolder)
    useEffect(() => { uploadFolderRef.current = uploadFolder }, [uploadFolder])
    useEffect(() => { currentImageFolderRef.current = currentImageFolder }, [currentImageFolder])

    // 挂载时同步一次后端的图床配置，确保默认图床与设置一致
    useEffect(() => {
        (async () => {
            try {
                const cfg = await service.get('/hexopro/api/images/config/get')
                const data = cfg?.data?.data || {}
                const storages: string[] = ['local']
                if (data.aliyun && (data.aliyun.bucket && (data.aliyun.domain || (data.aliyun.region && data.aliyun.accessKeyId && data.aliyun.accessKeySecret)))) {
                    storages.push('aliyun')
                }
                if (data.qiniu && (data.qiniu.bucket && data.qiniu.domain && data.qiniu.accessKey && data.qiniu.secretKey)) {
                    storages.push('qiniu')
                }
                if (data.tencent && (data.tencent.bucket && (data.tencent.domain || (data.tencent.region && data.tencent.secretId && data.tencent.secretKey)))) {
                    storages.push('tencent')
                }
                const unique = Array.from(new Set(storages))
                setAvailableStorages(unique)
                const backendDefault = data.type && unique.includes(data.type) ? data.type : 'local'
                setStorageType(backendDefault)
            } catch (_) { }
        })()
    }, [])

    // 切换图床类型时，清空已选择的上传/浏览目录，避免继续沿用旧图床目录
    useEffect(() => {
        setUploadFolder('')
        setCurrentImageFolder('')
        setCurrentImagePage(1)
    }, [storageType])

    // 获取图片列表
    const fetchImages = async () => {
        setLoadingImages(true)
        try {
            const res = await service.get('/hexopro/api/images/list', {
                params: {
                    page: currentImagePage,
                    pageSize: imagePageSize,
                    folder: currentImageFolder,
                    storageType
                }
            })
            setImageData(res.data)
        } catch (error) {
            console.error('获取图片列表失败', error)
        } finally {
            setLoadingImages(false)
        }
    }

    const fetchFolders = async () => {
        try {
            // 同步获取当前图床类型
            try {
                const cfg = await service.get('/hexopro/api/images/config/get')
                const data = cfg?.data?.data || {}
                const storages: string[] = ['local']
                if (data.aliyun && (data.aliyun.bucket && (data.aliyun.domain || (data.aliyun.region && data.aliyun.accessKeyId && data.aliyun.accessKeySecret)))) {
                    storages.push('aliyun')
                }
                if (data.qiniu && (data.qiniu.bucket && data.qiniu.domain && data.qiniu.accessKey && data.qiniu.secretKey)) {
                    storages.push('qiniu')
                }
                if (data.tencent && (data.tencent.bucket && (data.tencent.domain || (data.tencent.region && data.tencent.secretId && data.tencent.secretKey)))) {
                    storages.push('tencent')
                }
                const unique = Array.from(new Set(storages))
                setAvailableStorages(unique)
                // 如果当前选择不在可用列表中，回退到后端默认或 local
                if (!unique.includes(storageType)) {
                    const backendDefault = data.type && unique.includes(data.type) ? data.type : 'local'
                    setStorageType(backendDefault)
                }
            } catch (_) { }
            const res = await service.get('/hexopro/api/images/list', {
                params: {
                    page: 1,
                    pageSize: 1,
                    storageType
                }
            })
            if (res.data && res.data.folders) {
                setImageData(prevData => ({
                    ...prevData,
                    folders: res.data.folders
                }))
            }
        } catch (error) {
            console.error('获取文件夹列表失败', error)
        }
    }


    // 处理自定义上传
    const handleCustomUpload = async (file: File) => {
        if (!file) return

        setIsUPloadingImage(true)
        const reader = new FileReader()
        reader.readAsDataURL(file)

        reader.onload = async (event) => {
            try {
                // 处理SVG文件名问题
                let filename = uploadFileName || file.name
                // 确保SVG文件有正确的扩展名
                if (file.type === 'image/svg+xml' && !filename.toLowerCase().endsWith('.svg')) {
                    filename = filename.replace(/\.[^/.]+$/, '') + '.svg'
                }

                // 选择目标上传目录：优先使用上传弹窗选中的目录，否则使用图片选择器当前目录；避免上传到回收站
                let targetFolder = uploadFolderRef.current || currentImageFolderRef.current || ''
                if (String(targetFolder).toLowerCase().startsWith('trash')) targetFolder = ''

                const result = await uploadImage(event.target.result, filename, targetFolder) as UploadResult

                console.log('result', result)

                if (vd && result) {
                    // 统一处理 URL，避免重复编码
                    const srcRaw = storageTypeRef.current === 'local'
                        ? (result.path || result.src || result.url)
                        : (result.url || result.src || result.path)
                    const finalSrc = toMarkdownUrl(String(srcRaw))
                    vd.insertValue(`\n![${filename}](${finalSrc})\n`)
                    vd.tip(`${t['vditor.upload.success'] || '上传成功'}: ${filename}`, 3000)
                    // 强制编辑器重新渲染
                }

                setUploadModalVisible(false)
                setUploadFileName('')
            } catch (err) {
                vd?.tip(`${t['vditor.upload.error'] || '上传失败'}: ${err.message}`, 3000)
            } finally {
                setIsUPloadingImage(false)
                setTimeout(() => {
                    vd.setValue(vd.getValue())
                }, 600)
            }
        }
    }

    // 处理图片选择
    const handleSelectImage = (image: ImageItem) => {
        if (vd) {
            // 本地用 path，远程用 url
            const raw = storageType === 'local' ? (image.path || image.url) : (image.url || image.path)
            const finalSrc = toMarkdownUrl(String(raw))
            vd.insertValue(`\n![${image.name}](${finalSrc})\n`)
            setImagePickerVisible(false)
        }
    }

    const normalizeExternalImageUrl = (rawUrl: string): string => {
        return String(rawUrl || '')
            .trim()
            .replace(/^<|>$/g, '')
    }

    const extractExternalImageUrls = (content: string): string[] => {
        const urls = new Set<string>()
        const addUrl = (url: string) => {
            const normalized = normalizeExternalImageUrl(url)
            if (/^https?:\/\//i.test(normalized)) {
                urls.add(normalized)
            }
        }

        const markdownImageRegex = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
        let mdMatch: RegExpExecArray | null = null
        while ((mdMatch = markdownImageRegex.exec(content)) !== null) {
            addUrl(mdMatch[1])
        }

        const htmlImageRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi
        let htmlMatch: RegExpExecArray | null = null
        while ((htmlMatch = htmlImageRegex.exec(content)) !== null) {
            addUrl(htmlMatch[1])
        }

        return Array.from(urls)
    }

    const replaceMigratedImageUrls = (content: string, urlMap: Map<string, string>): string => {
        if (!urlMap.size) return content

        const replaceUrl = (rawUrl: string): string => {
            const normalized = normalizeExternalImageUrl(rawUrl)
            return urlMap.get(normalized) || rawUrl
        }

        let output = content.replace(/!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (match, url) => {
            const replaced = replaceUrl(String(url))
            return replaced === url ? match : match.replace(url, replaced)
        })

        output = output.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, url) => {
            const replaced = replaceUrl(String(url))
            return replaced === url ? match : match.replace(url, replaced)
        })

        return output
    }

    const handleMigrateExternalImages = async () => {
        const editor = vdRef.current
        if (!editor || isMigratingExternalImagesRef.current) return

        const currentValue = editor.getValue()
        const externalUrls = extractExternalImageUrls(currentValue)

        if (!externalUrls.length) {
            message.info(t['vditor.migrateExternalImages.none'] || '当前内容中未发现外链图片')
            return
        }

        let targetFolder = uploadFolderRef.current || currentImageFolderRef.current || ''
        if (String(targetFolder).toLowerCase().startsWith('trash')) targetFolder = ''

        setIsMigratingExternalImages(true)
        const hide = message.loading({
            content: `${t['vditor.migrateExternalImages.loading'] || '正在转存外链图片...'} (${externalUrls.length})`,
            duration: 0
        })

        try {
            const response: any = await service.post('/hexopro/api/images/migrate', {
                urls: externalUrls,
                folder: targetFolder,
                storageType: storageTypeRef.current
            })

            const items: MigrateItemResult[] = Array.isArray(response?.data?.items) ? response.data.items : []
            if (!items.length) {
                throw new Error(t['vditor.migrateExternalImages.allFailed'] || '没有可替换的图片')
            }

            const urlMap = new Map<string, string>()
            let failedCount = 0
            items.forEach((item) => {
                if (!item || !item.sourceUrl) return
                if (!item.success) {
                    failedCount += 1
                    return
                }

                const srcRaw = storageTypeRef.current === 'local'
                    ? (item.path || item.src || item.url)
                    : (item.url || item.src || item.path)

                if (!srcRaw) {
                    failedCount += 1
                    return
                }

                urlMap.set(normalizeExternalImageUrl(item.sourceUrl), toMarkdownUrl(String(srcRaw)))
            })

            const successCount = urlMap.size
            if (!successCount) {
                message.error(t['vditor.migrateExternalImages.allFailed'] || '未成功转存任何图片')
                return
            }

            const nextValue = replaceMigratedImageUrls(currentValue, urlMap)
            editor.setValue(nextValue)
            handleChangeContent(nextValue)

            if (failedCount > 0) {
                message.warning(`${t['vditor.migrateExternalImages.partial'] || '部分图片转存失败'} (${successCount}/${externalUrls.length})`)
            } else {
                message.success(`${t['vditor.migrateExternalImages.success'] || '外链图片转存完成'} (${successCount})`)
            }
        } catch (err: any) {
            const msg = err?.message ? `: ${err.message}` : ''
            message.error(`${t['vditor.migrateExternalImages.failed'] || '外链图片转存失败'}${msg}`)
        } finally {
            if (typeof hide === 'function') hide()
            setIsMigratingExternalImages(false)
        }
    }

    // 处理页面变化
    const handleImagePageChange = (page: number, pageSize?: number) => {
        setCurrentImagePage(page)
        if (pageSize) setImagePageSize(pageSize)
    }

    // 处理文件夹变化
    const handleImageFolderChange = (folder: string) => {
        setCurrentImageFolder(folder)
        setCurrentImagePage(1)
    }

    // 格式化文件大小
    const formatFileSize = (size: number) => {
        if (size < 1024) {
            return `${size} B`
        } else if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(2)} KB`
        } else {
            return `${(size / 1024 / 1024).toFixed(2)} MB`
        }
    }

    useEffect(() => {
        if (uploadModalVisible) {
            fetchFolders()
        }
    }, [uploadModalVisible])


    // 当图片选择器打开或分页/文件夹/图床变化时，仅加载图片
    useEffect(() => {
        if (imagePickerVisible) {
            fetchImages()
        }
    }, [imagePickerVisible, currentImagePage, imagePageSize, currentImageFolder, storageType])

    // 仅在首次/每次打开图片选择器时获取一次可用图床与文件夹
    useEffect(() => {
        if (imagePickerVisible) {
            fetchFolders()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imagePickerVisible])

    useEffect(() => {
        handleUploadingImage(isUploadingImage)
    }, [isUploadingImage, handleUploadingImage])

    useEffect(() => {
        isMigratingExternalImagesRef.current = isMigratingExternalImages
    }, [isMigratingExternalImages])

    useEffect(() => {
        // console.log('theme', theme)
        if (vd) {
            // console.log('theme111', theme)
            vd.setTheme(theme === 'dark' ? 'dark' : 'classic', theme === 'dark' ? 'dark' : 'light', theme === 'dark' ? 'native' : 'xcode')
        }
    }, [vd, theme])

    useEffect(() => {
        if (vd) {
            const toolbar = document.querySelector('.vditor-toolbar') as HTMLElement
            const vditorElement = document.getElementById('vditor') as HTMLElement
            if (toolbar && vditorElement) {
                toolbar.style.width = `${vditorElement.clientWidth}px !important`
            }

            const resizeHandler = () => {
                if (toolbar && vditorElement) {
                    toolbar.style.width = `${vditorElement.clientWidth}px`
                }
            }

            window.addEventListener('resize', resizeHandler)

            // 返回销毁逻辑
            return () => {
                window.removeEventListener('resize', resizeHandler)
            }
        }
    }, [vd])

    useEffect(() => {
        if (vd) {
            const nextValue = typeof initValue === 'string' ? initValue : ''
            const currentValue = vd.getValue()
            if (currentValue === nextValue) {
                return
            }

            // 编辑中不强制覆盖内容，避免光标抖动和失焦
            const editorRoot = document.getElementById('vditor')
            const isEditing = !!editorRoot?.contains(document.activeElement)
            if (isEditing) {
                return
            }

            vd.setValue(nextValue)
        }
    }, [vd, initValue])

    // 选中文字时显示浮动工具栏
    useEffect(() => {
        if (!vd) return
        const root = document.getElementById('vditor') as HTMLElement
        if (!root) return

        const closeToolbarAndResult = () => {
            selectionAbortRef.current?.abort()
            setAiResultVisible(false)
            setAiResultContent('')
            setAiResultReasoning('')
            setAiResultReasoningExpanded(true)
            setAiResultReasoningDurationMs(undefined)
            setAiResultStreaming(false)
            aiReasoningStartAtRef.current = null
            aiReasoningDurationSetRef.current = false
            setSelectionToolbarLoading(false)
            setSelectionToolbarVisible(false)
        }

        const showToolbarForSelection = () => {
            const sel = window.getSelection()
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                setSelectionToolbarVisible(false)
                return
            }
            const range = sel.getRangeAt(0)
            if (!root.contains(range.commonAncestorContainer)) {
                setSelectionToolbarVisible(false)
                return
            }
            const text = sel.toString().trim()
            if (!text) {
                setSelectionToolbarVisible(false)
                return
            }
            const rect = range.getBoundingClientRect()
            const spaceBelow = window.innerHeight - rect.bottom
            const needFlip = spaceBelow < 320
            setSelectionToolbarFlipped(needFlip)
            setSelectionToolbarPosition({
                top: needFlip ? rect.top : rect.bottom + 6,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 420)),
            })
            setSelectedText(text)
            savedSelectionRangeRef.current = range.cloneRange()
            setSelectionToolbarVisible(true)
        }

        const handleMouseUp = () => {
            if (!aiResultVisibleRef.current) {
                showToolbarForSelection()
                return
            }
            // AI 已生成完成，直接关闭并重新显示工具栏
            if (!aiResultStreamingRef.current) {
                closeToolbarAndResult()
                showToolbarForSelection()
                return
            }
            // AI 正在生成中，弹窗确认是否放弃
            Modal.confirm({
                title: t['selectionToolbar.confirmAbort.title'] || '放弃 AI 回复',
                content: t['selectionToolbar.confirmAbort.content'] || 'AI 正在生成中，是否放弃当前回复？',
                okText: t['universal.confirm'] || '确定',
                cancelText: t['universal.cancel'] || '取消',
                onOk: () => {
                    closeToolbarAndResult()
                    showToolbarForSelection()
                },
            })
        }

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (target?.closest?.('.vditor-selection-toolbar')) return
            if (target?.closest?.('#vditor')) return
            if (aiResultVisibleRef.current) return
            setSelectionToolbarVisible(false)
        }

        root.addEventListener('mouseup', handleMouseUp)
        document.addEventListener('mousedown', handleClickOutside, true)
        return () => {
            root.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('mousedown', handleClickOutside, true)
        }
    }, [vd])

    // 用 AI 结果替换选区：优先 DOM 替换，失败时用全文替换
    const replaceSelectionWithText = (result: string) => {
        if (!vd) return
        const range = savedSelectionRangeRef.current
        const fullValue = vd.getValue()
        if (range && range.startContainer && document.getElementById('vditor')?.contains(range.startContainer)) {
            try {
                range.deleteContents()
                const textNode = document.createTextNode(result)
                range.insertNode(textNode)
                range.collapse(false)
                range.setStartAfter(textNode)
                range.setEndAfter(textNode)
                const sel = window.getSelection()
                if (sel) {
                    sel.removeAllRanges()
                    sel.addRange(range)
                }
                handleChangeContent(vd.getValue())
                return
            } catch (_) {
                /* fallback */
            }
        }
        const idx = fullValue.indexOf(selectedText)
        if (idx !== -1) {
            const newValue = fullValue.slice(0, idx) + result + fullValue.slice(idx + selectedText.length)
            vd.setValue(newValue)
            handleChangeContent(newValue)
        } else {
            vd.insertValue(result)
            handleChangeContent(vd.getValue())
        }
    }

    const getSelectionSystemPrompt = (type: SelectionActionType): string => {
        const prompts: Record<SelectionActionType, string> = {
            explain: '你是一个助手。用户会发送一段选中的文本，请用简洁清晰的语言解释其含义或背景。只输出解释内容，不要加前缀。',
            polish: '你是一个写作助手。用户会发送一段文本，请在不改变原意的前提下润色表达，使语句更通顺、得体。只输出润色后的文本，不要加任何说明。',
            expand: '你是一个写作助手。用户会发送一段文本，请在保持原意的前提下适度扩写，使内容更丰富。只输出扩写后的文本，不要加任何说明。',
            translate: '你是一个翻译助手。用户会发送一段中文或英文文本，请翻译成另一种语言（中文↔英文）。只输出译文，不要加任何说明。',
            suggest: '你是一个写作助手。用户会发送一段文本，请给出简短的改进建议或可扩展的方向（几条即可）。只输出建议内容。',
        }
        return prompts[type] ?? prompts.explain
    }

    const runAIAction = async (type: SelectionActionType, text: string) => {
        if (!text?.trim() || !vd) return
        if (!(await isAISConfigured())) {
            message.warning(t['ai.notConfigured'] || '请先在设置中配置 AI')
            return
        }
        selectionAbortRef.current?.abort()
        selectionAbortRef.current = new AbortController()
        lastActionTypeRef.current = type
        setSelectionToolbarLoading(true)
        setAiResultVisible(true)
        setAiResultContent('')
        setAiResultReasoning('')
        setAiResultReasoningExpanded(true)
        setAiResultReasoningDurationMs(undefined)
        setAiResultStreaming(true)
        aiReasoningStartAtRef.current = null
        aiReasoningDurationSetRef.current = false
        try {
            for await (const chunk of aiChatStream(
                [
                    { role: 'system', content: getSelectionSystemPrompt(type) },
                    { role: 'user', content: text },
                ],
                (c) => {
                    if (c.reasoning) {
                        flushSync(() => {
                            if (!aiReasoningStartAtRef.current) {
                                aiReasoningStartAtRef.current = Date.now()
                            }
                            setSelectionToolbarLoading(false)
                            setAiResultReasoningExpanded(true)
                            setAiResultReasoning(prev => prev + c.reasoning)
                        })
                    }
                    if (c.content) {
                        flushSync(() => {
                            setSelectionToolbarLoading(false)
                            if (aiReasoningStartAtRef.current && !aiReasoningDurationSetRef.current) {
                                aiReasoningDurationSetRef.current = true
                                setAiResultReasoningDurationMs(Date.now() - aiReasoningStartAtRef.current)
                                setAiResultReasoningExpanded(false)
                            }
                            setAiResultContent(prev => prev + c.content)
                        })
                    }
                },
                selectionAbortRef.current.signal
            )) {
                if (chunk.done) {
                    if (aiReasoningStartAtRef.current && !aiReasoningDurationSetRef.current) {
                        aiReasoningDurationSetRef.current = true
                        setAiResultReasoningDurationMs(Date.now() - aiReasoningStartAtRef.current)
                        setAiResultReasoningExpanded(false)
                    }
                    break
                }
            }
            setSelectionToolbarLoading(false)
            setAiResultStreaming(false)
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                const errMsg = err?.message ? `: ${err.message}` : ''
                message.error(`${t['ai.error'] || 'AI 响应错误'}${errMsg}`)
            }
            setSelectionToolbarLoading(false)
            setAiResultStreaming(false)
        }
    }

    const handleSelectionToolbarAction = (type: SelectionActionType) => {
        runAIAction(type, selectedText)
    }

    const handleAIResultInsert = () => {
        const trimmed = aiResultContent.trim()
        if (trimmed) replaceSelectionWithText(trimmed)
        setAiResultVisible(false)
        setAiResultContent('')
        setAiResultReasoning('')
        setAiResultReasoningExpanded(true)
        setAiResultReasoningDurationMs(undefined)
        setSelectionToolbarVisible(false)
        aiReasoningStartAtRef.current = null
        aiReasoningDurationSetRef.current = false
    }

    const handleAIResultRetry = () => {
        runAIAction(lastActionTypeRef.current, selectedText)
    }

    const handleAIResultClose = () => {
        selectionAbortRef.current?.abort()
        setAiResultVisible(false)
        setAiResultContent('')
        setAiResultReasoning('')
        setAiResultReasoningExpanded(true)
        setAiResultReasoningDurationMs(undefined)
        setAiResultStreaming(false)
        aiReasoningStartAtRef.current = null
        aiReasoningDurationSetRef.current = false
        setSelectionToolbarLoading(false)
    }

    useEffect(() => {
        const vditor = new Vditor('vditor', {
            mode: editorMode as 'ir' | 'wysiwyg' | 'sv', // 设置编辑器模式
            cdn: getVditorCdn(),
            placeholder: t['editor.content.placeholder'] || 'Start writing here. You can paste text or drag images directly.',
            cache: {
                enable: true
            },
            preview: {
                markdown: {
                    autoSpace: true
                }
            },
            keydown(event) {
                if (event.shiftKey && event.key === 'Tab') {
                    // 阻止默认行为
                    event.preventDefault()
                    // 去除前方的空格如果前方大于4个空格则最多删除4个空格
                    const selection = window.getSelection()
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0)
                        const startContainer = range.startContainer
                        const parentElement = startContainer.parentElement
                        if (parentElement && (parentElement.tagName === 'P' || parentElement.tagName === 'SPAN')) {
                            const currentContent = parentElement.textContent
                            const cursorPosition = range.startOffset
                            console.log('parentElement', currentContent.slice(cursorPosition - 24, cursorPosition))
                            console.log('parentElement', cursorPosition, cursorPosition - 24)
                            if (currentContent.slice(cursorPosition - 24, cursorPosition) === '&nbsp;&nbsp;&nbsp;&nbsp;') {
                                const newContent = currentContent.slice(0, cursorPosition - 24) + currentContent.slice(cursorPosition)
                                parentElement.textContent = newContent
                                // 保存光标位置
                                const newCursorPosition = cursorPosition - 24

                                // 重新选中编辑器并恢复光标位置
                                handleChangeContent(vditor.getValue())
                                range.setStart(parentElement.firstChild, newCursorPosition) // 设置新的光标位置
                                range.collapse(true)
                                selection.removeAllRanges() // 清除所有选区
                                selection.addRange(range) // 重新选中编辑器并恢复光标位置
                            }
                        }
                    }
                    return
                }
                if (!event.shiftKey && event.key === 'Tab') {
                    event.preventDefault() // 阻止默认行为

                    const selection = window.getSelection()

                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0)
                        const startContainer = range.startContainer
                        const parentElement = startContainer.parentElement

                        if (parentElement && (parentElement.tagName === 'P' || parentElement.tagName === 'SPAN')) {
                            // 插入4个空格
                            const spaces = '&nbsp;&nbsp;&nbsp;&nbsp;'

                            const currentContent = parentElement.textContent // 使用textContent而不是innerHTML
                            const cursorPosition = range.startOffset

                            // 插入空格
                            const newContent = currentContent.slice(0, cursorPosition) + spaces + currentContent.slice(cursorPosition)
                            parentElement.textContent = newContent

                            // 保存光标位置
                            const newCursorPosition = cursorPosition + 24

                            // 重新选中编辑器并恢复光标位置
                            handleChangeContent(vditor.getValue())
                            range.setStart(parentElement.firstChild, newCursorPosition) // 设置新的光标位置
                            range.collapse(true)

                            selection.removeAllRanges() // 清除所有选区
                            selection.addRange(range) // 重新选中编辑器并恢复光标位置
                        }
                    }
                }
            },
            fullscreen: {
                index: 9999
            },
            lang: getLocale(),
            theme: 'classic',
            height: '100%',
            width: '100%',
            toolbarConfig: {
                pin: true
            },
            after: () => {
                // 设置初始值
                if (typeof initValueRef.current === 'string') {
                    vditor.setValue(initValueRef.current)
                }
                // 固定toolbar
                const toolbar = document.querySelector('.vditor-toolbar') as HTMLElement
                const vditorElement = document.getElementById('vditor') as HTMLElement
                if (toolbar && vditorElement) {
                    toolbar.style.width = `${vditorElement.clientWidth}px !important`
                    toolbar.classList.add('vditor-toolbar--pin')

                    // 为移动设备添加专用样式
                    if (isMobile) {
                        vditorElement.classList.add('vditor-mobile')
                        toolbar.classList.add('vditor-toolbar-mobile')

                        // 移动设备下优化工具栏布局
                        const toolbarItems = toolbar.querySelectorAll('.vditor-toolbar__item')
                        toolbarItems.forEach((item) => {
                            (item as HTMLElement).style.margin = '2px'
                        })
                    }
                }

                const content = document.querySelector('vditor-content') as HTMLElement
                const editorHeader = document.querySelector('.editor-header') as HTMLElement

                if (content && toolbar && editorHeader) {
                    // console.log('走到这里了')
                    content.style.cssText = `margin-top: ${toolbar.clientHeight + editorHeader.clientHeight}px !important;`
                }

                window.addEventListener('resize', () => {
                    if (toolbar && vditorElement) {
                        toolbar.style.width = `${vditorElement.clientWidth}px`
                        if (content) {
                            content.style.marginTop = `${toolbar.clientHeight + editorHeader.clientHeight}px !important;`
                        }
                    }
                })
                vdRef.current = vditor
                setVd(vditor)
                onReady?.()

                // 统一处理编辑区域内图片/链接点击：
                // - 本地图床使用相对路径，点击时补齐为绝对 URL 再打开
                // - 过滤异常的 'https:'、'http:' 这类不完整 URL
                const root = document.getElementById('vditor') as HTMLElement
                const clickHandler = (ev: MouseEvent) => {
                    const target = ev.target as HTMLElement
                    if (!target) return
                    const openAbs = (raw: string) => {
                        if (!raw) return
                        // 跳过不完整 scheme
                        if (/^https?:$/i.test(raw)) return
                        // 完整绝对
                        if (/^(?:https?:)?\/\//i.test(raw)) {
                            window.open(raw, '_blank')
                            return
                        }
                        // 相对路径 → 当前站点
                        try {
                            const abs = new URL(raw, window.location.origin).toString()
                            window.open(abs, '_blank')
                        } catch (_) { }
                    }
                    // 处理 <img>
                    if (target.tagName === 'IMG') {
                        const src = (target as HTMLImageElement).getAttribute('src') || ''
                        if (src) {
                            ev.preventDefault()
                            ev.stopPropagation()
                            openAbs(src)
                        }
                        return
                    }
                    // 处理 <a>
                    if (target.tagName === 'A') {
                        const href = (target as HTMLAnchorElement).getAttribute('href') || ''
                        if (href && !/^(?:https?:)?\/\//i.test(href) && !/^#/.test(href)) {
                            ev.preventDefault()
                            ev.stopPropagation()
                            openAbs(href)
                        }
                    }
                }
                if (root) root.addEventListener('click', clickHandler, true)
                // 清理
                return () => {
                    if (root) root.removeEventListener('click', clickHandler, true)
                }
            },
            focus: (v: string) => {
                setIsEditorFocus(true)
            },
            blur: (v) => {
                setIsEditorFocus(false)
            },
            upload: {
                url: '/api/upload/disabled', // 设置一个不存在的URL，禁用原生上传
                multiple: true,
                handler: (files: File[]): Promise<string | null> => {
                    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml']

                    const filteredFiles = files.filter(file => allowedTypes.includes(file.type))
                    for (const file of files) {
                        if (!allowedTypes.includes(file.type)) {
                            vditor.tip(`${t['vditor.upload.invalidFileType']}: ${file.name}`, 2000)
                        }
                    }

                    for (const file of filteredFiles) {
                        setIsUPloadingImage(true)
                        const reader = new FileReader()
                        reader.onload = (event) => {
                            // 处理SVG文件名问题
                            let filename = file.name
                            // 确保SVG文件有正确的扩展名
                            if (file.type === 'image/svg+xml' && !filename.toLowerCase().endsWith('.svg')) {
                                filename = filename.replace(/\.[^/.]+$/, '') + '.svg'
                            }

                            // 避免文件名冲突：为粘贴上传的文件名追加时间戳后缀
                            const lastDot = filename.lastIndexOf('.')
                            const nameWithoutExt = lastDot > 0 ? filename.slice(0, lastDot) : filename
                            const ext = lastDot > 0 ? filename.slice(lastDot) : ''
                            const uniqueName = `${nameWithoutExt}_${Date.now()}${ext}`

                            // 粘贴图片上传到当前选择的目录：优先上传弹窗选项，否则为图片选择器当前目录（默认为根目录）
                            let targetFolder = uploadFolderRef.current || currentImageFolderRef.current || ''
                            if (String(targetFolder).toLowerCase().startsWith('trash')) targetFolder = ''
                            uploadImage(event.target.result, uniqueName, targetFolder).then((res: UploadResult) => {
                                res['code'] = 0

                                setTimeout(() => {
                                    const currentValue = vditor.getValue()
                                    // 统一处理 URL，避免重复编码
                                    const raw = storageTypeRef.current === 'local'
                                        ? (res.path || res.src || res.url)
                                        : (res.url || res.src || res.path)
                                    const encodedSrc = toMarkdownUrl(String(raw))
                                    if (isEditorFocus) {
                                        vditor.setValue(currentValue + `\n![${uniqueName}](${encodedSrc})`)
                                    } else {
                                        vditor.insertValue(`\n![${uniqueName}](${encodedSrc})`)
                                    }
                                    // 重新渲染编辑器内容（如果需要）
                                    vditor.tip(`${t['vditor.upload.success']}: ${uniqueName}`, 3000)
                                }, 600)
                                return null
                            }).catch((err) => {
                                vditor.tip(`${t['vditor.upload.error']}: ${err.message}`, 3000)
                                return err
                            }).finally(() => {
                                setIsUPloadingImage(false)
                            })
                        }
                        reader.readAsDataURL(file)
                    }
                    return null // 确保函数返回一个值
                }
            },
            input: (_) => {
                handleChangeContent(vditor.getValue())
            },
            toolbar: isMobile ? [
                // 移动设备上使用简化的工具栏
                {
                    name: 'headings'
                },
                {
                    name: 'bold'
                },
                {
                    name: 'italic'
                },
                {
                    name: 'strike'
                },
                {
                    name: 'line'
                },
                {
                    name: 'quote'
                },
                {
                    name: 'list'
                },
                {
                    name: 'ordered-list'
                },
                {
                    name: 'check'
                },
                {
                    name: 'code',
                    hotkey: 'Ctrl-E'
                },
                {
                    name: 'custom-upload', // 修改名称，避免与原生upload冲突
                    tip: t['vditor.upload'] || '上传',
                    icon: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M512 928c-28.928 0-52.416-23.488-52.416-52.416V547.072H336.96c-18.944 0-36.096-10.112-45.376-26.56-9.28-16.448-8.544-36.224 1.92-52.032L468.48 218.624C477.952 203.84 494.88 195.584 512 195.584c17.12 0 34.048 8.256 43.52 23.04l174.976 249.856c10.464 15.808 11.2 35.584 1.92 52.032-9.28 16.448-26.432 26.56-45.376 26.56H564.416v328.512c0 28.928-23.488 52.416-52.416 52.416z" fill="currentColor"></path></svg>',
                    click() {
                        // 点击上传按钮时打开上传模态框
                        setUploadModalVisible(true)
                    }
                },
                // 添加图床选择按钮
                {
                    name: 'select-image',
                    tip: t['vditor.selectImage'] || '从图床选择',
                    icon: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M896 0H128C57.6 0 0 57.6 0 128v768c0 70.4 57.6 128 128 128h768c70.4 0 128-57.6 128-128V128c0-70.4-57.6-128-128-128zm0 896H128V128h768v768z"></path><path d="M288 384c53 0 96-43 96-96s-43-96-96-96-96 43-96 96 43 96 96 96zm0-128c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zM704 576l-128-128-256 256-64-64L128 768h768z"></path></svg>',
                    click() {
                        setImagePickerVisible(true)
                    }
                },
                {
                    name: 'migrate-external-images',
                    tip: t['vditor.migrateExternalImages'] || '一键转存外链图片',
                    icon: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M896 224H453.12l83.008-83.008a31.936 31.936 0 0 0-45.248-45.248L354.24 232.384a32 32 0 0 0 0 45.248l136.64 136.64a31.936 31.936 0 1 0 45.248-45.248L453.12 288H896a32 32 0 1 0 0-64zM533.12 609.728a31.936 31.936 0 1 0-45.248 45.248L570.88 736H128a32 32 0 1 0 0 64h442.88l-83.008 83.008a31.936 31.936 0 1 0 45.248 45.248l136.64-136.64a32 32 0 0 0 0-45.248l-136.64-136.64z"></path></svg>',
                    click() {
                        if (isMigratingExternalImagesRef.current) return
                        handleMigrateExternalImages()
                    }
                },
                {
                    name: 'preview',
                    className: 'toolbar-right'
                }
            ] : [
                // 桌面设备使用完整工具栏
                {
                    name: 'emoji'
                },
                {
                    name: 'headings'
                },
                {
                    name: 'bold'
                },
                {
                    name: 'italic'
                },
                {
                    name: 'strike'
                },
                {
                    name: 'line'
                },
                {
                    name: 'quote'
                },
                {
                    name: 'list'
                },
                {
                    name: 'ordered-list'
                },
                {
                    name: 'check'
                },
                {
                    name: 'outdent'
                },
                {
                    name: 'indent'
                },
                {
                    name: 'code',
                    hotkey: 'Ctrl-E'
                },
                {
                    name: 'inline-code'
                },
                {
                    name: 'insert-after'
                },
                {
                    name: 'insert-before'
                },
                {
                    name: 'undo'
                },
                {
                    name: 'redo'
                },
                {
                    name: 'custom-upload', // 修改名称，避免与原生upload冲突
                    tip: t['vditor.upload'] || '上传',
                    icon: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M512 928c-28.928 0-52.416-23.488-52.416-52.416V547.072H336.96c-18.944 0-36.096-10.112-45.376-26.56-9.28-16.448-8.544-36.224 1.92-52.032L468.48 218.624C477.952 203.84 494.88 195.584 512 195.584c17.12 0 34.048 8.256 43.52 23.04l174.976 249.856c10.464 15.808 11.2 35.584 1.92 52.032-9.28 16.448-26.432 26.56-45.376 26.56H564.416v328.512c0 28.928-23.488 52.416-52.416 52.416z" fill="currentColor"></path></svg>',
                    click() {
                        // 点击上传按钮时打开上传模态框
                        setUploadModalVisible(true)
                    }
                },
                // 添加图床选择按钮
                {
                    name: 'select-image',
                    tip: t['vditor.selectImage'] || '从图床选择',
                    icon: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M896 0H128C57.6 0 0 57.6 0 128v768c0 70.4 57.6 128 128 128h768c70.4 0 128-57.6 128-128V128c0-70.4-57.6-128-128-128zm0 896H128V128h768v768z"></path><path d="M288 384c53 0 96-43 96-96s-43-96-96-96-96 43-96 96 43 96 96 96zm0-128c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zM704 576l-128-128-256 256-64-64L128 768h768z"></path></svg>',
                    click() {
                        setImagePickerVisible(true)
                    }
                },
                {
                    name: 'migrate-external-images',
                    tip: t['vditor.migrateExternalImages'] || '一键转存外链图片',
                    icon: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M896 224H453.12l83.008-83.008a31.936 31.936 0 0 0-45.248-45.248L354.24 232.384a32 32 0 0 0 0 45.248l136.64 136.64a31.936 31.936 0 1 0 45.248-45.248L453.12 288H896a32 32 0 1 0 0-64zM533.12 609.728a31.936 31.936 0 1 0-45.248 45.248L570.88 736H128a32 32 0 1 0 0 64h442.88l-83.008 83.008a31.936 31.936 0 1 0 45.248 45.248l136.64-136.64a32 32 0 0 0 0-45.248l-136.64-136.64z"></path></svg>',
                    click() {
                        if (isMigratingExternalImagesRef.current) return
                        handleMigrateExternalImages()
                    }
                },
                {
                    name: 'link'
                },
                {
                    name: 'table'
                },
                {
                    name: 'edit-mode',
                },
                {
                    name: 'preview',
                    className: 'toolbar-right'
                },
                {
                    name: 'fullscreen',
                    className: 'toolbar-right',
                    click() {
                        const toolbar = document.querySelector('.vditor-toolbar') as HTMLElement
                        const vditorElement = document.getElementById('vditor') as HTMLElement
                        if (toolbar && vditorElement) {
                            toolbar.style.width = `${vditorElement.clientWidth}px`
                        }
                    }
                },
                {
                    name: 'outline',
                    className: 'toolbar-right'
                },
                {
                    name: 'export',
                    className: 'toolbar-right'
                }
            ]
        })
        return () => {
            vditor.destroy()
            vdRef.current = null
            setVd(undefined)
        }
    }, [lang, isMobile, editorMode, onReady]) // 避免输入时因 initValue 变化重建编辑器

    return (
        <div id='vditorWapper' style={{ width: '100%', height: '100%', flex: 1, borderRadius: '0px' }}>
            <div
                style={{ width: '100%', height: '100%' }}
                id='vditor'
                className='vditor'>
            </div>

            {/* 选中文字浮动工具栏 */}
            <div className="vditor-selection-toolbar">
                <SelectionToolbar
                    visible={selectionToolbarVisible}
                    position={selectionToolbarPosition}
                    flipped={selectionToolbarFlipped}
                    selectedText={selectedText}
                    loading={selectionToolbarLoading}
                    dark={theme === 'dark'}
                    onAction={handleSelectionToolbarAction}
                    aiResultVisible={aiResultVisible}
                    aiResultContent={aiResultContent}
                    aiResultReasoning={aiResultReasoning}
                    aiResultReasoningExpanded={aiResultReasoningExpanded}
                    aiResultReasoningDurationMs={aiResultReasoningDurationMs}
                    aiResultStreaming={aiResultStreaming}
                    onToggleReasoning={() => setAiResultReasoningExpanded(v => !v)}
                    onInsert={handleAIResultInsert}
                    onRetry={handleAIResultRetry}
                    onCloseResult={handleAIResultClose}
                />
            </div>

            {/* 图片选择模态框 */}
            <Modal
                title={t['vditor.selectImage'] || '从图床选择图片'}
                open={imagePickerVisible}
                onCancel={() => setImagePickerVisible(false)}
                footer={null}
                width={isMobile ? '95%' : 800}
                className="image-picker-modal"
            >
                <div className="image-picker-container">
                    <div className="folder-selector" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text strong>{t['content.images.currentFolder'] || '当前文件夹'}:</Text>
                        <Select
                            style={{ width: isMobile ? 200 : 300, marginLeft: 8 }}
                            value={currentImageFolder}
                            onChange={handleImageFolderChange}
                            placeholder={t['content.images.selectFolder'] || '选择文件夹'}
                        >
                            <Option value="">{t['content.images.rootFolder'] || '根目录'}</Option>
                            {imageData.folders.map(folder => (
                                <Option key={folder} value={folder}>{folder}</Option>
                            ))}
                        </Select>

                        <div style={{ flex: 1 }} />
                        <Text strong>{t['content.images.storageType'] || '图床'}:</Text>
                        <Select
                            style={{ width: isMobile ? 140 : 180 }}
                            value={storageType}
                            onChange={(v) => { setStorageType(v); setCurrentImagePage(1) }}
                        >
                            {availableStorages.map(s => (
                                <Option key={s} value={s}>{s}</Option>
                            ))}
                        </Select>
                    </div>

                    <Spin spinning={loadingImages}>
                        {imageData.images.length > 0 ? (
                            <Row gutter={[16, 16]} className="image-grid">
                                {imageData.images.map(image => (
                                    <Col xs={12} sm={8} md={6} lg={6} xl={4} key={image.path}>
                                        <Card
                                            hoverable
                                            cover={
                                                <div className="image-container" onClick={() => handleSelectImage(image)}>
                                                    <Image
                                                        src={storageType === 'local' ? image.path : image.url}
                                                        alt={image.name}
                                                        preview={false}
                                                        fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3PTWBSGcbGzM6GCKqlIBRV0dHRJFarQ0eUT8LH4BnRU0NHR0UEFVdIlFRV7TzRksomPY8uykTk/zewQfKw/9znv4yvJynLv4uLiV2dBoDiBf4qP3/ARuCRABEFAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghgg0Aj8i0JO4OzsrPv69Wv+hi2qPHr0qNvf39+iI97soRIh4f3z58/u7du3SXX7Xt7Z2enevHmzfQe+oSN2apSAPj09TSrb+XKI/f379+08+A0cNRE2ANkupk+ACNPvkSPcAAEibACyXUyfABGm3yNHuAECRNgAZLuYPgEirKlHu7u7XdyytGwHAd8jjNyng4OD7vnz51dbPT8/7z58+NB9+/bt6jU/TI+AGWHEnrx48eJ/EsSmHzx40L18+fLyzxF3ZVMjEyDCiEDjMYZZS5wiPXnyZFbJaxMhQIQRGzHvWR7XCyOCXsOmiDAi1HmPMMQjDpbpEiDCiL358eNHurW/5SnWdIBbXiDCiA38/Pnzrce2YyZ4//59F3ePLNMl4PbpiL2J0L979+7yDtHDhw8vtzzvdGnEXdvUigSIsCLAWavHp/+qM0BcXMd/q25n1vF57TYBp0a3mUzilePj4+7k5KSLb6gt6ydAhPUzXnoPR0dHl79WGTNCfBnn1uvSCJdegQhLI1vvCk+fPu2ePXt2tZOYEV6/fn31dz+shwAR1sP1cqvLntbEN9MxA9xcYjsxS1jWR4AIa2Ibzx0tc44fYX/16lV6NDFLXH+YL32jwiACRBiEbf5KcXoTIsQSpzXx4N28Ja4BQoK7rgXiydbHjx/P25TaQAJEGAguWy0+2Q8PD6/Ki4R8EVl+bzBOnZY95fq9rj9zAkTI2SxdidBHqG9+skdw43borCXO/ZcJdraPWdv22uIEiLA4q7nvvCug8WTqzQveOH26fodo7g6uFe/a17W3+nFBAkRYENRdb1vkkz1CH9cPsVy/jrhr27PqMYvENYNlHAIesRiBYwRy0V+8iXP8+/fvX11Mr7L7ECueb/r48eMqm7FuI2BGWDEG8cm+7G3NEOfmdcTQw4h9/55lhm7DekRYKQPZF2ArbXTAyu4kDYB2YxUzwg0gi/41ztHnfQG26HbGel/crVrm7tNY+/1btkOEAZ2M05r4FB7r9GbAIdxaZYrHdOsgJ/wCEQY0J74TmOKnbxxT9n3FgGGWWsVdowHtjt9Nnvf7yQM2aZU/TIAIAxrw6dOnAWtZZcoEnBpNuTuObWMEiLAx1HY0ZQJEmHJ3HNvGCBBhY6jtaMoEiJB0Z29vL6ls58vxPcO8/zfrdo5qvKO+d3Fx8Wu8zf1dW4p/cPzLly/dtv9Ts/EbcvGAHhHyfBIhZ6NSiIBTo0LNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUIEKFQsw01J0CEnI1KIQJEKNRsQ80JECFno1KIABEKNdtQcwJEyNmoFCJAhELNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUEiHBwcHB1IwA24OTk5FruBiBBhF++fGvX0IyfX19fX98Yr/8dGFkWtLRJg8WAi8DxP99PAOiDUaZp2wAAAABJRU5ErkJggg=="
                                                    />
                                                </div>
                                            }
                                        >
                                            <Card.Meta
                                                title={
                                                    <Text ellipsis={{ tooltip: image.name }}>
                                                        {image.name}
                                                    </Text>
                                                }
                                                description={formatFileSize(image.size)}
                                            />
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        ) : (
                            <Empty
                                description={t['content.images.noImages'] || '暂无图片'}
                                className="empty-images"
                            />
                        )}
                    </Spin>

                    {imageData.total > 0 && (
                        <div className="image-pagination">
                            <Pagination
                                current={currentImagePage}
                                pageSize={imagePageSize}
                                total={imageData.total}
                                onChange={handleImagePageChange}
                                showSizeChanger={false}
                                responsive
                            />
                        </div>
                    )}
                </div>
            </Modal>
            {/* 添加上传图片模态框 */}
            <Modal
                title={t['vditor.uploadImage'] || '上传图片'}
                open={uploadModalVisible}
                onCancel={() => setUploadModalVisible(false)}
                footer={null}
                width={isMobile ? '95%' : 520}
                className="upload-image-modal"
            >
                <div className="upload-form">
                    <div className="form-item" style={{ marginBottom: 16 }}>
                        <Text strong>{t['content.images.targetFolder'] || '目标文件夹'}:</Text>
                        <Select
                            style={{ width: '100%', marginTop: 8 }}
                            value={uploadFolder}
                            onChange={setUploadFolder}
                            placeholder={t['content.images.selectFolder'] || '选择文件夹'}
                        >
                            <Option value="">{t['content.images.rootFolder'] || '根目录'}</Option>
                            {imageData.folders.map(folder => (
                                <Option key={folder} value={folder}>{folder}</Option>
                            ))}
                        </Select>
                    </div>

                    <div className="form-item" style={{ marginBottom: 16 }}>
                        <Text strong>{t['content.images.customFileName'] || '自定义文件名'}:</Text>
                        <Input
                            style={{ marginTop: 8 }}
                            value={uploadFileName}
                            onChange={e => setUploadFileName(e.target.value)}
                            placeholder={t['content.images.fileNamePlaceholder'] || '留空则使用原文件名'}
                        />
                    </div>

                    <div className="form-item">
                        <Upload.Dragger
                            name="file"
                            multiple
                            beforeUpload={(file) => {
                                const isImage = file.type.startsWith('image/')
                                if (!isImage) {
                                    message.error(t['vditor.upload.invalidFileType'] || '只能上传图片文件')
                                    return false
                                }
                                // 非本地存储也允许上传（上传将走各自SDK）。直接走自定义上传
                                handleCustomUpload(file)
                                return false
                            }}
                            showUploadList={false}
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">
                                {t['content.images.dragHere'] || '拖拽图片到此处，或点击上传'}
                            </p>
                        </Upload.Dragger>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
