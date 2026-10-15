import React, { useContext, useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { GlobalContext } from '@/context'

type Props = { id: string; initialValue: string; height: string; onChange?: (value: string) => void; readOnly?: boolean }

export default function YamlEditor({ id, initialValue, height, onChange, readOnly = false }: Props) {
  const { theme } = useContext(GlobalContext)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const container = containerRef.current as HTMLDivElement & { getValue?: () => string; layout?: () => void }
    if (!container) return
    const editor = monaco.editor.create(container, {
      value: initialValue || '', language: 'yaml', automaticLayout: true,
      minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on',
      lineNumbers: 'on', lineNumbersMinChars: 3, tabSize: 2, fontSize: 14, lineHeight: 24,
      fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", monospace',
      padding: { top: 18, bottom: 18 }, renderLineHighlight: 'gutter',
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      overviewRulerLanes: 0, readOnly, ariaLabel: 'YAML editor',
    })
    editorRef.current = editor
    const subscription = editor.onDidChangeModelContent(() => onChangeRef.current?.(editor.getValue()))
    container.getValue = () => editor.getValue()
    container.layout = () => editor.layout()
    return () => {
      subscription.dispose()
      const model = editor.getModel()
      editor.dispose()
      model?.dispose()
      editorRef.current = null
      delete container.getValue
      delete container.layout
    }
  }, [id])

  useEffect(() => {
    const dark = theme === 'dark'
    monaco.editor.defineTheme('hexopro-yaml', {
      base: dark ? 'vs-dark' : 'vs', inherit: true, rules: [],
      colors: { 'editor.background': dark ? '#1d1f23' : '#ffffff', 'editorLineNumber.foreground': dark ? '#7d8797' : '#9aa3b2', 'editor.lineHighlightBackground': dark ? '#24282f' : '#f7f9fc' },
    })
    monaco.editor.setTheme('hexopro-yaml')
  }, [theme])
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== (initialValue || '')) editorRef.current.setValue(initialValue || '')
  }, [initialValue])
  useEffect(() => { editorRef.current?.updateOptions({ readOnly }) }, [readOnly])
  useEffect(() => { editorRef.current?.layout() }, [height])

  return <div id={id} ref={containerRef} style={{ height, width: '100%', minHeight: 0 }} />
}
