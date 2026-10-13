import { Button, Menu, MenuProps, message, Spin } from 'antd'
import Sider from 'antd/es/layout/Sider'
import Layout, { Content } from 'antd/es/layout/layout'
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import styles from './style/layout.module.less'
import useRoute, { IRoute } from './routes'
import { AppstoreOutlined, CloudUploadOutlined, CloudSyncOutlined, CodeOutlined, DeleteOutlined, FileOutlined, FileTextOutlined, FolderOutlined, HomeOutlined, MenuFoldOutlined, MenuUnfoldOutlined, PictureOutlined, SettingOutlined, SkinOutlined } from '@ant-design/icons'
import useLocale from './hooks/useLocale'
import lazyload from './utils/lazyload'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import qs from 'query-string'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import useDeviceDetect from './hooks/useDeviceDetect'
import SettingIcon from './assets/setting.svg'
import SettingIconLight from './assets/settingLight.svg'
import { GlobalContext } from './context'
import service from './utils/api'

type MenuItem = Required<MenuProps>['items'][number];

const DashboardPage = lazyload(() => import('./pages/dashboard'))
const PostEditorPage = lazyload(() => import('./pages/content/posts/post'))
const PageEditorPage = lazyload(() => import('./pages/content/pages/page'))

const getIconFromKey = (key: string): React.ReactNode => {
    switch (key) {
        case 'dashboard':
            return <HomeOutlined />
        case 'posts':
            return <FileTextOutlined />
        // 文章子项（已发布 / 草稿箱）不单独显示图标，保持层级清晰
        case 'content/posts/blogs':
        case 'content/posts/drafts':
            return undefined
        case 'content/categories':
            return <FolderOutlined />
        case 'content/pages':
            return <FileOutlined />
        case 'content/images':
            return <PictureOutlined />
        case 'content/recycle':
            return <DeleteOutlined />
        case 'content/yaml':
            return <CodeOutlined />
        case 'deploy':
            return <CloudUploadOutlined />
        case 'sync':
            return <CloudSyncOutlined />
        case 'theme-market':
            return <SkinOutlined />
        case 'settings':
            return <SettingOutlined />
        default:
            return <AppstoreOutlined />
    }
}

function getFlatternRoute(routes): any[] {
    const res = []
    function travel(_routes) {
        _routes.forEach((route) => {
            if (route.key && !route.children) {
                try {
                    route.component = lazyload(() => import(`./pages/${route.key}`))
                    res.push(route)
                } catch (e) {
                    message.error(`页面${route.key}加载失败`)
                }
            }
            if (route.children && route.children.length) {
                travel(route.children)
            }
        })
    }
    travel(routes)
    return res
}

export default function PageLayout() {
    const navigate = useNavigate()
    const location = useLocation()
    const { isMobile } = useDeviceDetect()
    const [authChecking, setAuthChecking] = useState(true)
    const [isAuthenticated, setIsAuthenticated] = useState(false)

    const locale = useLocale()
    const { theme } = useContext(GlobalContext)

    const currentComponent = qs.parseUrl(location.pathname).url.slice(1)
    const [routes, defaultRoute] = useRoute()
    const defaultSelectedKeys: string[] = [currentComponent || defaultRoute || '']
    const [collapsed, setCollapsed] = useState(false)

    const [selectedKeys, setSelectedKeys] = useState<string[]>(defaultSelectedKeys)

    const flatternRoutes = useMemo(() => getFlatternRoute(routes) || [], [routes])

    const menuMap = useRef<
        Map<string, { menuItem?: boolean; subMenu?: boolean }>
    >(new Map())

    // // 权限验证
    // useEffect(() => {
    //     // 检查当前路径，如果是登录页面则不执行权限验证
    //     const currentPath = window.location.pathname;
    //     if (currentPath.includes('/login') || currentPath.includes('/pro/login')) {
    //         console.log('[PageLayout]: 当前在登录页面，跳过权限验证');
    //         setAuthChecking(false);
    //         return;
    //     }

    //     const checkAuth = async () => {
    //         console.log('[PageLayout]: 开始权限验证...')
    //         const token = localStorage.getItem('hexoProToken')

    //         if (!token) {
    //             console.log('[PageLayout]: 未找到token，重定向到登录页面')
    //             window.location.href = '/pro/login?reason=session_expired'
    //             return
    //         }

    //         try {
    //             console.log('[PageLayout]: 验证token有效性...')
    //             const res = await service.get('/hexopro/api/userInfo')

    //             if (res.data && res.data.code !== 401) {
    //                 console.log('[PageLayout]: Token验证成功，用户已认证')
    //                 setIsAuthenticated(true)
    //             } else {
    //                 console.log('[PageLayout]: Token验证失败，清除token并重定向')
    //                 localStorage.removeItem('hexoProToken')
    //                 window.location.href = '/pro/login?reason=token_invalid'
    //                 return
    //             }
    //         } catch (error) {
    //             console.error('[PageLayout]: Token验证出错:', error)
    //             console.log('[PageLayout]: 清除token并重定向到登录页面')
    //             localStorage.removeItem('hexoProToken')
    //             window.location.href = '/pro/login?reason=token_error'
    //             return
    //         } finally {
    //             setAuthChecking(false)
    //         }
    //     }

    //     checkAuth()
    // }, [])

    function reanderRoutes() {
        return function travel(_routes: IRoute[], level = 1): MenuItem[] {
            return _routes.flatMap((route, index): MenuItem[] => [
                // 分组之间加分割线
                ...(level === 1 && route.children && index > 0 && _routes[index - 1].children
                    ? [{ type: 'divider' as const, key: `divider-${route.key}` }]
                    : []),
                ((): MenuItem => {
                if (!route.children) {
                    menuMap.current.set(route.key, { menuItem: true })
                    return {
                        key: route.key,
                        label: locale[route.name],
                        icon: getIconFromKey(route.key),
                        children: undefined
                    }
                } else if (level === 1) {
                    // 顶层分组（内容管理 / 系统管理）渲染为带标题的分组
                    return {
                        type: 'group' as const,
                        key: route.key,
                        label: locale[route.name],
                        children: travel(route.children, level + 1)
                    }
                } else {
                    menuMap.current.set(route.key, { subMenu: true })
                    return {
                        key: route.key,
                        label: locale[route.name],
                        icon: getIconFromKey(route.key),
                        children: travel(route.children, level + 1)
                    }
                }
                })(),
            ])
        }
    }

    function onClickItem(item) {
        const { key } = item
        const currentRoute = flatternRoutes.find((r) => r.key === key)
        const targetPath = currentRoute?.path ? currentRoute.path : `/${key}`
        const component = currentRoute?.component

        if (!component || typeof component.preload !== 'function') {
            navigate(targetPath)
            return
        }

        Promise.resolve(component.preload())
            .catch(() => undefined)
            .finally(() => {
                navigate(targetPath)
            })
    }

    const updateMenuStatus = useCallback(() => {
        const pathKeys = location.pathname.split('/')
        const newSelectedKeys: string[] = []
        // console.log("pathKeys ===>", pathKeys)
        while (pathKeys.length > 0) {
            const currentRouteKey = pathKeys.join('/')
            // console.log('currentRouteKey', currentRouteKey)
            const menuKey = currentRouteKey.replace(/^\//, '') // 替换掉开头的下划线 /path ==> path
            // console.log('menuKey===>', menuKey)
            const menuType = menuMap.current.get(menuKey)
            if (menuType && menuType.menuItem) {
                newSelectedKeys.push(menuKey)
            }

            pathKeys.pop()
        }
        setSelectedKeys(newSelectedKeys)
    }, [location.pathname])

    function toggleCollapsed() {
        setCollapsed(!collapsed)
    }

    useEffect(() => {
        updateMenuStatus()
    }, [location.pathname, updateMenuStatus])

    // Add useEffect to automatically collapse sidebar on mobile
    useEffect(() => {
        if (isMobile) {
            setCollapsed(true)
        }
    }, [isMobile])

    // 添加自动折叠侧边栏的逻辑
    useEffect(() => {
        if (isMobile) {
            setCollapsed(true)
        } else {
            setCollapsed(false)
        }
    }, [isMobile])

    // 如果正在验证权限，显示加载状态
    // if (authChecking) {
    //     return (
    //         <div style={{ 
    //             display: 'flex', 
    //             justifyContent: 'center', 
    //             alignItems: 'center', 
    //             height: '100vh',
    //             flexDirection: 'column'
    //         }}>
    //             <Spin size="large" />
    //             <div style={{ marginTop: 16 }}>正在验证用户权限...</div>
    //         </div>
    //     )
    // }

    // 如果未认证，不渲染任何内容（已经重定向到登录页面）
    // if (!isAuthenticated) {
    //     return null
    // }

    return (
        <Layout className={styles.layout} data-theme={theme}>
            <Navbar />
            <Layout>
                <Sider
                    className={styles['layout-sider']}
                    collapsed={collapsed}
                    collapsedWidth={isMobile ? 0 : 80}
                    width={220}
                    theme={theme === 'dark' ? 'dark' : 'light'}
                >
                    <Button type="default" onClick={toggleCollapsed} className={styles['collapse-btn']} size='small' >
                        {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    </Button>
                    <Menu
                        theme={theme === 'dark' ? 'dark' : 'light'}
                        style={{ height: '100%' }}
                        selectedKeys={selectedKeys}
                        onClick={onClickItem}
                        mode={"inline"}
                        defaultOpenKeys={['posts']}
                        className={styles['side-menu']}
                        items={reanderRoutes()(routes, 1)}
                    >
                    </Menu>
                </Sider>
                <Layout
                    className={styles['layout-content']}
                    style={{
                        paddingLeft: isMobile ? 0 : (collapsed ? 30 : 15),
                        paddingRight: isMobile ? 0 : (collapsed ? 30 : 15),
                        paddingTop: isMobile ? 0 : 15,
                        paddingBottom: isMobile ? 0 : 15
                    }}
                >
                    <div className={styles['layout-content-wrapper']}>
                        <Content>
                            <Routes>
                                {/* 路由部分保持不变 */}
                                {
                                    flatternRoutes.map((route, index) => {
                                        const rout = (<Route
                                            key={index}
                                            path={`/${route.key}`}
                                            element={React.createElement(route.component)}
                                        />)
                                        return rout
                                    })
                                }
                                <Route path="/"
                                    element={<DashboardPage />}
                                />
                                <Route
                                    path="/post/:_id"
                                    element={<PostEditorPage />}
                                />
                                <Route
                                    path="/page/:_id"
                                    element={<PageEditorPage />}
                                />
                                <Route path="*"
                                    element={<DashboardPage />}
                                />
                            </Routes>
                        </Content>
                    </div>
                    <Footer />
                </Layout>
            </Layout>
        </Layout>
    )
}
