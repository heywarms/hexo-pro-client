export type DesktopUpdaterState = {
  status: 'idle' | 'disabled' | 'checking' | 'up-to-date' | 'update-available' | 'downloading' | 'downloaded' | 'installing' | 'error'
  supported?: boolean
  disabledReason?: 'missing-updater' | 'development' | 'appimage-required' | null
  currentVersion: string
  availableVersion: string | null
  autoDownload?: boolean
  channel?: string
  progress: number
  error: string | null
  errorStage?: 'check' | 'download' | 'install' | null
  lastCheckedAt: string | null
  releaseUrl?: string
}

type UpdateResult = { supported: boolean; canceled?: boolean }

export type DesktopUpdaterApi = {
  getState: () => Promise<DesktopUpdaterState>
  onStatusChange: (callback: (state: DesktopUpdaterState) => void) => () => void
  checkForUpdates: () => Promise<UpdateResult>
  downloadUpdate: () => Promise<UpdateResult>
  installUpdate: () => Promise<UpdateResult>
  setAutoDownload?: (enabled: boolean) => Promise<DesktopUpdaterState>
}

export const DESKTOP_RELEASE_URL = 'https://github.com/heywarms/hexo-pro/releases'

export const getDesktopUpdater = (): DesktopUpdaterApi | undefined => window.electronAPI?.updater

// Subscribe first; a delayed initial snapshot must not replace a newer progress event.
export const subscribeToUpdater = (
  api: DesktopUpdaterApi,
  onState: (state: DesktopUpdaterState) => void,
  onError: (error: Error) => void = () => undefined,
) => {
  let active = true
  let receivedEvent = false
  const unsubscribe = api.onStatusChange(state => {
    receivedEvent = true
    if (active) onState(state)
  })
  api.getState().then(state => {
    if (active && !receivedEvent) onState(state)
  }).catch(error => {
    if (active && !receivedEvent) onError(error)
  })
  return () => {
    active = false
    unsubscribe()
  }
}
