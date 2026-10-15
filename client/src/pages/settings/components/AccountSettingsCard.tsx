import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Avatar, Button, Card, Form, Input, Select, Space, Spin, Typography, Upload, message } from 'antd'
import { LockOutlined, PictureOutlined, SaveOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons'
import { useDispatch } from 'react-redux'
import service from '@/utils/api'
import useLocale from '../../../hooks/useLocale'
import defaultAvatar from '../../../assets/defaultAvatar2.png'
import ImagePickerModal from './ImagePickerModal'
import { useImagePicker } from '../hooks/useImagePicker'
import styles from '../style/index.module.less'
import systemLocale from '../../system/locale'

const { Title } = Typography

type Props = {
  isFirstUse: boolean
  showTitle?: boolean
  showWelcomeAlert: boolean
  onSkipSettings: () => void
}

const AccountSettingsCard: React.FC<Props> = ({ isFirstUse, showTitle = true, showWelcomeAlert, onSkipSettings }) => {
  const t = useLocale()
  const ui = useLocale(systemLocale)
  const dispatch = useDispatch()
  const [form] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(!isFirstUse)
  const [avatarUrl, setAvatarUrl] = useState<string>(defaultAvatar)
  const [menuCollapsed, setMenuCollapsed] = useState(false)

  const imagePicker = useImagePicker(12)

  const titleText = useMemo(() => (isFirstUse ? t['settings.initTitle'] : t['settings.title']), [isFirstUse, t])

  const fetchSettings = useCallback(async () => {
    if (isFirstUse) return
    setFetchLoading(true)
    try {
      const res = await service.get('/hexopro/api/settings')
      if (res.data.code === 0) {
        const { username, avatar, menuCollapsed: mc } = res.data.data
        form.setFieldsValue({ username })
        setAvatarUrl(avatar || defaultAvatar)
        setMenuCollapsed(!!mc)
      } else {
        message.error(res.data.msg || t['settings.fetchError'])
      }
    } catch (error) {
      console.error('获取设置失败:', error)
      message.error(t['settings.fetchError'])
    } finally {
      setFetchLoading(false)
    }
  }, [form, isFirstUse, t])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const handleAvatarUpload = useCallback(
    async (info: any) => {
      if (info.file.status === 'uploading') {
        setLoading(true)
        return
      }

      if (info.file.status === 'done') {
        setLoading(false)
        if (info.file.response && info.file.response.code === 0) {
          const uploaded = info.file.response.src as string
          const uniqueUrl =
            uploaded + (uploaded.includes('?') ? '&' : '?') + '_v=' + Math.random().toString(36).slice(2)
          setTimeout(() => {
            setAvatarUrl(uniqueUrl)
            message.success(t['settings.avatarUploadSuccess'])
          }, 400)
        } else {
          message.error(t['settings.avatarUploadFailed'])
        }
      }
    },
    [t],
  )

  const openImagePicker = useCallback(async () => {
    try {
      await imagePicker.openPicker()
    } catch (e) {
      console.error(e)
      message.error(t['settings.getImageListFailed'])
    }
  }, [imagePicker, t])

  const selectImage = useCallback(
    (imageUrl: string) => {
      setAvatarUrl(imageUrl)
      imagePicker.setOpen(false)
      message.success(t['settings.imageSelectedAsAvatar'])
    },
    [imagePicker, t],
  )

  const onRegister = useCallback(
    async (values: any) => {
      try {
        setLoading(true)
        const { username, password, confirmPassword } = values

        const question = values.securityQuestion === 'custom'
          ? values.securityQuestionCustom?.trim()
          : values.securityQuestion
        const res = await service.post('/hexopro/api/settings/register', {
          username,
          password,
          confirmPassword,
          avatar: avatarUrl,
          securityQuestion: question || undefined,
          securityAnswer: values.securityAnswer?.trim() || undefined,
        })

        if (res.data.code === 0) {
          message.success(t['settings.registerSuccess'])

          localStorage.setItem('hexoProToken', res.data.data.token)

          dispatch({
            type: 'update-userInfo',
            payload: {
              userInfo: {
                username: res.data.data.username,
                avatar: res.data.data.avatar || '',
              },
            },
          })

          window.location.reload()
        } else {
          message.error(res.data.msg || t['settings.registerFailed'])
        }
      } catch (error) {
        console.error('注册失败:', error)
        message.error(t['settings.registerFailed'])
      } finally {
        setLoading(false)
      }
    },
    [avatarUrl, dispatch, t],
  )

  const onFinish = useCallback(
    async (values: any) => {
      try {
        setLoading(true)
        const { username, password, confirmPassword } = values

        const question = values.securityQuestion === 'custom'
          ? values.securityQuestionCustom?.trim()
          : values.securityQuestion
        const res = await service.post('/hexopro/api/settings/update', {
          username,
          password,
          confirmPassword,
          menuCollapsed,
          avatar: avatarUrl,
          securityQuestion: question !== undefined ? question : undefined,
          securityAnswer: values.securityAnswer?.trim() ? values.securityAnswer.trim() : undefined,
        })

        if (res.data.code === 0) {
          message.success(t['settings.saveSuccess'])

          if (res.data.data && res.data.data.token) {
            localStorage.setItem('hexoProToken', res.data.data.token)
            console.log('[Settings]: 用户名已更新，保存新的token')
          }

          dispatch({
            type: 'update-menu-collapsed',
            payload: { menuCollapsed },
          })

          const finalUsername = res.data.data && res.data.data.username ? res.data.data.username : username
          dispatch({
            type: 'update-userInfo',
            payload: {
              userInfo: {
                username: finalUsername,
                avatar: avatarUrl,
              },
            },
          })

          form.setFieldsValue({ password: '', confirmPassword: '' })

          if (password) {
            message.info(t['settings.passwordChangedRelogin'])
            setTimeout(() => {
              localStorage.removeItem('hexoProToken')
              window.location.href = '/pro/login'
            }, 2000)
          } else if (res.data.data && res.data.data.token) {
            message.info(t['settings.usernameUpdated'])
            setTimeout(() => {
              window.location.reload()
            }, 1000)
          }
        } else {
          message.error(res.data.msg || t['settings.saveError'])
        }
      } catch (error) {
        console.error('保存设置失败:', error)
        message.error(t['settings.saveError'])
      } finally {
        setLoading(false)
      }
    },
    [avatarUrl, dispatch, form, menuCollapsed, t],
  )

  return (
    <Card>
      <Spin spinning={fetchLoading}>
        {showTitle && <Title level={2}>{titleText}</Title>}

        {showWelcomeAlert && (
          <Alert
            message={t['settings.welcomeTitle']}
            description={t['settings.welcomeAlertDesc']}
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
            action={
              <Button size="small" onClick={onSkipSettings}>
                {t['settings.skipSetupButton']}
              </Button>
            }
          />
        )}

        <Form form={form} className={styles.accountForm} layout="vertical" onFinish={isFirstUse ? onRegister : onFinish}>
          <div className={styles.avatarRow}>
            <div>
              <Avatar
                size={80}
                src={avatarUrl}
                icon={<UserOutlined />}
                className={styles.avatar}
                key={avatarUrl}
              />
            </div>
            <div className={styles.avatarDetails}><strong>{ui.avatar}</strong><p>{ui.avatarHint}</p><Space wrap>
              <Upload
                name="data"
                action="/hexopro/api/images/upload"
                showUploadList={false}
                onChange={handleAvatarUpload}
                headers={{
                  Authorization: `Bearer ${localStorage.getItem('hexoProToken')}`,
                }}
                data={{ folder: '' }}
              >
                <Button icon={<UploadOutlined />}>{t['settings.upload.avatar']}</Button>
              </Upload>
              <Button icon={<PictureOutlined />} onClick={openImagePicker}>
                {t['settings.select.from.gallery']}
              </Button>
            </Space></div>
          </div>

          <div className={styles.accountFields}>
          <Form.Item className={styles.fullField} label={t['settings.username']} name="username" rules={[{ required: true, message: t['settings.usernameRequired'] }]}>
            <Input prefix={<UserOutlined />} placeholder={t['settings.usernamePlaceholder']} />
          </Form.Item>

          <Form.Item
            label={t['settings.password']}
            name="password"
            rules={[
              {
                validator: (_, value) => {
                  if (isFirstUse && !value) {
                    return Promise.reject(t['settings.firstUsePasswordRequired'])
                  }
                  if (value && value.length < 6) {
                    return Promise.reject(t['settings.passwordLengthError'])
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t['settings.passwordPlaceholder']} />
          </Form.Item>

          <Form.Item
            label={t['settings.confirmPassword']}
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value && !getFieldValue('password')) return Promise.resolve()
                  if (!value && getFieldValue('password')) return Promise.reject(t['settings.confirmPasswordRequired'])
                  if (value !== getFieldValue('password')) return Promise.reject(t['settings.passwordNotMatch'])
                  return Promise.resolve()
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t['settings.confirmPasswordPlaceholder']} />
          </Form.Item>

          <Form.Item
            label={t['settings.securityQuestion']}
            name="securityQuestion"
            tooltip={t['settings.securityQuestionTip']}
          >
            <Select
              placeholder={t['settings.securityQuestionPlaceholder']}
              allowClear
              options={[
                { value: 'mother_name', label: t['settings.securityQuestion.motherName'] },
                { value: 'birth_city', label: t['settings.securityQuestion.birthCity'] },
                { value: 'pet_name', label: t['settings.securityQuestion.petName'] },
                { value: 'spouse_name', label: t['settings.securityQuestion.spouseName'] },
                { value: 'first_school', label: t['settings.securityQuestion.firstSchool'] },
                { value: 'custom', label: t['settings.securityQuestion.custom'] },
              ]}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.securityQuestion !== curr.securityQuestion}
          >
            {({ getFieldValue }) =>
              getFieldValue('securityQuestion') === 'custom' ? (
                <Form.Item
                  label={t['settings.securityQuestionCustom']}
                  name="securityQuestionCustom"
                >
                  <Input placeholder={t['settings.securityQuestionCustomPlaceholder']} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item
            label={t['settings.securityAnswer']}
            name="securityAnswer"
            tooltip={t['settings.securityAnswerTip']}
          >
            <Input placeholder={t['settings.securityAnswerPlaceholder']} />
          </Form.Item>

          </div>
          <Form.Item className={styles.accountSave}>
            <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
              {isFirstUse ? t['settings.createAccount'] : t['settings.saveAccountSettings']}
            </Button>
          </Form.Item>
        </Form>
      </Spin>

      <ImagePickerModal
        title={t['settings.selectAvatarTitle']}
        open={imagePicker.open}
        loading={imagePicker.loading}
        images={imagePicker.images}
        currentPage={imagePicker.currentPage}
        pageSize={imagePicker.pageSize}
        total={imagePicker.total}
        emptyText={t['settings.noImagesPrompt']}
        onCancel={() => imagePicker.setOpen(false)}
        onSelect={selectImage}
        onPageChange={(page) => {
          imagePicker.fetchPage(page).catch((e) => {
            console.error(e)
            message.error(t['settings.getImageListFailed'])
          })
        }}
      />
    </Card>
  )
}

export default AccountSettingsCard

