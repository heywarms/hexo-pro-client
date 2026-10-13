import React, { useContext, useRef, useState, useEffect } from "react"
import { NEW_POST_EVENT } from "@/utils/newPostEvent"
import _ from 'lodash'
import styles from './style/index.module.less'
import Logo from '@/assets/logo3.svg'
import { Avatar, Button, Drawer, Dropdown, Input, List, Menu, MenuProps, Modal, Select, Tag, message, notification } from "antd"
import { AppstoreOutlined, CloudUploadOutlined, CodeOutlined, DownOutlined, EditOutlined, FileTextOutlined, HomeOutlined, MenuOutlined, MoonOutlined, PictureOutlined, PoweroffOutlined, SearchOutlined, SettingOutlined, SunFilled, UserOutlined, GlobalOutlined } from "@ant-design/icons"
import IconLang from "@/assets/lang.svg"
import IconLangLight from "@/assets/langLight.svg"
import useLocale from "@/hooks/useLocale"
import { useSelector } from "react-redux"
import { GlobalState } from "@/store"
import service from "@/utils/api"
import { parseDateTime } from "@/utils/dateTimeUtils"
import { useLocation, useNavigate } from "react-router-dom"
import useStorage from "@/utils/useStorage"
import { GlobalContext } from "@/context"
import cs from 'classnames'
import useDeviceDetect from "@/hooks/useDeviceDetect"
import useRoute from "@/routes"
import { documentRouteId } from "@/utils/documentIdentity"
import { openDesktopLink } from "@/utils/desktopUtils"
import SettingIcon from '../../assets/setting.svg'

type NavbarProps = {
    style?: React.CSSProperties; // 增加style属性
}

export default function Navbar({ style }: NavbarProps) { // 使用props中的style属性
    const navigate = useNavigate()
    const userInfo = useSelector((state: GlobalState) => state.userInfo)
    const { theme, setTheme, setLang } = useContext(GlobalContext)
    const { isMobile } = useDeviceDetect()
    const locale = useLocale()
    const [, setUserStatus] = useStorage('userStatus')

    const [open, setOpen] = useState(false)
    const [title, setTitle] = useState('')
    const [target, setTarget] = useState('Post')
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
    const [searchValue, setSearchValue] = useState('')
    const [searchInfoList, setSearchInfoList] = useState([])
    const [searchLoading, setSearchLoading] = useState(false)
    const [api, contextHolder] = notification.useNotification()
    const [drawerVisible, setDrawerVisible] = useState(false)
    const [availableCategories, setAvailableCategories] = useState<string[]>([])
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [categoryLoading, setCategoryLoading] = useState(false)

    const writeDropList: MenuProps['items'] = [
        {
            key: '1',
            label: (
                <div>
                    {locale['navbar.create.post']}
                </div>
            ),
        },
        {
            key: '2',
            label: (
                <div>
                    {locale['navbar.create.page']}
                </div>
            ),
        }
    ]

    const langDropList: MenuProps['items'] = [
        {
            key: '1',
            label: (
                <div>
                    {locale['navbar.lang.chinese']}
                </div>
            ),
        },
        {
            key: '2',
            label: (
                <div>
                    {locale['navbar.lang.english']}
                </div>
            ),
        },
        {
            key: '3',
            label: (
                <div>
                    {locale['navbar.lang.french']}
                </div>
            ),
        }
    ]

    const settingDropList: MenuProps['items'] = [
        {
            key: '1',
            label: (
                <div>
                    <PoweroffOutlined /> {locale['navbar.logout']}
                </div>
            ),
        }
    ]

    const handleCreateBlog: MenuProps['onClick'] = ({ key }) => {
        setTitle('')
        setSelectedCategories([])
        if (key === '1') {
            setOpen(true)
            setTarget('Post')
        } else if (key === '2') {
            setOpen(true)
            setTarget('Page')
        }
    }

    const handleToggleLang: MenuProps['onClick'] = ({ key }) => {
        if (key === '1') {
            setLang('zh-CN')
        } else if (key === '2') {
            setLang('en-US')
        } if (key === '3') {
            setLang('fr-FR')
        }
    }

    const handleLogout: MenuProps['onClick'] = ({ key }) => {
        if (key === '1') {
            // 清除登录状态
            setUserStatus('logout')
            // 清除token
            localStorage.removeItem('hexoProToken')
            // 跳转到登录页面
            window.location.href = '/pro/login'
        }
    }

    const onCancel = () => {
        setOpen(false)
        setSelectedCategories([])
    }

    const normalizeCategoryValues = (values: string[] = []) => {
        return Array.from(new Set(values.map(item => item.trim()).filter(Boolean)))
    }

    const fetchCategoriesForCreate = async () => {
        try {
            setCategoryLoading(true)
            const res = await service.get('/hexopro/api/tags-categories-and-metadata')
            const categoryMap = res.data?.categories || {}
            const options = Object.keys(categoryMap).map(key => categoryMap[key]).filter(Boolean)
            setAvailableCategories(options)
        } catch (err) {
            console.error('获取分类列表失败', err)
            setAvailableCategories([])
        } finally {
            setCategoryLoading(false)
        }
    }

    const checkTitle = (title: string) => {
        if (!title || title.trim() === '' || title.length > 100) {
            message.error(locale['navbar.modal.error.title'])
            return false
        }
        return true
    }

    const checkTitleExists = async (title: string) => {
        try {
            const res = await service.get('/hexopro/api/posts/check-title', {
                params: { title }
            })
            return res.data.exists
        } catch (err) {
            console.error('检查标题失败', err)
            return false
        }
    }

    const newPost = async () => {
        if (!checkTitle(title)) {
            return
        }
        const categories = normalizeCategoryValues(selectedCategories)
        
        // 检查标题是否已存在
        const exists = await checkTitleExists(title)
        if (exists) {
            // 如果存在，自动添加时间戳后缀
            const uniqueTitle = `${title}${Date.now()}`
            message.info('已存在同名文章，已自动添加区分字符')
            
            service.post('/hexopro/api/posts/new', { title: uniqueTitle, categories }).then((res) => {
                const post = res.data
                post.date = parseDateTime(post.date)
                post.updated = parseDateTime(post.updated)
                navigate(`/post/${documentRouteId(post)}`)
            })
        } else {
            // 如果不存在，直接创建
            service.post('/hexopro/api/posts/new', { title: title, categories }).then((res) => {
                const post = res.data
                post.date = parseDateTime(post.date)
                post.updated = parseDateTime(post.updated)
                navigate(`/post/${documentRouteId(post)}`)
            })
        }
        setOpen(false)
        setSelectedCategories([])
    }

    // 检查页面标题是否已存在
    const checkPageTitleExists = async (title: string) => {
        try {
            // 创建一个临时路径来检查文件是否存在
            const testPath = `${title}/index.md`
            const res = await service.get('/hexopro/api/pages/check-exists', {
                params: { path: testPath }
            })
            return res.data.exists
        } catch (err) {
            console.error('检查页面标题失败', err)
            return false
        }
    }

    const extractCreatedPage = (payload: any) => {
        if (payload?.permalink) return payload
        if (payload?.page?.permalink) return payload.page
        if (payload?.data?.permalink) return payload.data
        return null
    }

    const queryLatestCreatedPage = async (targetTitle: string) => {
        const res = await service.get('/hexopro/api/pages/list', {
            params: { deleted: false, page: 1, pageSize: 20 }
        })
        const pages = res.data?.data || []
        return pages.find((item) => item.title === targetTitle) || pages[0]
    }

    const newPage = async () => {
        if (!checkTitle(title)) {
            return
        }
        
        try {
            // 检查标题是否已存在
            const exists = await checkPageTitleExists(title)
            const finalTitle = exists ? `${title}${Date.now()}` : title
            if (exists) {
                message.info(locale['navbar.page.exists'] || '已存在同名页面，已自动添加区分字符')
            }

            const res = await service.post('/hexopro/api/pages/new', { title: finalTitle })
            let page = extractCreatedPage(res.data)

            // 兼容接口未返回创建实体的情况（例如 204），通过列表回查保证可跳转
            if (!page?.permalink) {
                page = await queryLatestCreatedPage(finalTitle)
            }

            if (!page?.permalink) {
                throw new Error('页面已创建，但未获取到页面链接')
            }

            navigate(`/page/${documentRouteId(page)}`)
        } catch (err) {
            console.log(err)
            api.error({ message: locale['error.title'], description: err.message })
        }
        setOpen(false)
    }

    const onSubmit = () => {
        if (target === 'Post') {
            newPost()
        } else if (target === 'Page') {
            newPage()
        }
    }

    const onSearchClick = () => {
        setIsSearchModalOpen(true)
    }

    const searchBlog = _.debounce((searchValue: string) => {
        setSearchLoading(true)
        service.post('/hexopro/api/blog/search', { searchPattern: searchValue })
            .then(res => {
                const payLoad = res.data
                if (res.status === 200 && payLoad.code === 0) {
                    setSearchInfoList(payLoad.data)
                }
            }).catch(err => {
                api.error({ message: locale['error.title'], description: err.message })
            }).finally(() => {
                setSearchLoading(false)
            })
    }, 300)

    useEffect(() => {
        return () => {
            searchBlog.cancel()
        }
    }, [])

    // 内容页“新建文章”按钮通过事件复用这里的新建流程
    useEffect(() => {
        const onRequestNewPost = () => handleCreateBlog({ key: '1' } as any)
        window.addEventListener(NEW_POST_EVENT, onRequestNewPost)
        return () => window.removeEventListener(NEW_POST_EVENT, onRequestNewPost)
    }, [])

    useEffect(() => {
        if (open && target === 'Post') {
            fetchCategoriesForCreate()
        }
    }, [open, target])

    const onSearchModalChange = (v) => {
        setSearchValue(v.target.value)
        // searchBlog(v.target.value)
    }

    const onSearchModalInput = (v) => {
        searchBlog(v.target.value)
    }

    const onClickSerchitem = (item) => {
        if (!item.isPage) {
            navigate(`/post/${documentRouteId(item)}`)
        } else {
            navigate(`/page/${documentRouteId(item)}`)
        }
    }

    const buildSearchResultTag = (item) => {
        if (item.isPage) {
            return (
                <Tag color="orange">{locale['navbar.search.tag.page']}</Tag>
            )
        } else if (item.isDraft) {
            return (
                <Tag color="default">{locale['navbar.search.tag.draft']}</Tag>
            )
        } else {
            return (
                <Tag color="#2db7f5">{locale['navbar.search.tag.post']}</Tag>
            )
        }
    }

    const handleVisitBlog = () => {
        openDesktopLink('/')
    }

    return (
        <div className={`${styles.navbar} ${styles[theme]}`} style={style}>
            {contextHolder}
            {/* 左侧 */}
            <div className={styles.left}>
                <div className={styles.logo}>
                    <Logo  />
                    <div className={styles['logo-name']}>
                        <span style={{fontWeight: 'bold'}}>Hexo</span> Pro
                    </div>
                </div>
            </div>
            {/* 右侧 */}
            <ul className={styles.right}>
                {isMobile ? (
                    <li>
                    <Button
                        type="default"
                        shape="circle"
                        icon={<MenuOutlined />}
                        onClick={() => setDrawerVisible(true)}
                        className={`${styles.customButtonHover} ${styles[theme]}`}
                    />
                    </li>
                ) : (
                    <>
                         <li>
                    <Button type="default" shape="circle" icon={<SearchOutlined />} onClick={onSearchClick} className={`${styles.customButtonHover} ${styles[theme]}`} />
                </li>
                <li>
                    <Button type="default" shape="circle" icon={<GlobalOutlined />} onClick={handleVisitBlog} className={`${styles.customButtonHover} ${styles[theme]}`} title={locale['navbar.visit.blog'] || '访问博客前台'} />
                </li>
                <li>
                    <Dropdown menu={{ items: langDropList, onClick: handleToggleLang }}>
                        <Button type="default" shape="circle" icon={theme === 'dark' ? <IconLangLight /> : <IconLang />} className={`${styles.customButtonHover} ${styles[theme]}`} />
                    </Dropdown>
                </li>
                <li>
                    <Button type="default" shape="circle" icon={theme === 'dark' ? <SunFilled /> : <MoonOutlined />} className={`${styles.customButtonHover} ${styles[theme]}`}
                        onClick={theme === 'light' ? () => setTheme('dark') : () => setTheme('light')}
                    />
                </li>
                <li >
                    <Dropdown menu={{ items: writeDropList, onClick: handleCreateBlog }}>
                        <Button type="primary" className={`${styles.customButtonHover} ${styles[theme]}`}>{locale['navbar.create']}<DownOutlined /></Button>
                    </Dropdown>
                </li>
                {
                    userInfo && <li>
                        <Dropdown menu={{ items: settingDropList, onClick: handleLogout }}>
                            <Avatar size={32} style={{ cursor: "pointer" }} className={`${styles.customAvatar} ${styles[theme]}`} src={userInfo.avatar}  icon={<UserOutlined />}/>
                        </Dropdown>
                    </li>
                }
                    </>
                )
            
            }
               
            </ul>
            <Modal
                open={open}
                title={locale['navbar.modal.title']}
                onCancel={onCancel}
                footer={
                    [
                        <Button key="back" onClick={onCancel}>{locale['navbar.modal.cancel']}</Button>,
                        <Button key="submit" type="primary" onClick={onSubmit}>{locale['navbar.modal.submit']}</Button>,
                    ]
                }
            >
                <Input placeholder={locale['navbar.modal.input.placeholder']} value={title} onChange={(e) => setTitle(e.target.value)} />
                {target === 'Post' && (
                    <Select
                        mode="tags"
                        style={{ width: '100%', marginTop: 12 }}
                        placeholder={locale['navbar.modal.category.placeholder'] || '请选择或输入分类'}
                        value={selectedCategories}
                        loading={categoryLoading}
                        onChange={(values) => setSelectedCategories(normalizeCategoryValues(values))}
                        options={availableCategories.map(item => ({ label: item, value: item }))}
                    />
                )}
            </Modal>
            <Modal
                className={`${styles[theme]}`}
                width={700}
                title={locale['navbar.search.modal.title']}
                open={isSearchModalOpen}
                footer={[]}
                onCancel={() => setIsSearchModalOpen(false)}
            >
                <div>
                    <Input value={searchValue} placeholder={locale['navbar.search.modal.input.placeholder']}
                        className={`${styles.searchModalInput} ${styles[theme]}`}
                        onChange={onSearchModalChange}
                        onInput={onSearchModalInput}
                    />
                </div>
                <div>
                    <List
                        loading={searchLoading}
                        dataSource={searchInfoList}
                        renderItem={(item) => (
                            <List.Item className={`${styles.searchModalListItem} ${styles[theme]}`} onClick={() => onClickSerchitem(item)}>
                                <div style={{ width: '100%' }}>
                                    <div className={styles.searchListItemWapper}>
                                        <div className={styles.searchListItemLeft}>
                                            <div className={styles.searchListTitlePrefix}></div>
                                            <span className={`${styles.searchModalListItemTitle} ${styles.searchListTitle} ${styles[theme]}`} onClick={() => onClickSerchitem(item)}>{item.title}</span>
                                        </div>
                                        <div className={cs(`${styles.searchModalTag} ${styles[theme]}`, styles.searchListItemRight)}>
                                            {buildSearchResultTag(item)}
                                        </div>
                                    </div>
                                    <div dangerouslySetInnerHTML={{ __html: item.context }}></div>
                                </div>
                            </List.Item>
                        )}
                    />
                </div>
            </Modal >
            <Drawer
                title={locale['navbar.mobile.menu.title']}
                placement="left"
                closable={true}
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
                bodyStyle={{ padding: 0 }}
                width={220}
                className={`${styles.mobileMenuDrawer} ${styles[theme]}`}
            >
                {/* Drawer 内部展示所有操作项 */}
                <div className={styles.mobileMenuActions}>
                    <Button block icon={<SearchOutlined />} onClick={onSearchClick} className={`${styles.customButtonHover} ${styles[theme]}`} style={{ marginBottom: 8 }}>
                        {locale['navbar.search']}
                    </Button>
                    <Button block icon={<GlobalOutlined />} onClick={handleVisitBlog} className={`${styles.customButtonHover} ${styles[theme]}`} style={{ marginBottom: 8 }}>
                        {locale['navbar.visit.blog'] || '访问博客前台'}
                    </Button>
                    <Dropdown menu={{ items: langDropList, onClick: handleToggleLang }}>
                        <Button block icon={theme === 'dark' ? <IconLangLight /> : <IconLang />} className={`${styles.customButtonHover} ${styles[theme]}`} style={{ marginBottom: 8 }}>
                            {locale['navbar.lang']}
                        </Button>
                    </Dropdown>
                    <Button block icon={theme === 'dark' ? <SunFilled /> : <MoonOutlined />} className={`${styles.customButtonHover} ${styles[theme]}`} style={{ marginBottom: 8 }}
                        onClick={theme === 'light' ? () => setTheme('dark') : () => setTheme('light')}
                    >
                        {theme === 'light' ? locale['navbar.theme.dark'] : locale['navbar.theme.light']}
                    </Button>
                    <Dropdown menu={{ items: writeDropList, onClick: handleCreateBlog }}>
                        <Button block type="primary" className={`${styles.customButtonHover} ${styles[theme]}`} style={{ marginBottom: 8 }}>
                            {locale['navbar.create']}
                        </Button>
                    </Dropdown>
                    {
                        userInfo &&
                        <Dropdown menu={{ items: settingDropList, onClick: handleLogout }}>
                            <Button block icon={<UserOutlined />} className={`${styles.customButtonHover} ${styles[theme]}`}>
                                {locale['navbar.logout']}
                            </Button>
                        </Dropdown>
                    }
                </div>
                <MenuItems />
            </Drawer>
        </div>
    )
}

// 从layout.tsx提取的菜单组件
const MenuItems = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const locale = useLocale()
    const [routes] = useRoute()
    const menuMap = useRef<Map<string, { menuItem?: boolean; subMenu?: boolean }>>(new Map())

    const renderRoutes = (routes: any[], level = 1) => {
        return routes.map((route) => {
            if (!route.children) {
                menuMap.current.set(route.key, { menuItem: true })
                return {
                    key: route.key,
                    label: locale[route.name],
                    icon: getIconFromKey(route.key),
                    children: undefined
                }
            } else {
                menuMap.current.set(route.key, { subMenu: true })
                return {
                    key: route.key,
                    label: locale[route.name],
                    icon: getIconFromKey(route.key),
                    children: renderRoutes(route.children, level + 1)
                }
            }
        })
    }

    const onClickItem = (item) => {
        const { key } = item
        const currentRoute = getFlatternRoute(routes).find((r) => r.key === key)
        const targetPath = currentRoute?.path || `/${key}`

        // 添加检查，确保找到了路由且路由的component存在并有preload方法
        if (currentRoute && currentRoute.component && typeof currentRoute.component.preload === 'function') {
            Promise.resolve(currentRoute.component.preload())
                .catch(() => undefined)
                .finally(() => {
                    navigate(targetPath)
                })
        } else {
            // 如果没有preload方法或找不到路由，直接导航
            navigate(targetPath)
        }
    }

    return (
        <Menu
            mode="inline"
            items={renderRoutes(routes)}
            onClick={onClickItem}
            selectedKeys={[location.pathname.replace(/^\//, '')]}
            style={{ height: '100%', borderRight: 0 }}
        />
    )
}

// 类型定义
interface RouteType {
    key: string;
    path?: string;
    children?: RouteType[];
    component?: any;
}
379
// 辅助函数
const getFlatternRoute = (routes) => {
    const res = []
    function travel(_routes) {
        _routes.forEach((route) => {
            if (route.key && !route.children) {
                res.push(route)
            }
            if (route.children?.length) {
                travel(route.children)
            }
        })
    }
    travel(routes)
    return res
}

function getIconFromKey(key: string) {
    switch (key) {
        case 'posts':
            return <EditOutlined />
        case 'dashboard':
            return <HomeOutlined />
        case 'content_management':
            return <AppstoreOutlined />
        case 'system':
            return <SettingOutlined />
        case 'deploy':
            return <CloudUploadOutlined />
        case 'content/pages':
            return <FileTextOutlined />
        case 'content/categories':
            return <AppstoreOutlined />
        case 'content/images':
            return <PictureOutlined />
        case 'content/yaml':
                return <CodeOutlined />
        case 'settings': 
                return <SettingIcon />
        default:
            return <div className={styles['icon-empty']}></div>
    }
}
