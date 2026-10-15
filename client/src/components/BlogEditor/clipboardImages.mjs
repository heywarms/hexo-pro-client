const imageOnlyTags = new Set(['IMG', 'DIV', 'P', 'SPAN', 'FIGURE', 'BR', 'META'])

function parseClipboardHTML(html) {
    return new DOMParser().parseFromString(html, 'text/html')
}

function isImageOnlyHTML(html, parseHTML) {
    const { body } = parseHTML(html)
    return !body.textContent.trim()
        && body.querySelectorAll('img').length > 0
        && Array.from(body.querySelectorAll('*')).every(element => imageOnlyTags.has(element.tagName))
}

async function uploadClipboardImage(editor, file, blockId) {
    try {
        const result = await editor.uploadFile(file, blockId)
        const block = editor.getBlock(blockId)
        if (block?.type === 'image' && !block.props.url) {
            editor.updateBlock(blockId, typeof result === 'string' ? { props: { url: result } } : result)
        }
    } catch {
        // The upload callback reports the error. Remove its empty loading block.
        try {
            const block = editor.getBlock(blockId)
            if (block?.type === 'image' && !block.props.url) editor.removeBlocks([blockId])
        } catch { /* The editor may have been closed while uploading. */ }
    }
}

// Return undefined when the default rich-text paste handler should keep control.
export function handleClipboardImagePaste({ event, editor }, parseHTML = parseClipboardHTML) {
    const clipboard = event.clipboardData
    if (!clipboard || !editor.uploadFile || Array.from(clipboard.types).includes('blocknote/html')) return undefined
    if (clipboard.getData('text/plain').trim() || clipboard.getData('text/markdown').trim()) return undefined

    const itemFiles = Array.from(clipboard.items || []).map(item => item.getAsFile()).filter(Boolean)
    const files = itemFiles.length ? itemFiles : Array.from(clipboard.files || [])
    if (!files.length || files.some(file => !file.type.startsWith('image/'))) return undefined

    const html = clipboard.getData('text/html')
    if (html) {
        try {
            if (!isImageOnlyHTML(html, parseHTML)) return undefined
        } catch {
            return undefined
        }
    }

    const currentBlock = editor.getTextCursorPosition().block
    if (currentBlock.type === 'codeBlock') return undefined
    event.preventDefault()

    const images = files.map(file => ({ type: 'image', props: { name: file.name, url: '' } }))
    const blocks = currentBlock.type === 'paragraph' && currentBlock.content.length === 0 && !currentBlock.children?.length
        ? [editor.updateBlock(currentBlock, images[0])]
        : []
    const remainingImages = blocks.length ? images.slice(1) : images
    if (remainingImages.length) blocks.push(...editor.insertBlocks(remainingImages, blocks[0] || currentBlock, 'after'))
    editor.setTextCursorPosition(blocks.at(-1), 'end')

    // Insert every placeholder before starting uploads so completion order cannot reorder images.
    files.forEach((file, index) => { void uploadClipboardImage(editor, file, blocks[index].id) })
    return true
}
