import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { blocksToMarkdownWithImageSizes } from './imageMarkdown.mjs'

const parser = unified().use(remarkParse).use(remarkGfm)

export const isTableLineBreak = html => /^<br\s*\/?>$/i.test(html)

function pipeCount(line) {
    let count = 0
    let backslashes = 0
    for (const character of line) {
        if (character === '|' && backslashes % 2 === 0) count++
        backslashes = character === '\\' ? backslashes + 1 : 0
    }
    return count
}

const endsWithBreak = line => (line.match(/\\+$/)?.[0].length || 0) % 2 === 1

// Older BlockNote exports put backslash + newline inside a pipe-table cell.
// Recover only complete rows with the expected number of columns, inside an
// actual Markdown table. Code examples and ordinary paragraph breaks stay intact.
export function normalizeTableMarkdown(markdown) {
    if (!/\\\r?\n/.test(markdown || '')) return markdown
    const replacements = []
    const visit = node => {
        if (node.type === 'table') {
            const start = node.position.start.offset
            const end = node.position.end.offset
            const original = markdown.slice(start, end)
            const newline = original.includes('\r\n') ? '\r\n' : '\n'
            const lines = original.split(/\r?\n/)
            const expectedPipes = node.align.length + 1
            for (let i = 2; i < lines.length; i++) {
                if (!/^\s*\|/.test(lines[i]) || !endsWithBreak(lines[i])) continue
                let row = lines[i]
                let last = i
                while (endsWithBreak(row) && last + 1 < lines.length && pipeCount(row) < expectedPipes) {
                    row = row.slice(0, -1) + '<br>' + lines[++last]
                }
                if (last > i && /\|\s*$/.test(row) && pipeCount(row) === expectedPipes && !endsWithBreak(row)) {
                    lines.splice(i, last - i + 1, row)
                }
            }
            const value = lines.join(newline)
            if (value !== original) replacements.push({ start, end, value })
        }
        node.children?.forEach(visit)
    }
    visit(parser.parse(markdown || ''))
    for (const { start, end, value } of replacements.reverse()) markdown = markdown.slice(0, start) + value + markdown.slice(end)
    return markdown
}

// Use a plain-text marker before BlockNote serializes table cells, so hard
// breaks cannot split a row (including header cells and nested tables).
export function blocksToMarkdown(editor, blocks = editor.document) {
    // An unused private-use character keeps column padding small and also works
    // on local HTTP connections where crypto.randomUUID is unavailable.
    const original = JSON.stringify(blocks)
    let codePoint = 0xE000
    while (original.includes(String.fromCodePoint(codePoint))) codePoint++
    const marker = String.fromCodePoint(codePoint)
    const mapInline = content => {
        if (typeof content === 'string') return content.replace(/\r?\n/g, marker)
        return content.flatMap(item => {
            // A <br> inside backticks would be literal code, so keep the break
            // outside each code span while retaining the style on both sides.
            if (item.type === 'text' && item.styles?.code && /\r?\n/.test(item.text)) {
                return item.text.split(/\r?\n/).flatMap((text, index) => [
                    ...(index ? [{ type: 'text', text: marker, styles: {} }] : []),
                    ...(text ? [{ ...item, text }] : []),
                ])
            }
            if (item.type === 'text') return { ...item, text: item.text.replace(/\r?\n/g, marker) }
            if (Array.isArray(item.content)) return { ...item, content: mapInline(item.content) }
            return item
        })
    }
    const mapBlocks = blocks => blocks.map(block => ({
        ...block,
        children: mapBlocks(block.children || []),
        ...(block.type === 'table' && { content: {
            ...block.content,
            rows: block.content.rows.map(row => ({ ...row, cells: row.cells.map(cell =>
                Array.isArray(cell) || typeof cell === 'string'
                    ? mapInline(cell)
                    : { ...cell, content: mapInline(cell.content) }) })),
        } }),
    }))
    return blocksToMarkdownWithImageSizes(editor, mapBlocks(blocks)).replaceAll(marker, '<br>')
}

// Mobile previews keep raw HTML disabled, but render attribute-free table breaks.
export function remarkTableLineBreaks() {
    return tree => {
        const visit = (node, inTable = false) => {
            inTable ||= node.type === 'table'
            if (node.children) node.children = node.children.map(child => {
                if (inTable && child.type === 'html' && isTableLineBreak(child.value)) return { type: 'break' }
                visit(child, inTable)
                return child
            })
        }
        visit(tree)
    }
}
