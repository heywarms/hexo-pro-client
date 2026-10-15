import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeftOutlined, DeleteOutlined, ExportOutlined, FileTextOutlined, MoreOutlined, SettingOutlined } from '@ant-design/icons'
import { Button, Dropdown, Modal, Tooltip, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import cs from 'classnames'
import useLocale from '@/hooks/useLocale'
import { openDesktopLink } from '@/utils/desktopUtils'
import IconAI from '@/assets/ai.svg'
import styles from './EditorHeader.module.less'

export default function EditorHeader({ initTitle, isPage, isDraft, popTitle, popDes, className = '', permalink = undefined, handleSettingClick, handleRemoveSource, handlePublish, handleUnpublish, handleAIClick = undefined, beforeBack = undefined, settingsVisible = undefined }) {
    const navigate = useNavigate()
    const locale = useLocale()
    const [modal, contextHolder] = Modal.useModal()
    const [leaving, setLeaving] = useState(false)
    const mounted = useRef(true)
    useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
    const listPath = isPage ? '/content/pages' : isDraft ? '/content/posts/drafts' : '/content/posts/blogs'
    const goBack = async () => {
        setLeaving(true)
        try { await beforeBack?.(); if (mounted.current) navigate(listPath) }
        catch (error) { if (mounted.current) message.error(`尚未保存，已留在编辑器：${error.message}`) }
        finally { if (mounted.current) setLeaving(false) }
    }

    return <header className={cs(styles.header, className)}>
        <div className={styles.documentTrail}>
            <Tooltip title={isPage ? '返回页面列表' : '返回文章列表'}>
                <Button type="text" loading={leaving} aria-label={isPage ? '返回页面列表' : '返回文章列表'} icon={<ArrowLeftOutlined />} onClick={goBack} />
            </Tooltip>
            <div className={styles.breadcrumb}>
                <FileTextOutlined />
                <span>{isPage ? '页面' : '文章'}</span>
                <span className={styles.separator}>/</span>
                <span className={styles.breadcrumbTitle} title={initTitle}>{initTitle || '未命名'}</span>
            </div>
            <span className={styles.documentState} data-draft={!isPage && isDraft}>
                <span aria-hidden="true" />{!isPage && isDraft ? '草稿' : '已发布'}
            </span>
        </div>
        <div className={styles.actions}>
            {handleAIClick && <Button type="text" className={styles.aiButton} icon={<IconAI />} onClick={handleAIClick} aria-label={locale['ai.title'] || 'AI 助手'}>
                <span className={styles.actionLabel}>AI 助手</span>
            </Button>}
            {(isPage || !isDraft) && <Tooltip title="打开已发布页面"><Button type="text" aria-label="打开已发布页面" icon={<ExportOutlined />} onClick={() => openDesktopLink(permalink)} /></Tooltip>}
            <Tooltip title={isPage ? '页面设置' : '文章属性'}><Button type="text" className={styles.propertyToggle}
                aria-label={isPage ? '页面设置' : '文章属性'} aria-expanded={settingsVisible} aria-controls={isPage ? undefined : 'post-properties'}
                icon={<SettingOutlined />} onClick={handleSettingClick}>{!isPage && <span className={styles.actionLabel}>属性</span>}</Button></Tooltip>
            {!isPage && <>
                <span className={styles.actionDivider} />
                {isDraft
                    ? <Button type="primary" className={styles.publishButton} onClick={handlePublish}>{locale['editor.header.publish'] || '发布文章'}</Button>
                    : <Button className={styles.unpublishButton} onClick={handleUnpublish}>{locale['editor.header.unpublish'] || '取消发布'}</Button>}
            </>}
            <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: [
                { key: 'delete', danger: true, icon: <DeleteOutlined />, label: isPage ? '删除页面' : '删除文章', onClick: () => modal.confirm({
                    title: popTitle,
                    content: popDes,
                    okText: '删除',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: handleRemoveSource,
                }) },
            ] }}>
                <Button type="text" aria-label="更多文章操作" icon={<MoreOutlined />} />
            </Dropdown>
        </div>
        {contextHolder}
    </header>
}
