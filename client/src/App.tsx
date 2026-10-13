import React, { useEffect, useState } from "react"
import { createStore } from 'redux'
import { Provider } from "react-redux"
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom'

import rootReducer from './store'
import Login from "./pages/login"
import PageLayout from "./layout"
import { Button, ConfigProvider, Space, theme as antTheme, message, notification } from "antd"

import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import { GlobalContext } from "./context"
import service from "./utils/api"
import checkLogin from "./utils/checkLogin"
import useStorage from "./utils/useStorage"
import localePack from "./locale"


const store = createStore(rootReducer)

const DesktopSettingsBridge: React.FC = () => {
    const navigate = useNavigate()

    useEffect(() => {
        const electronAPI = (window as any).electronAPI
        if (!electronAPI || typeof electronAPI.onOpenSettings !== 'function') {
            return
        }

        const unsubscribe = electronAPI.onOpenSettings((payload: { tab?: unknown, action?: unknown } = {}) => {
            const params = new URLSearchParams()
            if (payload?.tab) {
                params.set('tab', String(payload.tab))
            }
            if (payload?.action) {
                params.set('action', String(payload.action))
            }

            const search = params.toString()
            navigate(`/settings${search ? `?${search}` : ''}`)
        })

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe()
            } else if (typeof electronAPI.removeAllListeners === 'function') {
                electronAPI.removeAllListeners('open-settings')
            }
        }
    }, [navigate])

    return null
}

const DesktopUpdateNotifier: React.FC<{ lang: string }> = ({ lang }) => {
    const navigate = useNavigate()
    const t = (localePack as any)[lang] || (localePack as any)['zh-CN'] || {}

    useEffect(() => {
        const electronAPI = (window as any).electronAPI
        const updaterApi = electronAPI?.updater
        if (!updaterApi || typeof updaterApi.onStatusChange !== 'function') {
            return
        }

        let availableVersionNotified: string | null = null
        let downloadedVersionNotified: string | null = null

        const showAvailableNotification = (version: string | null) => {
            const notificationKey = `desktop-update-available-${version || 'unknown'}`
            notification.open({
                key: notificationKey,
                placement: 'bottomLeft',
                duration: 0,
                message: t['settings.update.toast.availableTitle'] || '发现新版本',
                description: (t['settings.update.toast.availableDesc'] || '检测到新版本 {version}，是否马上更新？').replace('{version}', version || ''),
                btn: (
                    <Space>
                        <Button size="small" onClick={() => notification.destroy(notificationKey)}>
                            {t['settings.update.toast.later'] || '稍后'}
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            onClick={async () => {
                                try {
                                    await updaterApi.downloadUpdate()
                                    message.success(t['settings.update.toast.downloadStarting'] || '已开始下载更新')
                                    navigate('/settings?tab=help')
                                } catch (error: any) {
                                    message.error(error?.message || t['settings.update.toast.downloadFailed'] || '下载更新失败')
                                } finally {
                                    notification.destroy(notificationKey)
                                }
                            }}
                        >
                            {t['settings.update.toast.updateNow'] || '马上更新'}
                        </Button>
                    </Space>
                ),
            })
        }

        const showDownloadedNotification = (version: string | null) => {
            const notificationKey = `desktop-update-downloaded-${version || 'unknown'}`
            notification.open({
                key: notificationKey,
                placement: 'bottomLeft',
                duration: 0,
                message: t['settings.update.toast.downloadedTitle'] || '更新已下载',
                description: (t['settings.update.toast.downloadedDesc'] || '新版本 {version} 已下载完成，是否现在重启安装？').replace('{version}', version || ''),
                btn: (
                    <Space>
                        <Button size="small" onClick={() => notification.destroy(notificationKey)}>
                            {t['settings.update.toast.later'] || '稍后'}
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            danger
                            onClick={async () => {
                                try {
                                    await updaterApi.installUpdate()
                                } catch (error: any) {
                                    message.error(error?.message || t['settings.update.toast.installFailed'] || '安装更新失败')
                                } finally {
                                    notification.destroy(notificationKey)
                                }
                            }}
                        >
                            {t['settings.update.toast.installNow'] || '立即安装'}
                        </Button>
                    </Space>
                ),
            })
        }

        const onUpdaterStateChange = (state: any = {}) => {
            const status = state?.status
            const version = state?.availableVersion || null

            if (status === 'update-available') {
                if (availableVersionNotified === version) {
                    return
                }
                availableVersionNotified = version
                showAvailableNotification(version)
                return
            }

            if (status === 'downloaded') {
                if (downloadedVersionNotified === version) {
                    return
                }
                downloadedVersionNotified = version
                showDownloadedNotification(version)
            }
        }

        updaterApi.getState?.().then(onUpdaterStateChange).catch(() => undefined)
        const unsubscribe = updaterApi.onStatusChange(onUpdaterStateChange)

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe()
            }
        }
    }, [lang, navigate, t])

    return null
}

function App() {

    const [lang, setLang] = useStorage('hexo-pro-lang', 'zh-CN')
    const [theme, setTheme] = useStorage('hexo-pro-theme', 'light')
    const [configProviderTheme, setConfigProviderTheme] = useState({})

    function getLocale() {
        switch (lang) {
            case 'zh-CN':
                return zhCN
            case 'en-US':
                return enUS
            default:
                return zhCN
        }
    }

    const contextValue = {
        lang: lang,
        setLang: setLang,
        theme,
        setTheme,
    }

    function fetchUserInfo() {
        store.dispatch({
            type: 'update-userInfo',
            payload: { userLoading: true },
        })
        service.get('/hexopro/api/userInfo').then((res) => {
            store.dispatch({
                type: 'update-userInfo',
                payload: { userInfo: res.data, userLoading: false },
            })
        }).catch(err => {
            message.error(err.message)
        }
        )
    }

    useEffect(() => {
        console.log('App mount', window.location.pathname.replace(/\//g, ''))
        // 简化逻辑，只检查当前用户是否已登录
        if (checkLogin()) {
            fetchUserInfo()
        }
        // 登录相关的逻辑现在由LoginForm组件处理
    }, [window.location.pathname])


    useEffect(() => {
        if (theme === 'dark') {
            setConfigProviderTheme({
                algorithm: antTheme.darkAlgorithm,
                token: {
                    colorBgBase: '#141414',
                    colorTextBase: '#ffffff',
                    // Button specific styles
                    colorPrimaryBg: '#1a1a1a',
                    colorPrimaryText: '#ffffff',
                    colorPrimaryBorder: '#2a2a2a',
                    defaultShadow: 'none',
                    primaryShadow: 'none',
                    boxShadow: 'none', // 移除所有组件的阴影
                    btnBoxShadow: 'none', // 移除按钮的阴影
                    // 其他颜色和样式
                },
                components: {
                    Button: {
                        defaultShadow: 'none',
                        primaryShadow: 'none',
                        borderRadius: 'none',
                        borderRadiusSM: 'none',
                        borderRadiusLG: 'none',
                        defaultBorderColor: 'none',
                        defaultHoverBorderColor: 'none',
                    },
                    Menu: {
                        itemColor: '#ffffff',
                        itemHoverColor: '#1890ff',
                        itemSelectedColor: '#ffffff',  // 修改选中项字体颜色为白色
                        itemSelectedBg: '#1f1f1f',
                        itemBg: '#141414',
                        subMenuItemBg: '#141414',
                        itemActiveBg: '#1f1f1f',
                        activeBarWidth: 0,  // 移除选中项的蓝色指示条
                        activeBarBorderWidth: 0
                    }
                }
            })
        } else {
            setConfigProviderTheme({
                algorithm: antTheme.defaultAlgorithm,
                token: {
                    colorBgBase: '#ffffff',
                    colorTextBase: '#000000',
                    // Button specific styles
                    colorPrimaryBg: '#ffffff',
                    colorPrimaryText: '#000000',
                    colorPrimaryBorder: '#1890ff',
                    defaultShadow: 'none',
                    primaryShadow: 'none',
                    boxShadow: 'none', // 移除所有组件的阴影
                    btnBoxShadow: 'none' // 移除按钮的阴影

                    // 其他颜色和样式
                },
                components: {
                    Button: {
                        defaultShadow: 'none',
                        primaryShadow: 'none',
                        borderRadius: 'none',
                        borderRadiusSM: 'none',
                        borderRadiusLG: 'none',
                        defaultBorderColor: 'none',
                        defaultHoverBorderColor: 'none',
                    },
                }
            })
        }
    }, [theme])

    return (
        <BrowserRouter basename="/pro">
            <DesktopSettingsBridge />
            <DesktopUpdateNotifier lang={lang} />
            <ConfigProvider
                locale={getLocale()}
                theme={configProviderTheme}
            >
                <Provider store={store}>
                    <GlobalContext.Provider value={contextValue}>
                        <Routes>
                            <Route path="/login" element={(() => {
                                return <Login />
                            })()} />
                            {/* 确保登录页面优先匹配，其他页面使用PageLayout */}
                            <Route path="/*" element={(() => {
                                return <PageLayout />
                            })()} />
                        </Routes>
                    </GlobalContext.Provider>
                </Provider>
            </ConfigProvider>
        </BrowserRouter>

    )
}

export default App
