import React from 'react'
import { Alert, Button, Input, Modal, Space, message } from 'antd'

export function exportDraft(title: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(title || '恢复稿件').replace(/[\\/:*?"<>|]/g, '_')}.md`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function RecoveryNotice({ autosave, onRestore, title, content, onResolveConflict }: any) {
    const [modal, contextHolder] = Modal.useModal()
    const records = autosave.recoveries
    const conflict = autosave.saveError?.code === 'REVISION_CONFLICT'
        || autosave.saveError?.response?.data?.code === 'REVISION_CONFLICT'
    const review = (record) => modal.confirm({
        title: '查看未完成保存的修改', width: 720, okText: '恢复到编辑器', cancelText: '暂不恢复',
        content: <><p>恢复后仍会检查服务器版本；其他设备的新修改不会被直接覆盖。</p>
            <p>{record.update.title || title}</p>
            <Input.TextArea aria-label="待恢复的修改" readOnly autoSize={{ minRows: 6, maxRows: 16 }}
                value={record.update._content ?? JSON.stringify(record.update, null, 2)} />
            <Button onClick={() => exportDraft(record.update.title || title, record.update._content ?? JSON.stringify(record.update, null, 2))}>导出副本</Button></>,
        onOk: async () => { const update = await autosave.restore(record); onRestore(update) },
    })
    return <>{contextHolder}
        {records.length > 0 && <Alert type="warning" showIcon message="发现未完成保存的修改"
            description={<Space wrap>{records.map(record => <Space key={record.id}>
                <span>{new Date(record.savedAt).toLocaleString()}</span><Button size="small" onClick={() => review(record)}>查看并恢复</Button>
                <Button size="small" onClick={() => modal.confirm({ title: '删除这份恢复副本？', content: '建议先导出需要保留的内容。', okText: '删除副本', cancelText: '取消',
                    onOk: () => autosave.discard(record) })}>删除副本</Button></Space>)}</Space>} />}
        {autosave.saveError && <Alert type="error" showIcon message={conflict ? '另一处已更新这篇文章，请先处理冲突' : '保存尚未完成'}
            description={<Space wrap><span>{conflict ? '当前编辑内容已保留，查看两个版本后再决定如何保存。' : autosave.saveError.message}</span>
                <Button size="small" onClick={() => exportDraft(title, content)}>导出当前内容</Button>
                {conflict && <Button size="small" onClick={() => Promise.resolve(onResolveConflict()).catch(error => message.error(error.message))}>查看冲突</Button>}</Space>} />}
    </>
}
