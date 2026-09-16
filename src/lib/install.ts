import { create } from 'zustand'

/** Chromium's install prompt; not in the DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const standalone = () =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** iOS never fires the prompt; installing there is Share, then Add to Home Screen. */
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

interface InstallState {
  /** How this browser installs: a native prompt, iOS's manual steps, or not at all (already installed or unsupported). */
  mode: 'prompt' | 'ios' | null
  install: () => Promise<void>
}

let deferred: BeforeInstallPromptEvent | null = null

export const useInstall = create<InstallState>((set) => ({
  mode: !standalone() && ios ? 'ios' : null,
  install: async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    set({ mode: null })
  },
}))

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  useInstall.setState({ mode: 'prompt' })
})
addEventListener('appinstalled', () => {
  deferred = null
  useInstall.setState({ mode: null })
})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', async () => {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    const worker = (await navigator.serviceWorker.ready).active
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).origin === location.origin)
    worker?.postMessage({ cache: urls })
  })
}
