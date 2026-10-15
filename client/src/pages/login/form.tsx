import { LockOutlined, UserOutlined } from "@ant-design/icons"
import { Button, Form, Input, message, Alert, Space } from "antd"
import React, { useRef, useState, useEffect, useCallback } from "react"
import styles from './style/index.module.less'
import useLocale from "@/hooks/useLocale"
import service from "@/utils/api"
import { useNavigate } from 'react-router-dom'

// 定义页面状态枚举
type PageStatus = 'checking' | 'first-use' | 'token-login' | 'login' | 'forgot-password'

export default function LoginForm() {
    const formRef = useRef(null)
    const resetFormRef = useRef(null)
    const [errorMessage, setErrorMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [fetchingSecurityQuestion, setFetchingSecurityQuestion] = useState(false)
    const [securityQuestion, setSecurityQuestion] = useState('')
    const [pageStatus, setPageStatus] = useState<PageStatus>('checking') // 初始状态为 checking
    useEffect(() => { localStorage.removeItem('loginParams') }, [])
    const t = useLocale()
    const navigate = useNavigate()

    const formatSecurityQuestion = useCallback((question: string) => {
        const questionMap = {
            mother_name: t['settings.securityQuestion.motherName'],
            birth_city: t['settings.securityQuestion.birthCity'],
            pet_name: t['settings.securityQuestion.petName'],
            spouse_name: t['settings.securityQuestion.spouseName'],
            first_school: t['settings.securityQuestion.firstSchool'],
        }

        return questionMap[question] || question
    }, [t])

    // 统一的Token验证和页面跳转逻辑
    const validateTokenAndProceed = useCallback((tokenOverride?: string) => {
        const currentToken = tokenOverride || localStorage.getItem('hexoProToken')
        if (!currentToken) {
            setPageStatus('login')
            return
        }

        const requestConfig: { headers?: { [key: string]: string } } = {}
        if (tokenOverride) {
            requestConfig.headers = { 'Authorization': 'Bearer ' + tokenOverride }
        }

        service.get('/hexopro/api/userInfo', requestConfig)
            .then(res => {
                if (res.data && res.data.code !== 401 && res.data.name) { // 确保有有效的用户信息
                    if (typeof navigate === 'function') {
                        navigate('/pro')
                    } else {
                        window.location.href = '/pro'
                    }
                } else {
                    localStorage.removeItem('hexoProToken')
                    setPageStatus('login')
                }
            })
            .catch(() => {
                localStorage.removeItem('hexoProToken')
                setPageStatus('login')
            })
    }, [navigate]) // useCallback 依赖项包含navigate

    // 检查是否是首次使用
    const checkFirstUse = useCallback(async () => {
        try {
            const res = await service.get('/hexopro/api/settings/check-first-use')
            if (res.data && res.data.code === 0) {
                const { isFirstUse } = res.data.data

                if (isFirstUse) {
                    // 如果是首次使用（包括只有临时用户的情况），显示选择界面
                    setPageStatus('first-use')
                } else {
                    // 不是首次使用，有正式用户，检查是否有token
                    const token = localStorage.getItem('hexoProToken')
                    if (token) {
                        validateTokenAndProceed(token)
                    } else {
                        setPageStatus('login')
                    }
                }
            } else {
                setPageStatus('login')
            }
        } catch (error) {
            setPageStatus('login')
        }
    }, [validateTokenAndProceed])

    // 主要的副作用钩子，处理页面加载时的逻辑
    useEffect(() => {

        if (window.location.pathname.includes('/pro/login')) {
            const urlParams = new URLSearchParams(window.location.search)
            const reason = urlParams.get('reason')
            if (reason) {
                checkFirstUse()
                return
            }
        }

        // 对于其他情况，都进行首次使用检查
        checkFirstUse()
    }, [checkFirstUse]) // checkFirstUse 作为依赖项

    // 处理首次使用 - 选择现在设置
    const handleSetupNow = () => {

        // 清除可能存在的临时或无效 token，避免在路由跳转时触发 userInfo API 调用
        localStorage.removeItem('hexoProToken')

        // 使用 window.location.href 确保完整的页面重新加载
        // 这样可以重新执行首次使用检查逻辑
        window.location.href = '/pro/settings'
    }

    // 处理首次使用 - 稍后设置（免密登录）
    const handleSetupLater = async () => {
        setLoading(true)

        try {
            // 调用一个特殊的API来处理免密登录
            const res = await service.post('/hexopro/api/settings/skip-setup')
            if (res.data && res.data.code === 0) {
                // 保存临时token
                if (res.data.data && res.data.data.token) {
                    localStorage.setItem('hexoProToken', res.data.data.token)
                }
                message.success(t['settings.setupLaterMessage'])

                // 跳转到主页
                setTimeout(() => {
                    if (typeof navigate === 'function') {
                        navigate('/pro')
                    } else {
                        window.location.href = '/pro'
                    }
                }, 1000)
            } else {
                message.error(res.data?.msg || '操作失败')
                setPageStatus('login')
            }
        } catch (error) {
            message.error('操作失败，请重试')
            setPageStatus('login')
        } finally {
            setLoading(false)
        }
    }

    // 处理登录成功
    async function afterLoginSuccess(token: string) {
        localStorage.removeItem('loginParams')
        if (token) {
            localStorage.setItem('hexoProToken', token)
            if (window.electronAPI?.auth?.saveToken) {
                try {
                    const result = await window.electronAPI.auth.saveToken(token)
                    if (!result?.success) message.warning('已登录，但无法安全保存桌面登录状态，下次打开时请重新登录')
                } catch {
                    message.warning('已登录，但无法安全保存桌面登录状态，下次打开时请重新登录')
                }
            }
        }
        window.location.href = '/pro'
    }

    // 处理登录请求
    function login(params) {
        setLoading(true)
        service.post('/hexopro/api/login', params)
            .then((res) => {
                const { code, msg, token } = res.data
                if (code === 0 || code === -2) {
                    return afterLoginSuccess(token)
                } else {
                    setErrorMessage(t[msg] || msg || t['login.form.login.errMsg'])
                }
            })
            .catch((err) => {
                setErrorMessage(err.message || t['login.form.login.errMsg'])
            })
            .finally(() => {
                setLoading(false)
            })
    }

    // 处理表单提交
    function onSubmitClick() {
        formRef.current.validateFields()
            .then((values) => {
                login(values)
            })
            .catch((err) => {
                message.error(t['login.form.validate.errMsg'] + err)
            })
    }

    // 切换到忘记密码
    const handleShowForgotPassword = () => {
        setErrorMessage('')
        setSecurityQuestion('')
        setPageStatus('forgot-password')
    }

    // 返回登录
    const handleBackToLogin = () => {
        setErrorMessage('')
        setSecurityQuestion('')
        setPageStatus('login')
    }

    const handleForgotUsernameBlur = () => {
        const username = resetFormRef.current?.getFieldValue?.('username')?.trim()
        if (!username) {
            setSecurityQuestion('')
            return
        }

        setFetchingSecurityQuestion(true)
        setErrorMessage('')
        service.post('/hexopro/api/auth/security-question', { username })
            .then((res) => {
                if (res.data.code === 0 && res.data.data?.securityQuestion) {
                    setSecurityQuestion(res.data.data.securityQuestion)
                } else {
                    setSecurityQuestion('')
                    setErrorMessage(res.data.msg || t['login.form.securityQuestionFetchFailed'])
                }
            })
            .catch((err) => {
                setSecurityQuestion('')
                setErrorMessage(err.response?.data?.msg || err.message || t['login.form.securityQuestionFetchFailed'])
            })
            .finally(() => {
                setFetchingSecurityQuestion(false)
            })
    }

    // 处理重置密码
    const handleResetPassword = () => {
        resetFormRef.current.validateFields()
            .then((values) => {
                setLoading(true)
                service.post('/hexopro/api/auth/reset-password', {
                    username: values.username,
                    securityAnswer: values.securityAnswer,
                    newPassword: values.newPassword,
                    confirmPassword: values.confirmPassword,
                })
                    .then((res) => {
                        if (res.data.code === 0) {
                            message.success(t['login.form.resetSuccess'])
                            handleBackToLogin()
                        } else {
                            setErrorMessage(res.data.msg || '重置失败')
                        }
                    })
                    .catch((err) => {
                        setErrorMessage(err.response?.data?.msg || err.message || '重置失败')
                    })
                    .finally(() => {
                        setLoading(false)
                    })
            })
            .catch(() => {
                message.error(t['login.form.validate.errMsg'])
            })
    }

    // 如果还在检查状态，显示加载中
    if (pageStatus === 'checking') {
        return (
            <div className={styles['login-form-wrapper']}>
                <div className={styles['login-form-title']}>{t['login.form.title']}</div>
                <div className={styles['login-form-sub-title']}>{t['settings.system.check.status']}</div>
            </div>
        )
    }

    // 如果是首次使用，显示选择界面
    if (pageStatus === 'first-use') {
        return (
            <div className={styles['login-form-wrapper']}>
                <div className={styles['login-form-title']}>{t['settings.welcomeTitle']}</div>
                <div className={styles['login-form-sub-title']}>{t['settings.welcomeSubtitle']}</div>

                <Alert
                    message={t['settings.firstUsePrompt']}
                    description={t['settings.firstUseDescription']}
                    type="info"
                    showIcon
                    style={{ marginBottom: 24 }}
                />

                <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Button
                        type="primary"
                        size="large"
                        onClick={handleSetupNow}
                        loading={loading}
                        style={{ width: '100%' }}
                    >
                        {t['settings.setupNow']}
                    </Button>

                    <Button
                        size="large"
                        onClick={handleSetupLater}
                        loading={loading}
                        style={{ width: '100%' }}
                    >
                        {t['settings.setupLater']}
                    </Button>
                </Space>
            </div>
        )
    }

    // 显示忘记密码表单
    if (pageStatus === 'forgot-password') {
        return (
            <div className={styles['login-form-wrapper']}>
                <div className={styles['login-form-title']}>{t['login.form.resetPassword']}</div>
                <div className={styles['login-form-sub-title']}>{t['login.form.securityAnswerHint']}</div>
                {errorMessage &&
                    <Alert
                        message={errorMessage}
                        type="error"
                        showIcon
                        style={{ marginBottom: 20 }}
                        closable
                        onClose={() => setErrorMessage('')}
                    />
                }
                <Form
                    ref={resetFormRef}
                    layout="vertical"
                >
                    <Form.Item
                        name="username"
                        label={t['login.form.username']}
                        rules={[{ required: true, message: t['settings.usernameRequired'] }]}
                    >
                        <Input prefix={<UserOutlined />} onBlur={handleForgotUsernameBlur} />
                    </Form.Item>
                    {(fetchingSecurityQuestion || securityQuestion) && (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message={fetchingSecurityQuestion
                                ? t['login.form.securityQuestionLoading']
                                : `${t['login.form.securityQuestionLabel']}${formatSecurityQuestion(securityQuestion)}`}
                        />
                    )}
                    <Form.Item
                        name="securityAnswer"
                        label={t['login.form.securityAnswer']}
                        rules={[{ required: true, message: t['login.form.securityAnswerRequired'] }]}
                    >
                        <Input prefix={<LockOutlined />} placeholder={t['login.form.securityAnswerPlaceholder']} />
                    </Form.Item>
                    <Form.Item
                        name="newPassword"
                        label={t['login.form.newPassword']}
                        rules={[
                            { required: true, message: t['settings.passwordRequired'] },
                            { min: 6, message: t['settings.passwordLengthError'] },
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} />
                    </Form.Item>
                    <Form.Item
                        name="confirmPassword"
                        label={t['settings.confirmPassword']}
                        dependencies={['newPassword']}
                        rules={[
                            { required: true, message: t['settings.confirmPasswordRequired'] },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (value === getFieldValue('newPassword')) return Promise.resolve()
                                    return Promise.reject(t['settings.passwordNotMatch'])
                                },
                            }),
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} />
                    </Form.Item>
                    <Space style={{ width: '100%' }}>
                        <Button onClick={handleBackToLogin}>
                            {t['login.form.backToLogin']}
                        </Button>
                        <Button type="primary" onClick={handleResetPassword} loading={loading}>
                            {t['login.form.resetPassword']}
                        </Button>
                    </Space>
                </Form>
            </div>
        )
    }

    // 显示登录表单
    return (
        <div className={styles['login-form-wrapper']}>
            <div className={styles['login-form-title']}>{t['login.form.title']}</div>
            <div className={styles['login-form-sub-title']}>{t['login.form.subTitle']}</div>
            {errorMessage &&
                <Alert
                    message={errorMessage}
                    type="error"
                    showIcon
                    style={{ marginBottom: 20 }}
                    closable
                    onClose={() => setErrorMessage('')}
                />
            }
            <Form
                onFinishFailed={() => message.error('Submit failed!')}
                ref={formRef}
                layout="vertical"
            >
                <Form.Item
                    rules={[{ required: true }]} // 添加了 required 规则的显式消息
                    label={t['login.form.username']}
                    name="username"
                >
                    <Input prefix={<UserOutlined />} />
                </Form.Item>
                <Form.Item
                    rules={[{ required: true }]} // 添加了 required 规则的显式消息
                    label={t['login.form.password']}
                    name="password"
                >
                    <Input.Password prefix={<LockOutlined />} />
                </Form.Item>
                <Button type="primary" onClick={onSubmitClick} loading={loading} style={{ width: '100%' }}>
                    {t['login.form.login']}
                </Button>
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <Button type="link" onClick={handleShowForgotPassword} style={{ padding: 0 }}>
                        {t['login.form.forgotPassword']}
                    </Button>
                </div>
            </Form>
        </div>
    )
}
