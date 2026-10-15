import { message } from "antd"
import axios from "axios"

// 扩展Window接口以支持桌面端属性
declare global {
    interface Window {
        isHexoProDesktop?: boolean;
        electronAPI?: {
            platform?: string;
            [key: string]: any;
        };
    }
}

const service = axios.create({
    validateStatus: function (status) {
        return status >= 200 && status <= 500 // 允许处理400状态码
    }
})

service.interceptors.request.use(config => {
    // 在这里可以为每个请求添加请求头
    // 如果请求配置中已经有 Authorization 头，则优先使用它
    if (!config.headers?.['Authorization']) {
        const token = localStorage.getItem('hexoProToken')
        if (token) {
            config.headers['Authorization'] = 'Bearer ' + token
        }
    }
    return config
})
// 强化类型定义
class ApiError extends Error {
    code: number | string
    config?: object
    response?: object

    constructor(message: string);
    constructor(message: string, code?: number | string, config?: object, response?: object) {
        super(message)
        this.code = code
        this.config = config
        this.response = response
    };

}

// 类型断言帮助函数
function isApiError(error: unknown): error is ApiError {
    return error instanceof Error && 'code' in error
}

// 注入导航方法
let globalNavigate: any = null
export const injectNavigate = (navigate: any) => {
    globalNavigate = navigate
}

function rejectUnauthorized(response) {
    localStorage.removeItem('hexoProToken')
    if (!window.location.pathname.includes('/pro/login')) {
        window.location.href = '/pro/login?reason=token_invalid_or_missing'
    }
    const error = new Error(response?.data?.message || response?.data?.msg || '登录已失效，请重新登录') as ApiError
    error.name = 'API_ERROR'
    error.code = 401
    error.response = response
    return Promise.reject(error)
}

service.interceptors.response.use((resp) => {
    // Legacy servers encode expired sessions in an HTTP 200 response. Reject
    // that response too, so save queues keep the unsaved recovery copy.
    if (resp.status === 401 || resp.data?.code === 401) {
        return rejectUnauthorized(resp)
    }

    // 处理业务层级错误（400+状态码）
    if (resp.status >= 400) {
        const error = new Error(resp.data?.message || `请求失败: ${resp.status}`) as ApiError
        error.name = 'API_ERROR'
        error.code = resp.data?.code || resp.status
        error.response = resp
        return Promise.reject(error)
    }

    return resp
}, err => {
    const { response, config } = err
    const errorMsg = response?.data?.message || err.message

    // 创建标准错误对象
    const error = new ApiError(errorMsg,)
    error.code = response?.status || 'NETWORK_ERROR'
    error.config = config
    error.response = response

    // 统一错误处理
    switch (error.code) {
        case 401:
            return rejectUnauthorized(response)
        case 404:
            message.error(`资源未找到: ${errorMsg}`)
            globalNavigate?.(`/not-found?from=${encodeURIComponent(config.url)}`)
            break
        case 500:
            message.error(`服务器错误: ${errorMsg}`)
            break
        case 'NETWORK_ERROR':
            message.error('网络连接异常，请检查网络设置')
            break
        default:
            message.error(`请求错误: ${errorMsg}`)
    }

    // 返回统一错误对象
    return Promise.reject(error)
})

const post = (url, data, config) => {
    return new Promise((f, r) => {
        service.post(url, data, config).then(res => {
            f(res)
        }).catch(err => { // Add catch block for error handling
            r(err)
        })
    })
}

const get = (url, config) => {
    return new Promise((f, r) => {
        service.get(url, config).then(res => {
            f(res)
        }).catch(err => { // Add catch block for error handling
            r(err)
        })
    })
}


export default service

export { service, get, post }
