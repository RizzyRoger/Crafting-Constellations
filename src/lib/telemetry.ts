import type { Analytics } from 'firebase/analytics'
import { getAdditionalUserInfo, type UserCredential } from 'firebase/auth'
import type { FirebasePerformance } from 'firebase/performance'
import { useSyncExternalStore } from 'react'
import { app, USING_EMULATORS } from './firebase'

// Counting visits (Analytics + Performance) is opt-in per device, off by default,
// and never runs on the emulators. Pages are reported by route pattern
// (/groups/:groupId), never by their real address; events carry fixed words only.
export const TELEMETRY_AVAILABLE = !USING_EMULATORS && Boolean(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID)

type Choice = 'yes' | 'no' | null

const KEY = 'cc.countVisits'

// Storage can be missing or throw (private windows, blocked site data): treat as "not asked"
const readChoice = (): Choice => {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'yes' || value === 'no' ? value : null
  } catch {
    return null
  }
}

let choice = readChoice()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const useCountVisits = () => useSyncExternalStore(subscribe, () => choice)

interface Page {
  page_path: string
  page_location: string
  page_title: string
}

let page: Page | null = null

interface Services {
  analytics: typeof import('firebase/analytics')
  instance: Analytics | null
  perf: FirebasePerformance
}

let services: Promise<Services> | null = null

// Loaded on first consent only, so nobody downloads (or is counted by) code they said no to
const start = () =>
  (services ??= (async () => {
    const [analytics, performance] = await Promise.all([import('firebase/analytics'), import('firebase/performance')])
    const perf = performance.initializePerformance(app)
    if (!(await analytics.isSupported())) return { analytics, instance: null, perf }
    analytics.setConsent({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    const instance = analytics.initializeAnalytics(app, {
      config: {
        ...page,
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        // debug_mode: false still turns debug on, so leave the key out entirely
        ...(import.meta.env.DEV ? { debug_mode: true } : {}),
      },
    })
    return { analytics, instance, perf }
  })())

const counting = () => TELEMETRY_AVAILABLE && choice === 'yes'

const logPage = async () => {
  if (!counting() || !page) return
  const { analytics, instance } = await start()
  if (!instance) return
  analytics.setDefaultEventParameters({ ...page })
  analytics.logEvent(instance, 'page_view', page)
}

// gtag's cookies outlive collection; clear them so "no" leaves nothing behind
const clearAnalyticsCookies = () => {
  const host = location.hostname
  const domains = ['', host, `.${host.split('.').slice(-2).join('.')}`]
  document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((name) => name.startsWith('_ga'))
    .forEach((name) => domains.forEach((d) => (document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`)))
}

export const setCountVisits = async (yes: boolean) => {
  choice = yes ? 'yes' : 'no'
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // Remembered for this visit only
  }
  listeners.forEach((listener) => listener())
  if (!TELEMETRY_AVAILABLE) return

  if (yes) {
    const { analytics, instance, perf } = await start()
    perf.dataCollectionEnabled = true
    perf.instrumentationEnabled = true
    if (instance) {
      analytics.setConsent({ analytics_storage: 'granted' })
      analytics.setAnalyticsCollectionEnabled(instance, true)
    }
    await logPage()
    return
  }

  if (!services) return
  const { analytics, instance, perf } = await services
  perf.dataCollectionEnabled = false
  perf.instrumentationEnabled = false
  if (instance) {
    analytics.setAnalyticsCollectionEnabled(instance, false)
    analytics.setConsent({ analytics_storage: 'denied' })
  }
  clearAnalyticsCookies()
}

export const trackPage = (pattern: string) => {
  page = { page_path: pattern, page_location: `${location.origin}${pattern}`, page_title: pattern }
  void logPage()
}

// Fixed values only, so nothing anyone writes can reach an event
interface Events {
  sign_up: { method: 'password' | 'google' }
  login: { method: 'password' | 'google' }
  delete_account: Record<string, never>
}

export const track = <K extends keyof Events>(name: K, params: Events[K]) => {
  if (!counting()) return
  void start().then(({ analytics, instance }) => instance && analytics.logEvent(instance, name as string, params))
}

export const trackSignIn = (credential: UserCredential, method: 'password' | 'google') =>
  track(getAdditionalUserInfo(credential)?.isNewUser ? 'sign_up' : 'login', { method })
