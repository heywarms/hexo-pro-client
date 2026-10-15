import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

const parser = unified().use(remarkParse).use(remarkGfm)
const escapedCharacters = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '\n': '&#10;', '\r': '&#13;' }
const escapeAttribute = value => String(value).replace(/[&"<>\n\r]/g, character => escapedCharacters[character])
const unescapeAttribute = value => value.replace(/&(amp|quot|lt|gt|#10|#13);/g,
    entity => Object.keys(escapedCharacters).find(character => escapedCharacters[character] === entity))

export function sizedImageHTML({ url, alt, width }) {
    return `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}" width="${Math.round(width)}">`
}

// Recognize only the image markup we can round-trip without dropping attributes.
// Other HTML continues to use source mode, and is never executed by mobile previews.
export function parseSizedImageHTML(html) {
    const match = /^<img src="([^"<>]*)" alt="([^"<>]*)" width="([1-9]\d*)">$/.exec(html.trim())
    if (!match || !Number.isSafeInteger(Number(match[3]))) return null
    return { url: unescapeAttribute(match[1]), alt: unescapeAttribute(match[2]), width: Number(match[3]) }
}

export function blocksToMarkdownWithImageSizes(editor, blocks = editor.document) {
    const images = new Map()
    const mapBlocks = blocks => blocks.map(block => {
        const mapped = { ...block, children: mapBlocks(block.children || []) }
        if (block.type === 'image' && block.props.url && !block.props.caption && block.props.showPreview !== false
            && Number.isFinite(block.props.previewWidth) && block.props.previewWidth > 0) {
            const marker = `https://hexopro.invalid/image-size/${crypto.randomUUID()}`
            images.set(marker, sizedImageHTML({ url: block.props.url, alt: block.props.name || '', width: block.props.previewWidth }))
            mapped.props = { ...block.props, url: marker, name: '' }
        }
        return mapped
    })
    let markdown = editor.blocksToMarkdownLossy(mapBlocks(blocks))
    if (!images.size) return markdown
    const replacements = []
    const visit = node => {
        if (node.type === 'image' && images.has(node.url)) {
            replacements.push({ start: node.position.start.offset, end: node.position.end.offset, value: images.get(node.url) })
        }
        node.children?.forEach(visit)
    }
    visit(parser.parse(markdown))
    for (const { start, end, value } of replacements.reverse()) markdown = markdown.slice(0, start) + value + markdown.slice(end)
    return markdown
}

// ReactMarkdown can render known sized images while keeping all other raw HTML disabled.
export function remarkSizedImages() {
    return tree => {
        const visit = node => {
            if (node.children) node.children = node.children.map(child => {
                const image = child.type === 'html' && parseSizedImageHTML(child.value)
                if (image) return { type: 'image', url: image.url, alt: image.alt, title: null, data: { hProperties: { width: image.width } } }
                visit(child)
                return child
            })
        }
        visit(tree)
    }
}
