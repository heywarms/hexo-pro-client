import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { parseSizedImageHTML, sizedImageHTML } from './imageMarkdown.mjs'
import { isTableLineBreak, normalizeTableMarkdown } from './tableMarkdown.mjs'

const parser = unified().use(remarkParse).use(remarkGfm)

function visit(node, callback, inTable = false) {
    inTable ||= node.type === 'table'
    const result = callback(node, inTable)
    if (result) return result
    for (const child of node.children || []) {
        const issue = visit(child, callback, inTable)
        if (issue) return issue
    }
    return ''
}

export function getMarkdownIssue(markdown) {
    return visit(parser.parse(normalizeTableMarkdown(markdown || '')), (node, inTable) => {
        if (node.type === 'html' && !parseSizedImageHTML(node.value)
            && !(inTable && isTableLineBreak(node.value))) return 'HTML 或主题自定义内容'
        if (node.type === 'footnoteDefinition' || node.type === 'footnoteReference') return '脚注'
        if (node.type === 'code' && node.meta) return '带附加参数的代码块'
        if (node.title) return '带标题属性的链接或图片'
        if (node.type === 'table' && node.align?.some(Boolean)) return '带对齐设置的表格'
        if (node.type === 'text') {
            if (/{%[\s\S]*?%}|{{[\s\S]*?}}/.test(node.value)) return 'Hexo 主题标签'
            if (/(^|[^\\])\$\$?[^$\n]+\$\$?/.test(node.value)) return '数学公式'
        }
        return ''
    })
}

function normalize(node, inTable = false) {
    if (Array.isArray(node)) return node.map(child => normalize(child, inTable))
    if (!node || typeof node !== 'object') return node
    inTable ||= node.type === 'table'
    if (node.type === 'html') {
        if (inTable && isTableLineBreak(node.value)) return { type: 'break' }
        const image = parseSizedImageHTML(node.value)
        if (image) return { type: 'html', value: sizedImageHTML(image) }
    }
    return Object.fromEntries(Object.keys(node).sort()
        .filter(key => key !== 'position' && key !== 'spread')
        .map(key => [key, key === 'value' && node.type === 'text'
            ? node[key].replace(/[ \t]*\n[ \t]*/g, ' ')
            : normalize(node[key], inTable)]))
}

// Compare the Markdown structure before allowing a lossy block conversion.
// Whitespace and delimiters may change; article content and semantics may not.
export function preservesMarkdown(source, exported) {
    return JSON.stringify(normalize(parser.parse(normalizeTableMarkdown(source || ''))))
        === JSON.stringify(normalize(parser.parse(normalizeTableMarkdown(exported || ''))))
}
