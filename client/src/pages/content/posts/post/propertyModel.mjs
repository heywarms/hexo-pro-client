import yaml from 'js-yaml'

const reserved = new Set(['__proto__', 'prototype', 'constructor', '_id', 'documentId', 'source', 'full_source', 'raw', 'revision', 'baseRevision', 'isDraft', 'isDiscarded', 'title', 'date', 'author', '_content', 'tags', 'categories'])

export function fieldKeyError(name, fields, original = '') {
    const key = name.trim()
    if (!key) return 'required'
    if (key !== original && reserved.has(key)) return 'reserved'
    if (key !== original && Object.prototype.hasOwnProperty.call(fields, key)) return 'duplicate'
    return ''
}

export function valueType(value) {
    return ['string', 'number', 'boolean'].includes(typeof value) ? typeof value : 'yaml'
}

export function valueText(value) {
    return valueType(value) === 'yaml'
        ? yaml.dump(value, { noRefs: true, lineWidth: -1, schema: yaml.JSON_SCHEMA }).trimEnd()
        : String(value)
}

export function parseValue(text, type) {
    if (type === 'string') return text
    if (type === 'boolean') return text === 'true'
    if (type === 'number') {
        if (!text.trim() || !Number.isFinite(Number(text))) throw new Error('number')
        return Number(text)
    }
    if (!text.trim()) throw new Error('yamlEmpty')
    const value = yaml.load(text, { schema: yaml.JSON_SCHEMA })
    if (value === undefined) throw new Error('yamlEmpty')
    return value
}

// Replace a field atomically so a rename never sends an intermediate deletion.
export function replaceField(fields, original, name, value) {
    const key = name.trim()
    const error = fieldKeyError(key, fields, original)
    if (error) throw new Error(error)
    const entries = Object.entries(fields).map(([entry, current]) => entry === original ? [key, value] : [entry, current])
    if (!Object.prototype.hasOwnProperty.call(fields, original)) entries.push([key, value])
    return Object.fromEntries(entries)
}

export function normalizeTaxonomy(values) {
    const seen = new Set()
    return values.filter(value => {
        if (typeof value !== 'string' && !Array.isArray(value)) return false
        const id = JSON.stringify(typeof value === 'string' ? value.trim() : value)
        if (id === '""' || seen.has(id)) return false
        seen.add(id)
        return true
    }).map(value => typeof value === 'string' ? value.trim() : value)
}

export const taxonomyId = value => Array.isArray(value) ? `__category_path__:${JSON.stringify(value)}` : value
export const taxonomyLabel = value => Array.isArray(value) ? value.map(taxonomyLabel).join(' / ') : String(value)
