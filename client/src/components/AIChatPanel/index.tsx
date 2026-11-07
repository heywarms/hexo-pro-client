import React, { useState, useRef, useEffect, useContext } from 'react'
import { Input, Button, message, Spin } from 'antd'
import { SendOutlined, CloseOutlined, CopyOutlined, ReloadOutlined, InsertRowLeftOutlined, EditOutlined } from '@ant-design/icons'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { flushSync } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { GlobalContext } from '@/context'
import useLocale from '@/hooks/useLocale'
import { isAISConfigured } from '@/utils/aiSettings'
import { aiChatStream } from '@/utils/aiService'
import styles from './style.module.less'

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    reasoning?: string;
    reasoningExpanded?: boolean;
    reasoningStartAt?: number;
    reasoningDurationMs?: number;
    isStreaming?: boolean;
}

interface AIChatPanelProps {
    visible: boolean;
    onClose: () => void;
    onInsertContent: (content: string) => void;
}

export default function AIChatPanel({ visible, onClose, onInsertContent }: AIChatPanelProps) {
    const t = useLocale()
    const { theme } = useContext(GlobalContext)
    const [inputValue, setInputValue] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<TextAreaRef>(null)
    const abortControllerRef = useRef<AbortController | null>(null)

    const SCROLL_THRESHOLD = 40

    const formatDuration = (durationMs?: number) => {
        if (!durationMs || durationMs <= 0) return ''
        return `${(durationMs / 1000).toFixed(1)}s`
    }

    const scrollToBottom = (force = false) => {
        const el = contentRef.current
        if (!el) return
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD
        if (force || isNearBottom) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    useEffect(() => {
        if (!visible) {
            setInputValue('')
            setMessages([])
        }
    }, [visible])

    const sendMessage = async (content: string, baseMessages: Message[]) => {
        if (!content.trim()) return

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: content.trim(),
        }

        const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: '',
            reasoning: '',
            reasoningExpanded: true,
            isStreaming: true,
        }

        setMessages(prev => [...prev, userMessage, assistantMessage])
        setInputValue('')
        setIsLoading(true)
        requestAnimationFrame(() => scrollToBottom(true))

        const allMessagesForApi = [
            ...baseMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user' as const, content: userMessage.content }
        ]

        const configured = await isAISConfigured()
        if (!configured) {
            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessage.id
                    ? { ...msg, content: t['ai.notConfigured'], isStreaming: false }
                    : msg
            ))
            setIsLoading(false)
            return
        }

        try {
            abortControllerRef.current = new AbortController()

            // 使用 aiService 的流式接口
            let hasReceivedData = false
            for await (const chunkEvent of aiChatStream(
                allMessagesForApi,
                (chunk) => {
                    // 使用 flushSync 确保状态同步更新，实现打字机效果
                    flushSync(() => {
                        if (chunk.done) {
                            setMessages(prev => prev.map(msg =>
                                msg.id === assistantMessage.id
                                    ? {
                                        ...msg,
                                        isStreaming: false,
                                        reasoningExpanded: msg.reasoning ? false : msg.reasoningExpanded,
                                        reasoningDurationMs: msg.reasoning && !msg.reasoningDurationMs && msg.reasoningStartAt
                                            ? Date.now() - msg.reasoningStartAt
                                            : msg.reasoningDurationMs,
                                    }
                                    : msg
                            ))
                            return
                        }

                        // 收到第一个数据块时，关闭 Spin，开始显示内容
                        if (!hasReceivedData) {
                            hasReceivedData = true
                            setMessages(prev => prev.map(msg =>
                                msg.id === assistantMessage.id
                                    ? { ...msg, isStreaming: false }
                                    : msg
                            ))
                        }

                        setMessages(prev => prev.map(msg => {
                            if (msg.id === assistantMessage.id) {
                                const now = Date.now()
                                const hasNewReasoning = !!chunk.reasoning
                                const hasNewContent = !!chunk.content
                                const nextReasoning = hasNewReasoning ? (msg.reasoning || '') + chunk.reasoning : msg.reasoning
                                const nextContent = hasNewContent ? msg.content + chunk.content : msg.content
                                const shouldCloseReasoning = !!nextReasoning && hasNewContent
                                return {
                                    ...msg,
                                    content: nextContent,
                                    reasoning: nextReasoning,
                                    reasoningStartAt: hasNewReasoning && !msg.reasoningStartAt ? now : msg.reasoningStartAt,
                                    reasoningExpanded: shouldCloseReasoning ? false : (hasNewReasoning ? true : msg.reasoningExpanded),
                                    reasoningDurationMs: shouldCloseReasoning && msg.reasoningStartAt && !msg.reasoningDurationMs
                                        ? now - msg.reasoningStartAt
                                        : msg.reasoningDurationMs,
                                }
                            }
                            return msg
                        }))
                    })
                },
                abortControllerRef.current.signal
            )) {
                // 流式处理在上面的回调中完成
                void chunkEvent
            }

            // 确保流结束后 isStreaming 设为 false
            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessage.id
                    ? { ...msg, isStreaming: false }
                    : msg
            ))
        } catch (error: any) {
            if (error.name === 'AbortError') {
                setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessage.id
                        ? { ...msg, isStreaming: false }
                        : msg
                ))
            } else {
                setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessage.id
                        ? { ...msg, content: `${t['ai.error']}: ${error.message}`, isStreaming: false }
                        : msg
                ))
            }
        } finally {
            setIsLoading(false)
            abortControllerRef.current = null
        }
    }

    const handleSend = () => {
        sendMessage(inputValue.trim(), messages)
    }

    const quickPrompts = [
        t['ai.quick.improve'] || '润色当前段落并保持原意',
        t['ai.quick.summary'] || '总结这段内容并给出小标题',
        t['ai.quick.continue'] || '按当前风格续写两段内容'
    ]

    const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (!isLoading && inputValue.trim()) {
                handleSend()
            }
        }
    }

    const applyQuickPrompt = (prompt: string) => {
        setInputValue(prompt)
        requestAnimationFrame(() => inputRef.current?.focus?.())
    }

    const handleCopy = (content: string) => {
        navigator.clipboard.writeText(content).then(() => {
            message.success(t['ai.copySuccess'])
        })
    }

    const handleRegenerate = () => {
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
        if (!lastUserMessage) return

        const assistantMessages = messages.filter(m => m.role === 'assistant')
        const lastAssistantMsg = assistantMessages[assistantMessages.length - 1]
        const lastAssistantIndex = lastAssistantMsg ? messages.findIndex(m => m.id === lastAssistantMsg.id) : -1

        // 移除最后一对 user + assistant
        const baseMessages = lastAssistantIndex > 0 ? messages.slice(0, lastAssistantIndex - 1) : []
        setMessages(baseMessages)
        setInputValue('')

        sendMessage(lastUserMessage.content, baseMessages)
    }

    const handleInsert = (content: string) => {
        onInsertContent(content)
        message.success(t['ai.insertSuccess'])
    }

    const toggleReasoning = (msgId: string) => {
        setMessages(prev => prev.map(msg => {
            if (msg.id === msgId) {
                return { ...msg, reasoningExpanded: !msg.reasoningExpanded }
            }
            return msg
        }))
    }

    if (!visible) return null

    return (
        <div className={`${styles.panel} ${theme === 'dark' ? styles.dark : ''}`}>
            <div className={styles.header}>
                <div className={styles.titleWrap}>
                    <span className={styles.title}>{t['ai.title']}</span>
                    <span className={styles.subtitle}>
                        {t['ai.panel.subtitle'] || 'Streaming mode enabled'}
                    </span>
                </div>
                <Button
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={onClose}
                    className={styles.closeBtn}
                />
            </div>

            <div ref={contentRef} className={styles.content}>
                {messages.length === 0 && (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon} aria-hidden><EditOutlined /></div>
                        <div className={styles.emptyText}>{t['ai.title']}</div>
                        <div className={styles.quickPrompts}>
                            {quickPrompts.map(prompt => (
                                <Button
                                    key={prompt}
                                    type="default"
                                    size="small"
                                    className={styles.quickPrompt}
                                    onClick={() => applyQuickPrompt(prompt)}
                                >
                                    {prompt}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
                        <div className={styles.messageContent}>
                            {msg.role === 'assistant' ? (
                                <>
                                    {msg.reasoning && (
                                        <div className={styles.reasoning}>
                                            <div
                                                className={styles.reasoningHeader}
                                                onClick={() => toggleReasoning(msg.id)}
                                            >
                                                <span className={styles.reasoningLabel}>
                                                    {msg.isStreaming
                                                        ? (t['ai.thinking'] || 'AI is thinking...')
                                                        : `${t['ai.reasoned'] || 'Reasoned'}${msg.reasoningDurationMs ? ` ${formatDuration(msg.reasoningDurationMs)}` : ''}`}
                                                </span>
                                                <span className={styles.reasoningToggle}>
                                                    {msg.reasoningExpanded ? '▼' : '▶'}
                                                </span>
                                            </div>
                                            {msg.reasoningExpanded && (
                                                <div className={styles.reasoningContent}>{msg.reasoning}</div>
                                            )}
                                        </div>
                                    )}
                                    <div className={styles.markdown}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </>
                            ) : (
                                <div className={styles.userContent}>{msg.content}</div>
                            )}
                            {msg.isStreaming && <Spin size="small" className={styles.streaming} />}
                        </div>

                        {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
                            <div className={styles.actions}>
                                <Button
                                    type="default"
                                    size="small"
                                    icon={<InsertRowLeftOutlined />}
                                    className={styles.actionBtn}
                                    onClick={() => handleInsert(msg.content)}
                                >
                                    {t['ai.insert']}
                                </Button>
                                <Button
                                    type="default"
                                    size="small"
                                    icon={<CopyOutlined />}
                                    className={styles.actionBtn}
                                    onClick={() => handleCopy(msg.content)}
                                >
                                    {t['ai.copy']}
                                </Button>
                                <Button
                                    type="default"
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    className={styles.actionBtn}
                                    onClick={handleRegenerate}
                                >
                                    {t['ai.regenerate']}
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className={styles.footer}>
                <div className={styles.inputWrap}>
                    <Input.TextArea
                        ref={inputRef}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder={t['ai.placeholder']}
                        disabled={isLoading}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        className={styles.input}
                    />
                    <div className={styles.inputHint}>
                        {t['ai.input.hint'] || 'Enter to send, Shift+Enter for newline'}
                    </div>
                </div>
                <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    loading={isLoading}
                    className={styles.sendBtn}
                >
                    {t['ai.send']}
                </Button>
            </div>
        </div>
    )
}
