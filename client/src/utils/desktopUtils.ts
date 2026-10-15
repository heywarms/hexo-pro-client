/**
 * 桌面端工具函数
 */

// 链接重定向设置接口
export interface LinkRedirectSettings {
  enabled: boolean
  domain: string
}

/**
 * 检查是否在桌面端环境
 */
export const isDesktopEnvironment = (): boolean => {
  return typeof window !== 'undefined' && (window.isHexoProDesktop === true || !!window.electronAPI?.getProjectInfo)
}

/** The administration UI and the blog are served by the same Hexo instance. */
export const getCurrentBlogUrl = (): string => {
  if (typeof window === 'undefined') return ''
  try {
    const url = new URL(window.location.href)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    const adminPath = url.pathname.match(/^(.*?)\/pro(?:\/|$)/)
    url.pathname = adminPath ? `${adminPath[1]}/` : '/'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export const getBlogUrlError = (value: string): 'format' | 'admin' | null => {
  try {
    const url = new URL(value.trim())
    if (!/^https?:\/\//i.test(value.trim()) || !['http:', 'https:'].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash) return 'format'
    if (/\/(?:pro|hexopro\/api)(?:\/|$)/i.test(url.pathname)) return 'admin'
    return null
  } catch {
    return 'format'
  }
}

export const normalizeBlogUrl = (value: string): string => {
  if (getBlogUrlError(value)) return ''
  return new URL(value.trim()).toString().replace(/\/+$/, '')
}

export const isLocalBlogUrl = (value: string): boolean => {
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || /^127\./.test(hostname)
  } catch {
    return false
  }
}

/**
 * 获取链接重定向设置
 */
export const getLinkRedirectSettings = (): LinkRedirectSettings => {
  if (typeof window === 'undefined') {
    return { enabled: false, domain: '' }
  }

  const storedEnabled = localStorage.getItem('hexoProLinkRedirectEnabled')
  // Keep the desktop's initial local preview, but respect an explicit opt-out.
  const enabled = storedEnabled === null ? isDesktopEnvironment() : storedEnabled === 'true'
  const domain = localStorage.getItem('hexoProCustomDomain') || getCurrentBlogUrl()
  
  return { enabled, domain }
}

/**
 * 检查是否应该进行链接转换
 * 桌面端默认使用当前博客地址；用户关闭后保留原始链接。
 */
export const shouldConvertLink = (): boolean => {
  return getLinkRedirectSettings().enabled
}

/**
 * 转换桌面端链接
 * 根据用户设置或桌面端环境，将博客文章的链接域名转换为自定义域名
 * @param permalink 原始链接
 * @returns 转换后的链接
 */
export const convertDesktopLink = (permalink: string, settings = getLinkRedirectSettings()): string => {
  if (!permalink) return permalink
  const currentBlogUrl = getCurrentBlogUrl()

  try {
    const originalUrl = new URL(permalink, `${currentBlogUrl}/`)
    if (!['http:', 'https:'].includes(originalUrl.protocol)) return ''
    const targetDomain = settings.enabled ? normalizeBlogUrl(settings.domain) : ''
    if (!targetDomain) return permalink === '/' ? `${currentBlogUrl}/` : originalUrl.toString()

    const targetUrl = new URL(targetDomain)
    const targetPath = targetUrl.pathname.replace(/\/+$/, '')
    const originalPath = originalUrl.pathname
    // A blog can live in a subdirectory (for example a GitHub Pages project).
    // Preserve the article path without repeating an already-present base path.
    targetUrl.pathname = originalPath === targetPath || originalPath.startsWith(`${targetPath}/`)
      ? originalPath
      : `${targetPath}${originalPath}`
    targetUrl.search = originalUrl.search
    targetUrl.hash = originalUrl.hash
    return targetUrl.toString()
  } catch {
    return permalink
  }
}

/**
 * 打开链接（桌面端优化版本）
 * 根据用户设置或桌面端环境，自动转换链接并打开
 * @param permalink 要打开的链接
 * @param target 打开方式，默认为 '_blank'
 */
export const openDesktopLink = (permalink: string, target: string = '_blank'): void | Promise<void> => {
  if (!permalink) return

  const convertedLink = convertDesktopLink(permalink)
  if (!convertedLink || !/^https?:\/\//i.test(convertedLink)) return
  
  // 在桌面端环境中，优先使用 electron API
  if (isDesktopEnvironment()) {
    const electronAPI = (window as any).electronAPI
    if (electronAPI && electronAPI.openExternal) {
      return electronAPI.openExternal(convertedLink)
    }
  }
  
  // 使用传统方式打开链接
  window.open(convertedLink, target, 'noopener,noreferrer')
}

/**
 * 获取桌面端环境信息
 */
export const getDesktopEnvironmentInfo = () => {
  if (!isDesktopEnvironment()) {
    return null
  }

  return {
    isDesktop: true,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    electronAPI: typeof (window as any).electronAPI !== 'undefined'
  }
}

/**
 * 监听链接重定向设置变化
 * @param callback 设置变化时的回调函数
 * @returns 取消监听的函数
 */
export const onLinkSettingsChange = (callback: (settings: LinkRedirectSettings) => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleSettingsChange = (event: CustomEvent) => {
    callback(event.detail)
  }

  // 监听自定义事件
  window.addEventListener('hexoProLinkSettingsChanged', handleSettingsChange as EventListener)

  // 返回清理函数
  return () => {
    window.removeEventListener('hexoProLinkSettingsChanged', handleSettingsChange as EventListener)
  }
}

/**
 * 批量更新链接重定向设置
 * @param enabled 是否启用链接重定向
 * @param domain 自定义域名
 */
export const updateLinkRedirectSettings = (enabled: boolean, domain: string): void => {
  if (typeof window === 'undefined') return
  if (enabled && getBlogUrlError(domain)) throw new Error('Invalid blog URL')

  localStorage.setItem('hexoProLinkRedirectEnabled', enabled.toString())
  localStorage.setItem('hexoProCustomDomain', domain)

  // 触发自定义事件，通知其他组件设置已更新
  window.dispatchEvent(new CustomEvent('hexoProLinkSettingsChanged', {
    detail: { enabled, domain }
  }))
}
