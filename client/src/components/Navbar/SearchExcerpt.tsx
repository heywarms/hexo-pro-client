import React, { useMemo } from 'react'
import styles from './style/index.module.less'

/** Keep search previews readable without rendering document markup or images. */
export default function SearchExcerpt({ value, query }: { value?: string; query: string }) {
    const text = useMemo(() => {
        const document = new DOMParser().parseFromString(String(value || ''), 'text/html')
        document.querySelectorAll('script, style').forEach(node => node.remove())
        return (document.body.textContent || '')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/```[\w%+-]*/g, ' ')
            .replace(/[#*>`]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 260)
    }, [value])
    const needle = query.trim().toLocaleLowerCase()
    const parts: React.ReactNode[] = []
    let offset = 0
    if (needle) {
        const haystack = text.toLocaleLowerCase()
        let index = haystack.indexOf(needle)
        while (index !== -1) {
            parts.push(text.slice(offset, index), <mark key={index}>{text.slice(index, index + needle.length)}</mark>)
            offset = index + needle.length
            index = haystack.indexOf(needle, offset)
        }
    }
    parts.push(text.slice(offset))
    return <div className={styles.searchResultContext}>{parts}</div>
}
