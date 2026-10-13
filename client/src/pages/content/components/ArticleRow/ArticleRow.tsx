import React from 'react'
import { theme as antdTheme, Typography } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import styles from './index.module.less'

const { Text } = Typography

export interface ArticleRowProps {
    title: string
    cover?: string
    /** 第二行灰色元信息（如：更新于 xxx · file.md） */
    meta?: React.ReactNode
    /** 标题右侧的附加标记（如状态 Tag） */
    titleExtra?: React.ReactNode
    /** 右侧操作区 */
    actions?: React.ReactNode
    onClick?: () => void
}

/** 内容列表通用行：缩略图 + 标题 + 元信息 + 右侧操作，颜色全部来自 antd token，支持暗色模式 */
export default function ArticleRow({ title, cover, meta, titleExtra, actions, onClick }: ArticleRowProps) {
    const { token } = antdTheme.useToken()
    const [broken, setBroken] = React.useState(false)
    const vars = {
        '--row-hover-bg': token.controlItemBgHover,
        '--row-divider': token.colorSplit,
        '--thumb-bg': token.colorFillTertiary,
        '--thumb-icon': token.colorTextQuaternary,
        '--row-radius': `${token.borderRadius}px`,
    } as React.CSSProperties

    return (
        <div className={styles.row} style={vars} onClick={onClick} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' && onClick) onClick() }}>
            <div className={styles.thumb}>
                {cover && !broken
                    ? <img src={cover} alt={title} loading="lazy" onError={() => setBroken(true)} />
                    : <FileTextOutlined className={styles.thumbIcon} />}
            </div>
            <div className={styles.main}>
                <div className={styles.titleLine}>
                    <Text strong ellipsis={{ tooltip: title }} className={styles.title}>{title}</Text>
                    {titleExtra}
                </div>
                {meta && <Text type="secondary" ellipsis className={styles.meta}>{meta}</Text>}
            </div>
            {actions && <div className={styles.actions} onClick={(e) => e.stopPropagation()}>{actions}</div>}
        </div>
    )
}
