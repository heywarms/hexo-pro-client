import React from 'react'
import { Input, Modal, Typography } from 'antd'

// Never silently retry a stale document against a newer server revision.
export function reviewSaveConflict({ remote, title, content, onKeepLocal, isActive }: any) {
    return new Promise<void>((resolve, reject) => {
        Modal.confirm({
            title: '比较文章版本', width: 800, okText: '用当前编辑内容保存', cancelText: '返回继续编辑',
            content: <><p>确认保存会替换下方服务器版本。也可以先返回编辑器合并内容，或导出当前稿件。</p>
                <Typography.Text strong>服务器版本：{remote.title}</Typography.Text>
                <Input.TextArea aria-label="服务器版本" readOnly autoSize={{ minRows: 4, maxRows: 10 }} value={remote._content || ''} />
                <Typography.Text strong>当前编辑：{title}</Typography.Text>
                <Input.TextArea aria-label="当前编辑版本" readOnly autoSize={{ minRows: 4, maxRows: 10 }} value={content} /></>,
            onOk: async () => { try { if (isActive()) await onKeepLocal(remote.revision); resolve() } catch (error) { reject(error); throw error } },
            onCancel: () => resolve(),
        })
    })
}
