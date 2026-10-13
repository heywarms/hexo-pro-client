import { documentRouteId } from '@/utils/documentIdentity'
import { Button, Image, Popconfirm, Space, message, Row, Col, Card, Pagination, Dropdown, Typography, Modal, Form, Input, Spin, Empty, Select } from "antd"
import { SendOutlined, RollbackOutlined, PictureOutlined } from "@ant-design/icons"
import React, { useContext, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import service from "@/utils/api"
import useLocale from "@/hooks/useLocale"
import useDeviceDetect from "@/hooks/useDeviceDetect"
import { GlobalContext } from "@/context"
import { openDesktopLink } from "@/utils/desktopUtils"
import IconLink from "@/assets/link.svg"
import Iconllipsis from "@/assets/ellipsis.svg"
import defaultCover from "@/assets/defaultCover.png"
import styles from './style/index.module.less'

const { Text } = Typography

interface Props {
    published?: boolean; // 保持可选状态
    isPage?: boolean;
    showPublishStatus?: boolean;
}

interface DataType {
    key: string;
    _id: string;
    cover: string;
    title: string;
    permalink: string;
    date: string;
    updated: string;
    option: string
}



function ArticleList({ published, isPage = false, showPublishStatus = true }) {
    const { isMobile } = useDeviceDetect()
    const { theme } = useContext(GlobalContext)
    const [postList, setPostList] = useState([])
    const [currentPage, setCurrentPage] = useState(1)
    const [total, setTotal] = useState(0)
    const navigate = useNavigate()
    
    // 封面显示设置 - 初始化时就从localStorage读取
    const [showCover, setShowCover] = useState(() => {
        const savedShowCover = localStorage.getItem('hexoProShowCover')
        return savedShowCover !== null ? savedShowCover === 'true' : true
    })
    
    // 根据封面显示设置和设备类型计算pageSize
    const [pageSize, setPageSize] = useState(() => {
        const savedShowCover = localStorage.getItem('hexoProShowCover')
        const initialShowCover = savedShowCover !== null ? savedShowCover === 'true' : true
        if (!initialShowCover) {
            return isMobile ? 12 : 16
        } else {
            return isMobile ? 6 : 9
        }
    })
    
    // 添加依赖跟踪，避免重复请求
    const [requestKey, setRequestKey] = useState(0)

    // 状态管理封面设置对话框
    const [coverModalVisible, setCoverModalVisible] = useState(false)
    const [currentPost, setCurrentPost] = useState(null)
    const [form] = Form.useForm()
    // 添加一个状态来强制更新预览
    const [previewUrl, setPreviewUrl] = useState('')
    
    // 图床选择器相关状态
    const [imagePickerVisible, setImagePickerVisible] = useState(false)
    const [imageList, setImageList] = useState([])
    const [imageLoading, setImageLoading] = useState(false)
    const [currentFolder, setCurrentFolder] = useState('')
    const [folderList, setFolderList] = useState([])
    const [imagePage, setImagePage] = useState(1)
    const [imagePageSize, setImagePageSize] = useState(isMobile ? 8 : 12)
    const [imageTotal, setImageTotal] = useState(0)

    const t = useLocale()

    const removeSource = async (item) => {
        try {
            // 执行删除操作
            const deleteApiPath = isPage ? '/hexopro/api/pages' : '/hexopro/api/posts'
            await service.get(`${deleteApiPath}/${documentRouteId(item)}/remove`)

            // 重新查询数据并更新列表
            const listApiPath = isPage ? '/hexopro/api/pages/list' : '/hexopro/api/posts/list'
            const res = await service.get(listApiPath, { params: { published: published, page: currentPage, pageSize: pageSize } })
            const result = res.data.data.map((obj, i) => {
                return { _id: obj._id, documentId: obj.documentId, title: obj.title, cover: obj.cover, date: obj.date, permalink: obj.permalink, updated: obj.updated, key: i + 1 }
            })

            // 更新列表
            setPostList(result)
            
            // 保持当前页码
            setCurrentPage(currentPage)
            setTotal(res.data.total)
        } catch (err) {
            message.error(err.message)
        }
    }

    const handleTableChange = (pagination) => {
        setCurrentPage(pagination)
    }

    const openCoverModal = (item, e) => {
        e.stopPropagation()
        setCurrentPost(item)
        setCoverModalVisible(true)
        // 重置预览URL
        setPreviewUrl('')
        // 如果当前文章有封面，则设置为初始值
        if (item.cover) {
            form.setFieldsValue({ value: item.cover })
            setPreviewUrl(item.cover)
        }
    }

    const handleCoverSubmit = async () => {
        let url = '/hexopro/api/updateFrontMatter'
        if (isPage) {
            url = '/hexopro/api/updatePageFrontMatter'
        }
        service.post(url, {
            permalink: documentRouteId(currentPost),
            key: form.getFieldValue('key'),
            value: form.getFieldValue('value')
        }).then(res => {
            if (res.status === 200) {
                message.success('封面设置成功')
                setCoverModalVisible(false)
                queryPosts()
            } else {
                message.error('封面设置失败')
            }
        })
    }
    
    // 打开图床选择器
    const openImagePicker = () => {
        setImagePickerVisible(true)
        fetchImages(1)
    }
    
    // 获取图床图片列表
    const fetchImages = async (page = imagePage) => {
        setImageLoading(true)
        try {
            const res = await service.get('/hexopro/api/images/list', {
                params: {
                    page: page,
                    pageSize: imagePageSize,
                    folder: currentFolder
                }
            })
            
            setImageList(res.data.images || [])
            setFolderList(res.data.folders || [])
            setImageTotal(res.data.total || 0)
            setImagePage(page)
        } catch (error) {
            message.error('获取图片列表失败')
            console.error(error)
        } finally {
            setImageLoading(false)
        }
    }
    
    // 处理文件夹变化
    const handleFolderChange = (folder) => {
        setCurrentFolder(folder)
        fetchImages(1)
    }
    
    // 处理图片页码变化
    const handleImagePageChange = (page) => {
        setImagePage(page)
        fetchImages(page)
    }
    
    // 选择图片作为封面
    const selectImageAsCover = (imageUrl) => {
        form.setFieldsValue({ value: imageUrl })
        setPreviewUrl(imageUrl)
        setImagePickerVisible(false)
    }

    // 添加发布和撤销发布的处理函数
    const handlePublish = async (item, e) => {
        e.stopPropagation()
        try {
            const publishApiPath = '/hexopro/api/posts/' + documentRouteId(item) + '/publish'
            const res = await service.get(publishApiPath)
            if (res.status === 200) {
                message.success(t['content.articleList.publish.success'] || '文章发布成功')
                queryPosts()
            }
        } catch (err) {
            message.error(err.message || t['content.articleList.publish.error'] || '发布失败')
        }
    }

    const handleUnpublish = async (item, e) => {
        e.stopPropagation()
        try {
            const unpublishApiPath = '/hexopro/api/posts/' + documentRouteId(item) + '/unpublish'
            const res = await service.get(unpublishApiPath)
            if (res.status === 200) {
                message.success(t['content.articleList.unpublish.success'] || '文章已撤回到草稿箱')
                queryPosts()
            }
        } catch (err) {
            message.error(err.message || t['content.articleList.unpublish.error'] || '撤回失败')
        }
    }

    const queryPosts = () => {
        // console.log('queryPosts', pageSize)
        const listApiPath = isPage ? '/hexopro/api/pages/list' : '/hexopro/api/posts/list'
        service.get(listApiPath, { params: { published: published, page: currentPage, pageSize: pageSize } })
            .then(res => {
                const result = res.data.data.map((obj, i) => {
                    setTotal(res.data.total)
                    return { _id: obj._id, documentId: obj.documentId, slug: obj.slug, title: obj.title, cover: obj.cover, date: obj.date, permalink: obj.permalink, source: obj.source, updated: obj.updated, key: i + 1, isDraft: obj.isDraft }
                })
                setPostList(result)
            })
    }



    // 当设备类型或封面显示设置变化时，更新pageSize
    useEffect(() => {
        const newPageSize = !showCover ? (isMobile ? 12 : 16) : (isMobile ? 6 : 9)
        if (newPageSize !== pageSize) {
            setPageSize(newPageSize)
            // 重置到第一页
            setCurrentPage(1)
            // 触发数据重新加载
            setRequestKey(prev => prev + 1)
        }
    }, [isMobile, showCover, pageSize])

    // 统一的数据加载Effect，只依赖必要的参数
    useEffect(() => {
        queryPosts()
    }, [currentPage, pageSize, published, requestKey])

    return (
        <div style={{
            padding: '16px 8px',
            // maxWidth: 1200,
            margin: '0 auto'
        }}>
            <Row gutter={[16, 16]}>
                {postList.map(item => (
                    <Col key={item.documentId || item._id}
                         xs={showCover ? 24 : 12} 
                         sm={showCover ? 12 : 12} 
                         md={showCover ? 8 : 6} 
                         lg={showCover ? 8 : 6} 
                         xl={showCover ? 8 : 6}>
                        <Card
                            hoverable
                            cover={
                                showCover ? (
                                    item.cover ? (
                                        <Image
                                            src={item.cover}
                                            alt={item.title}
                                            style={{
                                                height: 190,
                                                objectFit: 'cover',
                                                borderBottom: '1px solid #f0f0f0'
                                            }}
                                            preview={false}
                                        />
                                    ) : (
                                        <Image
                                            src={defaultCover}
                                            alt="cover"
                                            style={{
                                                height: 190,
                                                objectFit: 'cover',
                                                borderBottom: '1px solid #f0f0f0',
                                                background: '#f5f5f5'
                                            }}
                                            preview={false}
                                        />
                                    )
                                ) : null
                            }
                            style={{
                                transition: 'all 0.3s',
                                borderRadius: 8,
                                position: 'relative',
                                // 当隐藏封面时，减少卡片的高度
                                minHeight: showCover ? 'auto' : '120px'
                            }}
                            bodyStyle={{
                                padding: showCover ? '24px' : '16px',
                                paddingTop: showCover ? '24px' : '12px'
                            }}
                            onClick={() => !isPage ? navigate(`/post/${documentRouteId(item)}`) : navigate(`/page/${documentRouteId(item)}`)}
                        >
                            <div
                                className={`${styles['card-action-group']} ${
                                    showCover ? styles['card-action-group-cover'] : styles['card-action-group-compact']
                                } ${theme === 'dark' ? styles['card-action-group-dark'] : ''}`}
                            >
                                <Space size={showCover ? 'small' : 4} direction={showCover ? 'horizontal' : 'vertical'}>
                                    {/* 添加发布/撤销发布按钮 */}
                                    {!isPage && (
                                        published ? (
                                            <span className={`${showCover ? styles['card-action-btn'] : styles['card-action-btn-compact']} ${theme === 'dark' ? 'dark' : ''}`}>
                                                <Button
                                                    type="text"
                                                    size={showCover ? 'middle' : 'small'}
                                                    style={{ color: 'rgba(0, 0, 0, 0.45)' }}
                                                    onClick={(e) => handleUnpublish(item, e)}
                                                    icon={<RollbackOutlined />}
                                                    title={t['content.articleList.btn.unpublish'] || '撤回到草稿箱'}
                                                />
                                            </span>
                                        ) : (
                                            <span className={`${showCover ? styles['card-action-btn'] : styles['card-action-btn-compact']} ${theme === 'dark' ? 'dark' : ''}`}>
                                                <Button
                                                    type="text"
                                                    size={showCover ? 'middle' : 'small'}
                                                    style={{ color: 'rgba(0, 0, 0, 0.45)' }}
                                                    onClick={(e) => handlePublish(item, e)}
                                                    icon={<SendOutlined />}
                                                    title={t['content.articleList.btn.publish'] || '发布文章'}
                                                />
                                            </span>
                                        )
                                    )}
                                    {
                                        (!item.isDraft) && (
                                            <span className={`${showCover ? styles['card-action-btn'] : styles['card-action-btn-compact']} ${theme === 'dark' ? 'dark' : ''}`}>
                                                <Button
                                                    type="text"
                                                    size={showCover ? 'middle' : 'small'}
                                                    style={{ color: 'rgba(0, 0, 0, 0.45)' }}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        openDesktopLink(item.permalink)
                                                    }}
                                                    icon={theme === 'dark' ? <IconLink /> : <IconLink />}
                                                >
                                                </Button>
                                            </span>
                                        )
                                    }
                                    {/* 其他按钮保持不变 */}
                                    
                                        <Dropdown
                                            menu={{
                                                items: [
                                                    {
                                                        key: 'edit',
                                                        label: (
                                                            <Link to={isPage ? `/page/${documentRouteId(item)}` : `/post/${documentRouteId(item)}`} onClick={(event) => event.stopPropagation()}>
                                                                {t['content.articleList.btn.edit']}
                                                            </Link>
                                                        )
                                                    },
                                                    {
                                                        key: 'setCover',
                                                        label: (
                                                            <div onClick={(e) => openCoverModal(item, e)}>
                                                                {t['content.articleList.table.cover'] || '封面'}
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        key: 'delete',
                                                        label: (
                                                            <div onClick={(e) => e.stopPropagation()}>
                                                                <Popconfirm
                                                                    title={t['editor.header.pop.title']}
                                                                    description={t['list.editor.header.pop.des']}
                                                                    onConfirm={(event) => {
                                                                        if (event && event.stopPropagation) event.stopPropagation()
                                                                        removeSource(item)
                                                                    }}
                                                                >
                                                                    <Text type="danger" onClick={(event) => {
                                                                        event.stopPropagation()
                                                                        event.preventDefault()
                                                                    }}>
                                                                        {t['content.articleList.btn.delete']}
                                                                    </Text>
                                                                </Popconfirm>
                                                            </div>
                                                        )
                                                    }
                                                ]
                                            }}
                                            placement="bottomRight"
                                        >
                                        <span className={`${showCover ? styles['card-action-btn'] : styles['card-action-btn-compact']} ${theme === 'dark' ? 'dark' : ''}`}>
                                                <Button
                                                    type="text"
                                                    size={showCover ? 'middle' : 'small'}
                                                    icon={theme === 'dark' ? <Iconllipsis /> : <Iconllipsis />}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                    }}
                                                />
                                            </span>
                                        </Dropdown>
                                    
                                </Space>
                            </div>

                            <Card.Meta
                                title={
                                    <Text 
                                        ellipsis={{ tooltip: item.title }} 
                                        style={{ 
                                            maxWidth: showCover ? 'calc(100% - 80px)' : 'calc(100% - 70px)',
                                            fontSize: showCover ? '16px' : '14px',
                                            fontWeight: showCover ? 'normal' : '500',
                                            lineHeight: showCover ? 'normal' : '1.3',
                                            display: 'block'
                                        }}
                                    >
                                        {item.title}
                                    </Text>
                                }
                                description={
                                    <div style={{ marginTop: showCover ? 8 : 4, paddingRight: showCover ? 0 : '26px' }}>
                                        <div style={{ fontSize: showCover ? '14px' : '12px', color: 'rgba(0, 0, 0, 0.45)' }}>
                                            {t['content.articleList.table.date']}: {item.date}
                                        </div>
                                        <div style={{ marginTop: showCover ? 4 : 2, fontSize: showCover ? '14px' : '12px', color: 'rgba(0, 0, 0, 0.45)' }}>
                                            {t['content.articleList.table.updated']}: {item.updated}
                                        </div>
                                        {showPublishStatus && (
                                            <div style={{ marginTop: showCover ? 4 : 2, fontSize: showCover ? '14px' : '12px' }}>
                                                {published ? t['content.status.published'] : t['content.status.draft']}
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* 封面设置对话框 */}
            <Modal
                title={t['content.articleList.table.cover'] || '封面'}
                open={coverModalVisible}
                onOk={handleCoverSubmit}
                onCancel={() => setCoverModalVisible(false)}
                okText={t['content.articleList.cover.ok'] || '确定'}
                cancelText={t['content.articleList.cover.cancel'] || '取消'}
                width={isMobile ? '90%' : 520}
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ key: 'cover', value: '' }}
                >
                    <Form.Item
                        name="key"
                        label={t['content.articleList.cover.keyLabel'] || '属性名称'}
                        rules={[{ required: true, message: t['content.articleList.cover.keyRequired'] || '请输入属性名称' }]}
                    >
                        <Input placeholder={t['content.articleList.cover.keyPlaceholder'] || '例如: cover'} />
                    </Form.Item>
                    <Form.Item
                        name="value"
                        label={t['content.articleList.cover.valueLabel'] || '图片URL'}
                        rules={[{ required: true, message: t['content.articleList.cover.valueRequired'] || '请输入图片URL' }]}
                    >
                        <Input
                            placeholder={t['content.articleList.cover.valuePlaceholder'] || 'example: https://example.com/image.jpg'}
                            onChange={(e) => {
                                // 当输入值变化时，更新预览URL
                                setPreviewUrl(e.target.value)
                            }}
                            onPaste={(e) => {
                                // 粘贴时立即更新预览URL
                                setTimeout(() => {
                                    const pastedValue = form.getFieldValue('value')
                                    setPreviewUrl(pastedValue)
                                }, 0)
                            }}
                            style={{
                                color: theme === 'dark' ? '#e6e6e6' : '#000000',
                                backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
                                borderColor: theme === 'dark' ? '#333333' : '#d9d9d9'
                            }}
                            addonAfter={
                                <Button
                                    type="link"
                                    icon={<PictureOutlined />}
                                    onClick={openImagePicker}
                                    style={{
                                        margin: -7,
                                        color: theme === 'dark' ? '#e6e6e6' : '#000000'
                                    }}
                                >
                                    {t['content.articleList.imagePicker.title']}
                                </Button>
                            }
                        />
                    </Form.Item>
                    {/* 使用previewUrl状态而不是form.getFieldValue('value')来控制预览 */}
                    {previewUrl && (
                        <div style={{ marginTop: 16 }}>
                            <p>{t['content.articleList.cover.preview'] || '预览'}:</p>
                            <div style={{ position: 'relative' }}>
                                <Image
                                    src={previewUrl}
                                    alt="预览"
                                    style={{ maxWidth: '100%', maxHeight: 200 }}
                                    fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3PTWBSGcbGzM6GCKqlIBRV0dHRJFarQ0eUT8LH4BnRU0NHR0UEFVdIlFRV7TzRksomPY8uykTk/zewQfKw/9znv4yvJynLv4uLiV2dBoDiBf4qP3/ARuCRABEFAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghgg0Aj8i0JO4OzsrPv69Wv+hi2qPHr0qNvf39+iI97soRIh4f3z58/u7du3SXX7Xt7Z2enevHmzfQe+oSN2apSAPj09TSrb+XKI/f379+08+A0cNRE2ANkupk+ACNPvkSPcAAEibACyXUyfABGm3yNHuAECRNgAZLuYPgEirKlHu7u7XdyytGwHAd8jjNyng4OD7vnz51dbPT8/7z58+NB9+/bt6jU/TI+AGWHEnrx48eJ/EsSmHzx40L18+fLyzxF3ZVMjEyDCiEDjMYZZS5wiPXnyZFbJaxMhQIQRGzHvWR7XCyOCXsOmiDAi1HmPMMQjDpbpEiDCiL358eNHurW/5SnWdIBbXiDCiA38/Pnzrce2YyZ4//59F3ePLNMl4PbpiL2J0L979+7yDtHDhw8vtzzvdGnEXdvUigSIsCLAWavHp/+qM0BcXMd/q25n1vF57TYBp0a3mUzilePj4+7k5KSLb6gt6ydAhPUzXnoPR0dHl79WGTNCfBnn1uvSCJdegQhLI1vvCk+fPu2ePXt2tZOYEV6/fn31dz+shwAR1sP1cqvLntbEN9MxA9xcYjsxS1jWR4AIa2Ibzx0tc44fYX/16lV6NDFLXH+YL32jwiACRBiEbf5KcXoTIsQSpzXx4N28Ja4BQoK7rgXiydbHjx/P25TaQAJEGAguWy0+2Q8PD6/Ki4R8EVl+bzBOnZY95fq9rj9zAkTI2SxdidBHqG9+skdw43borCXO/ZcJdraPWdv22uIEiLA4q7nvvCug8WTqzQveOH26fodo7g6uFe/a17W3+nFBAkRYENRdb1vkkz1CH9cPsVy/jrhr27PqMYvENYNlHAIesRiBYwRy0V+8iXP8+/fvX11Mr7L7ECueb/r48eMqm7FuI2BGWDEG8cm+7G3NEOfmdcTQw4h9/55lhm7DekRYKQPZF2ArbXTAyu4kDYB2YxUzwg0gi/41ztHnfQG26HbGel/crVrm7tNY+/1btkOEAZ2M05r4FB7r9GbAIdxaZYrHdOsgJ/wCEQY0J74TmOKnbxxT9n3FgGGWWsVdowHtjt9Nnvf7yQM2aZU/TIAIAxrw6dOnAWtZZcoEnBpNuTuObWMEiLAx1HY0ZQJEmHJ3HNvGCBBhY6jtaMoEiJB0Z29vL6ls58vxPcO8/zfrdo5qvKO+d3Fx8Wu8zf1dW4p/cPzLly/dtv9Ts/EbcvGAHhHyfBIhZ6NSiIBTo0LNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUIEKFQsw01J0CEnI1KIQJEKNRsQ80JECFno1KIABEKNdtQcwJEyNmoFCJAhELNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUEiHBwcHB1IwA24OTk5FruBiBBhF++fGvX0IyfX19fX98Yr/8dGFkWtLRJg8WAi8DxP99PAOiDUaZp2wAAAABJRU5ErkJggg=="
                                    onError={(e) => {
                                        message.error('图片链接无效，请检查URL')
                                    }}
                                />
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    textAlign: 'center',
                                    padding: '8px',
                                    display: 'none' // 默认隐藏，图片加载失败时显示
                                }}
                                    id="image-error-message">
                                    <Text type="danger">图片链接无效，请检查URL</Text>
                                </div>
                            </div>
                        </div>
                    )}
                </Form>
            </Modal>
            
            {/* 图床选择器对话框 */}
            <Modal
                title={t['content.articleList.imagePicker.title'] || "从图床选择图片"}
                open={imagePickerVisible}
                onCancel={() => setImagePickerVisible(false)}
                footer={null}
                width={isMobile ? '95%' : 800}
                bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
            >
                <div style={{ marginBottom: 16 }}>
                    <Space>
                        <span>{t['content.articleList.imagePicker.currentFolder'] || "当前文件夹"}:</span>
                        <Select
                            value={currentFolder}
                            onChange={handleFolderChange}
                            style={{ width: isMobile ? 200 : 300 }}
                            placeholder={t['content.articleList.imagePicker.selectFolder'] || "选择文件夹"}
                        >
                            <Select.Option value="">{t['content.articleList.imagePicker.rootFolder'] || "根目录"}</Select.Option>
                            {folderList.map(folder => (
                                <Select.Option key={folder} value={folder}>{folder}</Select.Option>
                            ))}
                        </Select>
                    </Space>
                </div>
                
                <Spin spinning={imageLoading}>
                    {imageList.length > 0 ? (
                        <div>
                            <Row gutter={[16, 16]}>
                                {imageList.map(image => (
                                    <Col xs={12} sm={8} md={6} key={image.path}>
                                        <Card
                                            hoverable
                                            cover={
                                                <div style={{ height: 120, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Image
                                                        src={image.path}
                                                        alt={image.name}
                                                        style={{ maxHeight: '100%', objectFit: 'contain' }}
                                                        preview={false}
                                                    />
                                                </div>
                                            }
                                            onClick={() => selectImageAsCover(image.path)}
                                            bodyStyle={{ padding: '8px', textAlign: 'center' }}
                                        >
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {image.name}
                                            </div>
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                            
                            {imageTotal > imagePageSize && (
                                <div style={{ textAlign: 'center', marginTop: 16 }}>
                                    <Pagination
                                        current={imagePage}
                                        pageSize={imagePageSize}
                                        total={imageTotal}
                                        onChange={handleImagePageChange}
                                        showSizeChanger={false}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <Empty description={t['content.articleList.imagePicker.noImages'] || "暂无图片"} />
                    )}
                </Spin>
            </Modal>

            <div style={{
                marginTop: 24,
                textAlign: 'center',
                padding: '16px 0',
                display: 'flex',
                justifyContent: 'center'
            }}>
                <Pagination
                    onChange={handleTableChange}
                    current={currentPage}
                    total={total}
                    pageSize={pageSize}
                    showSizeChanger={false}
                    responsive
                />
            </div>
        </div>
    )
}

export default ArticleList
