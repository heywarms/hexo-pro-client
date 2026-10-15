import React, { useContext, useEffect, useRef, useState } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, defaultStyleSpecs } from '@blocknote/core'
import { en, zh } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import {
    useCreateBlockNote, FormattingToolbar, FormattingToolbarController, BasicTextStyleButton,
    BlockTypeSelect, CreateLinkButton, NestBlockButton, UnnestBlockButton,
    SideMenu, SideMenuController, DragHandleMenu, useDictionary, blockTypeSelectItems,
    RemoveBlockItem, SuggestionMenuController, getDefaultReactSlashMenuItems,
    useBlockNoteEditor, useComponentsContext, useExtensionState, useUIMode,
} from '@blocknote/react'
import { filterSuggestionItems, SideMenuExtension } from '@blocknote/core/extensions'
import { message } from 'antd'
import { service } from '@/utils/api'
import { GlobalContext } from '@/context'
import { getMarkdownIssue, preservesMarkdown } from './markdownSafety.mjs'
import { createLocalImageResolver, getUploadedImageUrl } from './imageFiles.mjs'
import { handleClipboardImagePaste } from './clipboardImages.mjs'
import { blocksToMarkdownWithImageSizes } from './imageMarkdown.mjs'
import './imageResize.less'
import '@blocknote/mantine/style.css'

const schema = BlockNoteSchema.create({
    blockSpecs: {
        paragraph: defaultBlockSpecs.paragraph,
        heading: defaultBlockSpecs.heading,
        bulletListItem: defaultBlockSpecs.bulletListItem,
        numberedListItem: defaultBlockSpecs.numberedListItem,
        checkListItem: defaultBlockSpecs.checkListItem,
        quote: defaultBlockSpecs.quote,
        codeBlock: defaultBlockSpecs.codeBlock,
        image: defaultBlockSpecs.image,
        table: defaultBlockSpecs.table,
        divider: defaultBlockSpecs.divider,
    },
    styleSpecs: {
        bold: defaultStyleSpecs.bold,
        italic: defaultStyleSpecs.italic,
        strike: defaultStyleSpecs.strike,
        code: defaultStyleSpecs.code,
    },
})

const MobileToolbarActionsContext = React.createContext<React.ReactNode>(null)

function MarkdownToolbar() {
    const dictionary = useDictionary()
    const mobileActions = useContext(MobileToolbarActionsContext)
    const uiMode = useUIMode()
    const formattingTools = <FormattingToolbar>
        <BlockTypeSelect items={blockTypeSelectItems(dictionary).filter(item => !item.props?.isToggleable)} />
        <BasicTextStyleButton basicTextStyle="bold" />
        <BasicTextStyleButton basicTextStyle="italic" />
        <BasicTextStyleButton basicTextStyle="strike" />
        <BasicTextStyleButton basicTextStyle="code" />
        <CreateLinkButton />
        <NestBlockButton />
        <UnnestBlockButton />
    </FormattingToolbar>
    return uiMode === 'mobile' && mobileActions
        ? <div className="mobile-writing-toolbar">{mobileActions}{formattingTools}</div>
        : formattingTools
}

function MarkdownDragMenu() {
    const dictionary = useDictionary()
    const editor = useBlockNoteEditor()
    const Components = useComponentsContext()
    const block = useExtensionState(SideMenuExtension, { selector: state => state?.block })
    if (!block) return null
    const setImageWidth = (fraction: number) => {
        const canvasWidth = editor.domElement?.firstElementChild?.clientWidth || 640
        editor.updateBlock(block, { props: { previewWidth: Math.max(64, Math.round(canvasWidth * fraction)) } })
    }
    return <DragHandleMenu>
        <Components.Generic.Menu.Item onClick={() => editor.moveBlocksUp(block)}>上移</Components.Generic.Menu.Item>
        <Components.Generic.Menu.Item onClick={() => editor.moveBlocksDown(block)}>下移</Components.Generic.Menu.Item>
        {block.type === 'image' && block.props.url && <>
            <Components.Generic.Menu.Item onClick={() => setImageWidth(0.25)}>图片宽度 25%</Components.Generic.Menu.Item>
            <Components.Generic.Menu.Item onClick={() => setImageWidth(0.5)}>图片宽度 50%</Components.Generic.Menu.Item>
            <Components.Generic.Menu.Item onClick={() => setImageWidth(1)}>图片宽度 100%</Components.Generic.Menu.Item>
        </>}
        <RemoveBlockItem>{dictionary.drag_handle.delete_menuitem}</RemoveBlockItem>
    </DragHandleMenu>
}

function MarkdownSideMenu(props) {
    return <SideMenu {...props} dragHandleMenu={MarkdownDragMenu} />
}

async function uploadImage(file: File) {
    try {
        if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
        const image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('图片读取失败'))
            reader.readAsDataURL(file)
        })
        const config = await service.get('/hexopro/api/images/config/get')
        const storageType = config.data?.data?.type || 'local'
        const res = await service.post('/hexopro/api/images/upload', { data: image, filename: file.name, storageType })
        return getUploadedImageUrl(res.data, storageType)
    } catch (error) {
        message.error((error as Error).message)
        throw error
    }
}

type Props = {
    value: string
    onChange: (value: string) => void
    onReady: () => void
    onFallback: (reason: string) => void
    uploadFile?: (file: File) => Promise<string>
    resolveFileUrl?: (url: string) => Promise<string>
    onEditorReady?: (editor: any) => void
    mobileToolbarActions?: React.ReactNode
}

export default function BlockEditor({ value, onChange, onReady, onFallback, uploadFile, resolveFileUrl, onEditorReady, mobileToolbarActions }: Props) {
    const { theme, lang } = useContext(GlobalContext)
    const callbacks = useRef({ onChange, onReady, onFallback, uploadFile, resolveFileUrl, onEditorReady })
    callbacks.current = { onChange, onReady, onFallback, uploadFile, resolveFileUrl, onEditorReady }
    const hydrating = useRef(true)
    const lastValue = useRef<string>()
    const lastEditor = useRef<unknown>()
    const [imageResolver] = useState(() => createLocalImageResolver(service))
    useEffect(() => () => imageResolver.dispose(), [imageResolver])
    const editor = useCreateBlockNote({
        schema,
        dictionary: lang?.startsWith('en') ? en : {
            ...zh,
            placeholders: { ...zh.placeholders, default: '开始写作，或输入 / 插入内容…', emptyDocument: '开始写作，或输入 / 插入内容…' },
        },
        uploadFile: file => (callbacks.current.uploadFile || uploadImage)(file),
        resolveFileUrl: url => callbacks.current.resolveFileUrl ? callbacks.current.resolveFileUrl(url) : imageResolver.resolve(url),
        pasteHandler: context => handleClipboardImagePaste(context) ?? context.defaultPasteHandler(),
        tables: { splitCells: false, cellBackgroundColor: false, cellTextColor: false, headers: false },
    }, [lang])

    useEffect(() => {
        if (lastEditor.current === editor && lastValue.current === value) return
        hydrating.current = true
        try {
            const blocks = editor.tryParseMarkdownToBlocks(value)
            const issue = getMarkdownIssue(value)
            if (issue || !preservesMarkdown(value, blocksToMarkdownWithImageSizes(editor, blocks))) {
                callbacks.current.onFallback(issue || '块编辑暂时无法完整保留的 Markdown 结构')
                return
            }
            editor.replaceBlocks(editor.document, blocks.length ? blocks : [{ type: 'paragraph' }])
            lastValue.current = value
            lastEditor.current = editor
            hydrating.current = false
            callbacks.current.onReady()
            callbacks.current.onEditorReady?.(editor)
        } catch {
            callbacks.current.onFallback('块编辑暂时无法完整保留的 Markdown 结构')
        }
    }, [editor, value])

    return <BlockNoteView
        editor={editor}
        theme={theme === 'dark' ? 'dark' : 'light'}
        formattingToolbar={false}
        sideMenu={false}
        slashMenu={false}
        className="blog-block-editor"
        aria-label="文章块编辑器"
        onChange={() => {
            if (hydrating.current) return
            const markdown = blocksToMarkdownWithImageSizes(editor)
            lastValue.current = markdown
            callbacks.current.onChange(markdown)
        }}
    >
        <MobileToolbarActionsContext.Provider value={mobileToolbarActions}>
            <FormattingToolbarController formattingToolbar={MarkdownToolbar} />
        </MobileToolbarActionsContext.Provider>
        <SideMenuController sideMenu={MarkdownSideMenu} />
        <SuggestionMenuController triggerCharacter="/" getItems={async query => filterSuggestionItems(
            getDefaultReactSlashMenuItems(editor).filter(item => !('key' in item && String(item.key).startsWith('toggle'))),
            query,
        )} />
    </BlockNoteView>
}
