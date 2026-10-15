import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AutoComplete, Button, Drawer, Grid, Input, Select, Switch, Tooltip } from 'antd'
import { CheckOutlined, CloseOutlined, DeleteOutlined, FolderOutlined, InfoCircleOutlined, LoadingOutlined, PlusOutlined, TagsOutlined } from '@ant-design/icons'
import { GlobalContext } from '@/context'
import useLocale from '@/hooks/useLocale'
import type { SaveStatus } from '@/components/BlogEditor/useDocumentSave'
import { fieldKeyError, normalizeTaxonomy, parseValue, replaceField, taxonomyId, taxonomyLabel, valueText, valueType } from './propertyModel.mjs'
import locale from './propertyLocale'
import styles from './postSetting.module.less'

type Metadata = { tags: string[]; categories: any[]; frontMatter: Record<string, any>; frontMatterStyles?: Record<string, string> }
type Props = {
    visible: boolean
    setVisible: (visible: boolean) => void
    tagCatMeta: { tags?: Record<string, string>; categories?: Record<string, string>; metadata?: string[] }
    postMeta: Metadata
    onChange: (update: Partial<Metadata>) => void
    saveStatus: SaveStatus
    onRetrySave: () => void
}

function readRecent(kind: string): string[] {
    try {
        const value = JSON.parse(localStorage.getItem(`hexopro:properties:${kind}`) || '[]')
        return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 12) : []
    } catch { return [] }
}

function remember(kind: string, items: string[]) {
    const recent = normalizeTaxonomy([...items, ...readRecent(kind)]).slice(0, 12)
    try { localStorage.setItem(`hexopro:properties:${kind}`, JSON.stringify(recent)) } catch { /* Suggestions are optional when storage is unavailable. */ }
    return recent
}

function TaxonomyField({ kind, value, existing, onChange, t }: any) {
    const [search, setSearch] = useState('')
    const [recent, setRecent] = useState(() => readRecent(kind))
    const id = useId()
    const isTag = kind === 'tags'
    const options = useMemo(() => normalizeTaxonomy([...value, ...Object.values(existing || {}), ...recent])
        .map(item => ({ value: taxonomyId(item), title: taxonomyLabel(item), label: taxonomyLabel(item), original: item })), [value, existing, recent])
    const selected = value.map(taxonomyId)
    const matching = options.filter(option => option.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    const input = search.trim()
    const displayOptions = input && !options.some(option => option.title === input)
        ? [...matching, { value: input, title: input, label: `${t.create}「${input}」`, original: input }]
        : matching
    const shortcuts = (recent.length ? recent : Object.values(existing || {})).filter(item => !selected.includes(item)).slice(0, 6)
    const change = (ids: string[]) => {
        const next = normalizeTaxonomy(ids.map(id => options.find(option => option.value === id)?.original ?? id))
        const added = next.filter(item => typeof item === 'string' && !selected.includes(item))
        if (added.length) setRecent(remember(kind, added))
        onChange(next)
        setSearch('')
    }
    return <section className={styles.section}>
        <label className={styles.sectionTitle} htmlFor={id}>{isTag ? <TagsOutlined /> : <FolderOutlined />}{t[kind]}</label>
        <Select id={id} aria-label={t[kind]} mode="tags" className={styles.taxonomySelect}
            value={selected} options={displayOptions} optionLabelProp="title" filterOption={false}
            searchValue={search} onSearch={setSearch} onChange={change}
            tokenSeparators={isTag ? [',', '，', ';', '；', '\n', '\r'] : undefined}
            placeholder={isTag ? t.tagPlaceholder : t.categoryPlaceholder}
            aria-describedby={`${id}-hint`} listHeight={224} />
        <p id={`${id}-hint`} className={styles.hint}>{isTag ? t.tagHint : t.categoryHint}</p>
        {shortcuts.length > 0 && <div className={styles.quickPicks}>
            <span>{recent.length ? t.recent : t.available}</span>
            <div>{shortcuts.map(item => <Button key={String(item)} size="small" onClick={() => change([...selected, String(item)])}>{String(item)}</Button>)}</div>
        </div>}
    </section>
}

function PropertyRow({ rowId, name, value, suggestions, getFields, onCommit, onRemove, onDraftState, draftStore, t }: any) {
    const isNew = name === null
    const previous = useRef({ name, value })
    const stored = draftStore.get(rowId)
    const cached = stored?.name === name && stored?.value === value ? stored : undefined
    const [keyText, setKeyText] = useState(cached?.keyText ?? name ?? '')
    const [type, setType] = useState(cached?.type ?? (isNew ? 'string' : valueType(value)))
    const [text, setText] = useState(cached?.text ?? (isNew ? '' : valueText(value)))
    const [valueTouched, setValueTouched] = useState(cached?.valueTouched ?? false)
    const [error, setError] = useState(cached?.error ?? '')
    const valueRef = useRef<any>(null)
    const inputRef = useRef({ keyText, type, text })
    inputRef.current = { keyText, type, text }
    const inputId = useId()
    useEffect(() => {
        if (previous.current.name === name && previous.current.value === value) return
        previous.current = { name, value }
        setKeyText(name || '')
        setType(isNew ? 'string' : valueType(value))
        setText(isNew ? '' : valueText(value))
        setValueTouched(false)
        setError('')
    }, [name, value])
    useEffect(() => {
        draftStore.set(rowId, { name, value, keyText, type, text, valueTouched, error })
    }, [rowId, name, value, keyText, type, text, valueTouched, error, draftStore])
    const changed = isNew ? !!keyText || valueTouched : keyText !== name || type !== valueType(value) || text !== valueText(value)
    useEffect(() => {
        onDraftState(rowId, changed)
        return () => onDraftState(rowId, false)
    }, [rowId, changed, onDraftState])

    const commit = (next = inputRef.current, touched = valueTouched) => {
        if (isNew && !touched) return
        const keyError = fieldKeyError(next.keyText, getFields(), name || '')
        if (keyError) { setError(t[keyError]); return }
        try {
            const parsed = parseValue(next.text, next.type)
            setError('')
            if (isNew || next.keyText.trim() !== name || next.type !== valueType(value) || next.text !== valueText(value)) {
                onCommit(name, next.keyText.trim(), parsed, rowId)
            } else {
                setKeyText(name)
                setText(valueText(value))
                setType(valueType(value))
            }
        } catch (err) {
            setError(err.message === 'number' ? t.numberError : err.message === 'yamlEmpty' ? t.yamlEmpty : t.yamlError)
        }
    }
    const changeType = nextType => {
        const nextText = nextType === 'boolean' ? String(text === 'true') : text
        setType(nextType)
        setText(nextText)
        const touched = valueTouched || !isNew || nextType === 'boolean'
        setValueTouched(touched)
        if (touched) commit({ keyText, type: nextType, text: nextText }, true)
    }
    const descriptionId = error ? `${inputId}-error` : type === 'yaml' ? `${inputId}-yaml` : undefined
    const inputProps = {
        id: `${inputId}-value`, 'aria-label': `${keyText || t.name} · ${t.value}`,
        'aria-describedby': descriptionId, 'aria-invalid': !!error,
        value: text, status: error ? 'error' as const : undefined,
        onChange: event => { setText(event.target.value); setValueTouched(true); setError('') },
        onBlur: () => commit(),
    }
    return <div className={styles.propertyRow} data-property={name ?? 'new'}>
        <div className={styles.propertyTop}>
            <label className={styles.srOnly} htmlFor={`${inputId}-name`}>{t.name}</label>
            <AutoComplete id={`${inputId}-name`} aria-label={isNew ? t.name : `${name} · ${t.name}`} autoFocus={isNew}
                className={styles.propertyName} value={keyText} options={suggestions.map(item => ({ value: item }))}
                filterOption={(input, option) => String(option.value).toLowerCase().includes(input.toLowerCase())}
                onChange={name => { inputRef.current.keyText = name; setKeyText(name) }} onBlur={() => commit()}
                onSelect={selected => { inputRef.current.keyText = selected; setKeyText(selected); valueRef.current?.focus() }}
                placeholder={t.namePlaceholder} status={error ? 'error' : undefined}
                onInputKeyDown={event => { if (event.key === 'Escape') event.preventDefault() }}
                onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); valueRef.current?.focus() } }} />
            <Select aria-label={`${keyText || t.name} · ${t.type}`} size="small" className={styles.typeSelect} value={type}
                onChange={changeType} options={['string', 'boolean', 'number', 'yaml'].map(value => ({ value, label: t[value] }))} />
            <Tooltip title={t.remove}><Button type="text" aria-label={`${t.remove} ${name || ''}`} icon={<DeleteOutlined />} onClick={onRemove} /></Tooltip>
        </div>
        <label className={styles.srOnly} htmlFor={`${inputId}-value`}>{t.value}</label>
        {type === 'boolean' ? <div className={styles.switchValue}>
            <Switch ref={valueRef} id={`${inputId}-value`} aria-label={`${keyText || t.name} · ${t.value}`} checked={text === 'true'}
                onChange={checked => { const next = String(checked); setText(next); setValueTouched(true); commit({ keyText, type, text: next }, true) }} />
            <span>{text === 'true' ? t.on : t.off}</span>
        </div> : type === 'yaml' || (type === 'string' && text.includes('\n'))
            ? <Input.TextArea {...inputProps} ref={valueRef} className={type === 'yaml' ? styles.yamlInput : undefined} autoSize={{ minRows: 2, maxRows: 12 }} spellCheck={false} />
            : <Input {...inputProps} ref={valueRef} inputMode={type === 'number' ? 'decimal' : undefined} placeholder={t.valuePlaceholder}
                onPressEnter={event => { if (!event.nativeEvent.isComposing) commit(undefined, true) }} />}
        {type === 'yaml' && <p id={`${inputId}-yaml`} className={styles.hint}>{t.yamlHint}</p>}
        {error ? <p id={`${inputId}-error`} role="alert" className={styles.fieldError}>{error}</p>
            : isNew && <p className={styles.hint}>{t.draftHint}</p>}
    </div>
}

export function PostSettings({ visible, setVisible, tagCatMeta, postMeta, onChange, saveStatus, onRetrySave }: Props) {
    const t = useLocale(locale)
    const { theme } = useContext(GlobalContext)
    const screens = Grid.useBreakpoint()
    const [draft, setDraft] = useState<string | null>(null)
    const [unfinished, setUnfinished] = useState<Record<string, boolean>>({})
    const [knownFields, setKnownFields] = useState(() => readRecent('fields'))
    const ids = useRef(new Map<string, string>())
    const draftStore = useRef(new Map())
    const sequence = useRef(0)
    const metaRef = useRef(postMeta)
    metaRef.current = postMeta
    const headingId = useId()
    const panelRef = useRef<HTMLDivElement>(null)
    const opener = useRef<HTMLElement | null>(null)
    const onDraftState = useCallback((id: string, pending: boolean) => setUnfinished(current => current[id] === pending ? current : { ...current, [id]: pending }), [])
    const getFields = () => metaRef.current.frontMatter || {}
    const update = (patch: Partial<Metadata>) => {
        metaRef.current = { ...metaRef.current, ...patch }
        onChange(patch)
    }
    const rows = Object.entries(postMeta.frontMatter || {}).map(([name, value]) => {
        if (!ids.current.has(name)) ids.current.set(name, `property-${++sequence.current}`)
        return { id: ids.current.get(name), name, value }
    })
    if (draft) rows.push({ id: draft, name: null, value: '' })
    const suggestions = normalizeTaxonomy([...(tagCatMeta.metadata || []), ...knownFields])
        .filter(key => !fieldKeyError(key, getFields()))
    const commitField = (original: string | null, name: string, value: any, rowId: string) => {
        const next = replaceField(getFields(), original || '', name, value)
        ids.current.delete(original)
        ids.current.set(name, rowId)
        const quoteStyles = { ...metaRef.current.frontMatterStyles }
        if (original && original !== name) {
            if (quoteStyles[original]) quoteStyles[name] = quoteStyles[original]
            delete quoteStyles[original]
        }
        if (typeof value !== 'string') delete quoteStyles[name]
        update({ frontMatter: next, frontMatterStyles: quoteStyles })
        setKnownFields(remember('fields', [name]))
        if (original === null) setDraft(null)
    }
    const removeField = (name: string | null) => {
        if (name === null) { setDraft(null); return }
        const next = { ...getFields() }
        const quoteStyles = { ...metaRef.current.frontMatterStyles }
        delete next[name]
        delete quoteStyles[name]
        update({ frontMatter: next, frontMatterStyles: quoteStyles })
    }
    const close = () => {
        // Blur commits a valid value before hiding the panel. Invalid drafts stay mounted.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        setVisible(false)
        opener.current?.focus()
    }
    useEffect(() => {
        if (visible) {
            opener.current = document.querySelector('button[aria-controls="post-properties"]')
            if (screens.lg) panelRef.current?.focus()
        }
    }, [visible, screens.lg])
    const hasDraft = Object.values(unfinished).some(Boolean)
    const panel = <div id="post-properties" className={styles.panel} data-theme={theme} ref={panelRef} tabIndex={-1}
        onKeyDown={event => { if (screens.lg && event.key === 'Escape' && !event.isPropagationStopped()) { event.preventDefault(); close() } }}>
        <div className={styles.panelHeader}>
            <div><h2 id={headingId}>{t.title}</h2><p>{t.subtitle}</p></div>
            <Button type="text" aria-label={t.close} icon={<CloseOutlined />} onClick={close} />
        </div>
        <div className={styles.panelBody}>
            <TaxonomyField kind="categories" value={postMeta.categories || []} existing={tagCatMeta.categories} onChange={categories => update({ categories })} t={t} />
            <TaxonomyField kind="tags" value={postMeta.tags || []} existing={tagCatMeta.tags} onChange={tags => update({ tags })} t={t} />
            <section className={styles.section}>
                <div className={styles.customHeading}><div><h3>{t.custom}</h3><span>Front Matter</span></div>
                    <Button type="text" className={styles.addButton} icon={<PlusOutlined />} onClick={() => {
                        if (draft) panelRef.current?.querySelector<HTMLInputElement>('[data-property="new"] input')?.focus()
                        else setDraft(`property-${++sequence.current}`)
                    }}>{t.add}</Button>
                </div>
                <p className={styles.hint}>{t.customHint}</p>
                {rows.length === 0 && <div className={styles.empty}><strong>{t.empty}</strong><p>{t.emptyHint}</p></div>}
                <div className={styles.properties}>{rows.map(row => <PropertyRow key={row.id} rowId={row.id} name={row.name} value={row.value}
                    suggestions={suggestions} getFields={getFields} onCommit={commitField} onRemove={() => removeField(row.name)}
                    onDraftState={onDraftState} draftStore={draftStore.current} t={t} />)}</div>
            </section>
        </div>
        <footer className={styles.panelFooter}>
            <div role="status" className={styles.status} data-status={saveStatus === 'error' ? 'error' : hasDraft ? 'draft' : saveStatus}>
                {saveStatus === 'error' ? <InfoCircleOutlined /> : hasDraft ? <InfoCircleOutlined /> : saveStatus === 'saved' ? <CheckOutlined /> : <LoadingOutlined spin={saveStatus === 'saving'} />}
                <span>{saveStatus === 'error' ? t.error : hasDraft ? t.unfinished : t[saveStatus]}</span>
                {saveStatus === 'error' && <Button size="small" type="link" onClick={onRetrySave}>{t.retry}</Button>}
            </div>
            <p className={styles.hint}>{t.saveHint}</p>
        </footer>
    </div>
    return screens.lg
        ? <aside hidden={!visible} className={styles.sidebar} aria-labelledby={headingId}>{panel}</aside>
        : <Drawer open={visible} onClose={close} width="min(100vw, 400px)" closable={false} title={null} forceRender
            styles={{ body: { padding: 0 } }} rootClassName={styles.drawer} aria-label={t.title}>{panel}</Drawer>
}
