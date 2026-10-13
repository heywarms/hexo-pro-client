import React, { useContext, useEffect, useRef } from 'react'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { basicSetup } from 'codemirror'
import { GlobalContext } from '@/context'

const externalChange = Annotation.define<boolean>()

type Props = {
    value: string
    onChange: (value: string) => void
    onReady: () => void
}

export default function SourceEditor({ value, onChange, onReady }: Props) {
    const host = useRef<HTMLDivElement>(null)
    const view = useRef<EditorView>()
    const latest = useRef({ value, onChange, onReady })
    latest.current = { value, onChange, onReady }
    const { theme } = useContext(GlobalContext)

    useEffect(() => {
        const dark = theme === 'dark'
        const editor = new EditorView({
            parent: host.current,
            state: EditorState.create({
                doc: latest.current.value,
                extensions: [
                    basicSetup,
                    markdown(),
                    EditorView.lineWrapping,
                    EditorView.contentAttributes.of({ 'aria-label': 'Markdown 源码编辑器', spellcheck: 'false' }),
                    EditorView.updateListener.of(update => {
                        if (update.docChanged && !update.transactions.some(tr => tr.annotation(externalChange))) {
                            latest.current.onChange(update.state.doc.toString())
                        }
                    }),
                    EditorView.theme({
                        '&': { height: '100%', backgroundColor: 'var(--paper)', color: 'var(--text)', fontSize: '14px' },
                        '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.8' },
                        '.cm-content': { padding: '12px 16px 100px', minHeight: '100%' },
                        '.cm-gutters': { backgroundColor: 'var(--paper)', color: 'var(--muted)', border: 'none' },
                        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--surface)' },
                        '.cm-cursor': { borderLeftColor: dark ? '#fff' : '#37352f' },
                        '&.cm-focused': { outline: 'none' },
                    }, { dark }),
                ],
            }),
        })
        view.current = editor
        latest.current.onReady()
        return () => { editor.destroy(); view.current = undefined }
    }, [theme])

    useEffect(() => {
        const editor = view.current
        if (editor && editor.state.doc.toString() !== value) {
            editor.dispatch({
                changes: { from: 0, to: editor.state.doc.length, insert: value },
                annotations: externalChange.of(true),
            })
        }
    }, [value])

    return <div ref={host} style={{ height: '100%', minHeight: 0 }} />
}
