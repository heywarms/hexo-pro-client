import React, { useState } from 'react'
import { Alert, Button, Card, Collapse, Divider, Input, Switch, Tag, Typography, message, theme } from 'antd'
import { CheckCircleOutlined, ExportOutlined, GlobalOutlined, LinkOutlined } from '@ant-design/icons'
import useLocale from '../../../hooks/useLocale'
import { convertDesktopLink, getBlogUrlError, getCurrentBlogUrl, isLocalBlogUrl, normalizeBlogUrl, openDesktopLink } from '@/utils/desktopUtils'
import { useLinkRedirectSettingsState } from '../hooks/useLinkRedirectSettingsState'
import locale from '../locale/linkRedirect'
import styles from '../style/linkRedirect.module.less'

const { Text, Paragraph } = Typography

const LinkRedirectSettingsCard: React.FC = () => {
  const t = useLocale()
  const copy = useLocale(locale)
  const { token } = theme.useToken()
  const { enabled, domain, savedDomain, setDomain, persist } = useLinkRedirectSettingsState()
  const [error, setError] = useState<string | null>(() => {
    const reason = enabled ? getBlogUrlError(savedDomain) : null
    return reason ? copy[reason === 'admin' ? 'adminError' : 'formatError'] : null
  })
  const currentUrl = getCurrentBlogUrl()
  const normalizedDomain = normalizeBlogUrl(domain)
  const effectiveUrl = convertDesktopLink('/', { enabled, domain: savedDomain })
  const usingCurrent = enabled && normalizeBlogUrl(savedDomain) === currentUrl
  const currentServer = currentUrl ? new URL(currentUrl) : null
  const customServer = normalizedDomain ? new URL(normalizedDomain) : null
  const localMismatch = enabled && customServer && isLocalBlogUrl(normalizedDomain) && (
    !currentServer || !isLocalBlogUrl(currentUrl) ||
    customServer.port !== currentServer.port || customServer.protocol !== currentServer.protocol
  )
  const unsaved = domain !== savedDomain

  const validate = () => {
    const reason = getBlogUrlError(domain)
    setError(reason ? copy[reason === 'admin' ? 'adminError' : 'formatError'] : null)
    return !reason
  }

  const saveDomain = () => {
    if (!validate()) return false
    if (normalizedDomain !== savedDomain) persist({ domain: normalizedDomain })
    setDomain(normalizedDomain)
    return true
  }

  const handleToggle = (checked: boolean) => {
    if (checked && !validate()) return
    persist({ enabled: checked, ...(checked ? { domain: normalizedDomain } : {}) })
    if (checked) setDomain(normalizedDomain)
  }

  const useCurrentAddress = () => {
    setDomain(currentUrl)
    setError(null)
    persist({ enabled: true, domain: currentUrl })
    message.success(copy.currentApplied)
  }

  const openPreview = async () => {
    // Open exactly the saved destination shown below, never an invalid draft.
    try {
      await openDesktopLink('/')
    } catch {
      message.error(copy.openFailed)
    }
  }

  return (
    <Card className={styles.card} style={{ '--link-secondary-color': token.colorTextSecondary, '--link-text-color': token.colorText } as React.CSSProperties}>
      <Divider orientation="left"><LinkOutlined aria-hidden /> {t['settings.linkRedirectTitle']}</Divider>
      <Paragraph type="secondary">{copy.intro}</Paragraph>

      {currentUrl && (
        <div className={styles.recommendation} style={{ background: token.colorPrimaryBg, borderColor: token.colorPrimaryBorder }}>
          <div className={styles.addressDetails}>
            <div className={styles.heading}><Text strong>{copy.currentTitle}</Text><Tag color="blue">{copy.recommended}</Tag></div>
            <div className={styles.url} style={{ color: token.colorText }}>{currentUrl}</div>
            <Text type="secondary">{copy.currentHelp}</Text>
          </div>
          {usingCurrent && !unsaved
            ? <Text className={styles.applied} style={{ color: token.colorSuccessText }}><CheckCircleOutlined aria-hidden />{copy.inUse}</Text>
            : <Button type="primary" onClick={useCurrentAddress}>{copy.useCurrent}</Button>}
        </div>
      )}

      <div className={styles.toggleRow}>
        <div>
          <Text strong id="link-redirect-label">{copy.enable}</Text>
          <div><Text type="secondary">{copy.enableHelp}</Text></div>
        </div>
        <Switch checked={enabled} onChange={handleToggle} aria-labelledby="link-redirect-label" />
      </div>

      <div className={styles.field}>
          <label htmlFor="blog-home-address"><Text strong>{copy.addressLabel}</Text></label>
          <Text type="secondary" id="blog-address-help">{copy.addressHelp}</Text>
          <Input
            id="blog-home-address"
            prefix={<GlobalOutlined aria-hidden />}
            value={domain}
            onChange={(event) => { setDomain(event.target.value); setError(null) }}
            onBlur={saveDomain}
            onPressEnter={saveDomain}
            status={error ? 'error' : undefined}
            aria-invalid={!!error}
            aria-describedby={`blog-address-help blog-address-status${error ? ' blog-address-error' : ''}`}
            placeholder="https://blog.example.com"
            autoComplete="url"
            spellCheck={false}
          />
          {error && <Text type="danger" role="alert" id="blog-address-error">{error}</Text>}
          <Text type="secondary" id="blog-address-status" aria-live="polite">{unsaved ? copy.unsaved : enabled ? copy.saved : copy.savedInactive}</Text>
          {localMismatch && !error && (
            <Alert type="warning" showIcon message={copy.mismatchTitle} description={copy.mismatchHelp} />
          )}
      </div>

      <div className={styles.preview} style={{ borderColor: token.colorBorderSecondary, background: token.colorFillAlter }}>
        <div className={styles.addressDetails} aria-live="polite">
          <Text strong>{copy.previewTitle}</Text>
          <div className={styles.url} style={{ color: token.colorText }}>{effectiveUrl || copy.noAddress}</div>
          <Text type="secondary">{enabled ? copy.previewHelp : copy.disabledHelp}</Text>
        </div>
        <Button icon={<ExportOutlined aria-hidden />} onClick={openPreview} disabled={!effectiveUrl || (enabled && (!!error || unsaved))}>{copy.openPreview}</Button>
      </div>

      <Collapse
        ghost
        className={styles.help}
        items={[{
          key: 'help',
          label: copy.helpTitle,
          children: <div className={styles.helpContent}>
            <div><Text strong>{copy.localTitle}</Text><Paragraph type="secondary">{copy.localHelp}</Paragraph></div>
            <div><Text strong>{copy.onlineTitle}</Text><Paragraph type="secondary">{copy.onlineHelp}</Paragraph></div>
            <div><Text strong>{copy.notFoundTitle}</Text><Paragraph type="secondary">{copy.notFoundHelp}</Paragraph></div>
          </div>,
        }]}
      />
    </Card>
  )
}

export default LinkRedirectSettingsCard
