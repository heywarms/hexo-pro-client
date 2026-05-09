import service from './api'

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIChatRequest {
    messages: AIMessage[];
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
}

export interface AIChatResponse {
    code: number;
    msg?: string;
    data?: any;
}

export interface AIStreamChunk {
    reasoning?: string;
    content?: string;
    done?: boolean;
}

function extractAIErrorMessage(errorData: any, fallback: string): string {
    if (!errorData) return fallback
    if (typeof errorData === 'string') return errorData
    if (typeof errorData.msg === 'string' && errorData.msg.trim()) {
        return errorData.msg.trim()
    }
    if (typeof errorData.error?.message === 'string' && errorData.error.message.trim()) {
        return errorData.error.message.trim()
    }
    if (typeof errorData.message === 'string' && errorData.message.trim()) {
        return errorData.message.trim()
    }
    if (typeof errorData.detail?.error?.message === 'string' && errorData.detail.error.message.trim()) {
        return errorData.detail.error.message.trim()
    }
    if (typeof errorData.detail?.message === 'string' && errorData.detail.message.trim()) {
        return errorData.detail.message.trim()
    }
    return fallback
}

/**
 * AI 流式聊天 - 通过后端代理解决 CORS 问题
 */
export async function* aiChatStream(
    messages: AIMessage[],
    onChunk: (chunk: AIStreamChunk) => void,
    signal?: AbortSignal
): AsyncGenerator<AIStreamChunk> {
    console.log('[AI Stream] 开始流式请求（配置由后端读取）')

    const apiBase =
        process.env.NODE_ENV === 'development'
            ? 'http://127.0.0.1:8001'
            : ''

    const token = localStorage.getItem('hexoProToken')

    const response = await fetch(`${apiBase}/hexopro/api/ai/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({
            messages,
            stream: true,
        }),
        signal,
    })

    console.log('[AI Stream] 收到响应, status:', response.status, 'content-type:', response.headers.get('content-type'))

    // 检查响应状态
    if (!response.ok) {
        let errorMsg = `AI API Error: ${response.status}`
        try {
            const errorData = await response.json()
            errorMsg = extractAIErrorMessage(errorData, errorMsg)
        } catch (e) {
            // 忽略 解析错误
        }
        throw new Error(errorMsg)
    }

    if (!response.body) {
        throw new Error('No response body')
    }

    const contentType = response.headers.get('content-type') || ''

    // 检查是否返回了 JSON 错误而不是流式响应
    if (contentType.includes('application/json')) {
        try {
            const errorData = await response.json()
            throw new Error(extractAIErrorMessage(errorData, 'AI 请求失败，请检查配置'))
        } catch (e) {
            if (e instanceof Error && e.message !== 'AI API Error: ') {
                throw e
            }
            throw new Error('Invalid response from AI API')
        }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    console.log('[AI Stream] Reader 初始化完成，开始读取数据...')

    let reasoningBuffer = ''
    let contentBuffer = ''
    let lineBuffer = '' // 用于累积不完整的 SSE 行
    let chunkCount = 0
    let sseEventCount = 0 // 统计 SSE data 事件数量

    try {
        while (true) {
            let result
            try {
                result = await reader.read()
                console.log('[AI Stream] 读取到数据, done:', result.done, 'value长度:', result.value?.length)
            } catch (readError: any) {
                // 处理网络错误，如 ERR_INCOMPLETE_CHUNKED_ENCODING
                console.error('[AI Stream] 读取错误:', readError)
                // 检查是否是网络错误，如果是则尝试处理已接收的数据
                const errorMessage = readError?.message || ''
                const isNetworkError = errorMessage.includes('network error') ||
                    errorMessage.includes('ERR_INCOMPLETE_CHUNKED_ENCODING') ||
                    errorMessage.includes('Failed to fetch')

                // 如果已经收到了一些数据，尝试处理并结束
                if (contentBuffer || reasoningBuffer) {
                    // 发送已接收的数据作为完成
                    console.log('[AI Stream] 读取出错但有缓存数据，发送完成信号')
                    const finalChunk: AIStreamChunk = { done: true }
                    onChunk(finalChunk)
                    yield finalChunk
                    return
                }

                // 如果没有收到数据且是网络错误，抛出更友好的错误
                if (isNetworkError) {
                    throw new Error('网络连接中断，请检查网络后重试')
                }
                throw new Error(`Stream read failed: ${readError.message}`)
            }

            const { done, value } = result

            // 当 reader 返回 done: true 时，无论是否收到 [DONE] 信号，都应该结束
            if (done) {
                console.log('[AI Stream] Reader done, contentBuffer长度:', contentBuffer.length, 'reasoningBuffer长度:', reasoningBuffer.length)
                // 如果之前已经收到过数据，发送结束信号
                if (contentBuffer || reasoningBuffer) {
                    const finalChunk: AIStreamChunk = { done: true }
                    console.log('[AI Stream] 发送最终 done 信号')
                    onChunk(finalChunk)
                    yield finalChunk
                }
                break
            }

            const chunk = decoder.decode(value, { stream: true })
            chunkCount++
            console.log('[AI Stream] reader.read() #' + chunkCount + ', 原始数据:', chunk.substring(0, 200))
            lineBuffer += chunk

            // 按行分割，保留最后一个不完整的行
            const lines = lineBuffer.split('\n')
            lineBuffer = lines.pop() || ''

            for (const line of lines) {
                const trimmedLine = line.trim()
                if (!trimmedLine) continue

                if (trimmedLine.startsWith('data: ')) {
                    const data = trimmedLine.slice(6)
                    sseEventCount++

                    if (data === '[DONE]') {
                        console.log('[AI Stream] 收到 [DONE] 结束信号')
                        const finalChunk: AIStreamChunk = { done: true }
                        onChunk(finalChunk)
                        yield finalChunk
                        return
                    }

                    try {
                        const parsed = JSON.parse(data)
                        const delta = parsed.choices?.[0]?.delta

                        // 处理 reasoning_content (思考过程)
                        if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) {
                            let newReasoning: string
                            if (reasoningBuffer && delta.reasoning_content.startsWith(reasoningBuffer)) {
                                // 新内容是累积字符串，取增量
                                newReasoning = delta.reasoning_content.slice(reasoningBuffer.length)
                                reasoningBuffer = delta.reasoning_content
                            } else {
                                // 新内容是独立增量，直接追加
                                newReasoning = delta.reasoning_content
                                reasoningBuffer += delta.reasoning_content
                            }

                            if (newReasoning) {
                                const chunkData: AIStreamChunk = { reasoning: newReasoning }
                                onChunk(chunkData)
                                yield chunkData
                                await new Promise(r => setTimeout(r, 0))
                            }
                        }

                        // 处理 content (最终回复)
                        if (delta?.content) {
                            let newContent: string
                            if (contentBuffer && delta.content.startsWith(contentBuffer)) {
                                // 新内容是累积的，取新增部分
                                newContent = delta.content.slice(contentBuffer.length)
                                contentBuffer = delta.content
                            } else {
                                // 新内容是独立的增量，或者不匹配，直接取新内容
                                newContent = delta.content
                                contentBuffer += delta.content
                            }

                            if (newContent) {
                                const chunkData: AIStreamChunk = { content: newContent }
                                onChunk(chunkData)
                                yield chunkData
                                await new Promise(r => setTimeout(r, 0))
                            }
                        }
                    } catch (e) {
                        console.error('[AI Stream] JSON 解析失败:', e)
                        // Skip invalid JSON
                    }
                }
            }
        }

        // 处理最后剩余的 buffer（如果有）
        if (lineBuffer.trim()) {
            const trimmedLine = lineBuffer.trim()
            if (trimmedLine.startsWith('data: ')) {
                const data = trimmedLine.slice(6)
                if (data !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(data)
                        const delta = parsed.choices?.[0]?.delta

                        if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) {
                            let newReasoning = delta.reasoning_content
                            if (reasoningBuffer && delta.reasoning_content.startsWith(reasoningBuffer)) {
                                newReasoning = delta.reasoning_content.slice(reasoningBuffer.length)
                                reasoningBuffer = delta.reasoning_content
                            } else {
                                reasoningBuffer += delta.reasoning_content
                            }
                            if (newReasoning) {
                                const chunkData: AIStreamChunk = { reasoning: newReasoning }
                                onChunk(chunkData)
                                yield chunkData
                                await new Promise(r => setTimeout(r, 0))
                            }
                        }

                        if (delta?.content) {
                            let newContent = delta.content
                            if (contentBuffer && delta.content.startsWith(contentBuffer)) {
                                newContent = delta.content.slice(contentBuffer.length)
                                contentBuffer = delta.content
                            } else {
                                contentBuffer += delta.content
                            }
                            if (newContent) {
                                const chunkData: AIStreamChunk = { content: newContent }
                                onChunk(chunkData)
                                yield chunkData
                                await new Promise(r => setTimeout(r, 0))
                            }
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }
    } finally {
        reader.releaseLock()
        console.log('[AI Stream] 流式响应完成, reader.read() 调用次数:', chunkCount, ', SSE data 事件数:', sseEventCount)
    }
}

/**
 * 非流式 AI 聊天（配置由后端读取）
 */
export async function aiChat(request: AIChatRequest): Promise<AIChatResponse> {
    const response = await service.post('/hexopro/api/ai/chat', {
        messages: request.messages,
        stream: false,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
    })
    return response.data
}
