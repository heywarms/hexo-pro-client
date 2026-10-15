import { useCallback, useState } from 'react'
import { getLinkRedirectSettings, updateLinkRedirectSettings } from '@/utils/desktopUtils'

type LinkRedirectState = {
  enabled: boolean
  domain: string
  savedDomain: string
  setDomain: (domain: string) => void
  persist: (next?: { enabled?: boolean; domain?: string }) => void
}

export function useLinkRedirectSettingsState(): LinkRedirectState {
  const [settings, setSettings] = useState(getLinkRedirectSettings)
  const [domain, setDomain] = useState(settings.domain)

  const persist = useCallback(
    (next?: { enabled?: boolean; domain?: string }) => {
      const finalEnabled = next?.enabled ?? settings.enabled
      // Toggling must never persist an unfinished or invalid input.
      const finalDomain = next?.domain ?? settings.domain
      updateLinkRedirectSettings(finalEnabled, finalDomain)
      setSettings({ enabled: finalEnabled, domain: finalDomain })
    },
    [settings],
  )

  return { enabled: settings.enabled, domain, savedDomain: settings.domain, setDomain, persist }
}

