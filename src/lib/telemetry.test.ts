import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Counting is answered once per device, so an answer given in one tab has to reach the others.
// No browser in node: the window, storage, cookies and Firebase's Analytics and Performance are
// stand-ins, and useCountVisits hands back the store it would give React
const sdk = vi.hoisted(() => {
  const instance = { kind: 'analytics' }
  const perf = { dataCollectionEnabled: true, instrumentationEnabled: true }
  return {
    instance,
    perf,
    analytics: {
      isSupported: async () => true,
      initializeAnalytics: vi.fn(() => instance),
      setConsent: vi.fn(),
      setAnalyticsCollectionEnabled: vi.fn(),
      setDefaultEventParameters: vi.fn(),
      logEvent: vi.fn(),
    },
    initializePerformance: vi.fn(() => perf),
  }
})
vi.mock('./firebase', () => ({ app: {}, USING_EMULATORS: false }))
vi.mock('firebase/auth', () => ({ getAdditionalUserInfo: () => null }))
vi.mock('firebase/analytics', () => sdk.analytics)
vi.mock('firebase/performance', () => ({ initializePerformance: sdk.initializePerformance }))
vi.mock('react', () => ({ useSyncExternalStore: (subscribe: unknown, getSnapshot: unknown) => ({ subscribe, getSnapshot }) }))

interface Store {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => 'yes' | 'no' | null
}

const KEY = 'cc.countVisits'
let stored: Record<string, string>
let tab: EventTarget
let cookieWrites: string[]

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  Object.assign(sdk.perf, { dataCollectionEnabled: true, instrumentationEnabled: true })
  vi.stubEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-TEST')
  stored = {}
  tab = new EventTarget()
  cookieWrites = []
  vi.stubGlobal('window', tab)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored[key] ?? null,
    setItem: (key: string, value: string) => void (stored[key] = value),
  })
  vi.stubGlobal('location', { origin: 'https://example.test', hostname: 'example.test' })
  vi.stubGlobal('document', {
    get cookie() {
      return '_ga=GA1.1.1; _ga_TEST=GS1.1.1'
    },
    set cookie(value: string) {
      cookieWrites.push(value)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const open = async (answer?: 'yes' | 'no') => {
  if (answer) stored[KEY] = answer
  const telemetry = await import('./telemetry')
  return { ...telemetry, store: telemetry.useCountVisits() as unknown as Store }
}

// Another tab saves an answer (null: site data cleared); this tab hears only the storage event
const otherTab = (answer: 'yes' | 'no' | null) => {
  if (answer) stored[KEY] = answer
  else delete stored[KEY]
  tab.dispatchEvent(Object.assign(new Event('storage'), { key: answer ? KEY : null, newValue: answer }))
}

// Long enough for a page view that was going to happen to have happened
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

const countedOff = () => expect(sdk.analytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(sdk.instance, false)

describe('counting visits across tabs', () => {
  it('stops counting here, clears the cookies and unticks the box when another tab says no', async () => {
    const { trackPage, track, store } = await open('yes')
    trackPage('/')
    await vi.waitFor(() => expect(sdk.analytics.logEvent).toHaveBeenCalledTimes(1))
    const heard = vi.fn()
    store.subscribe(heard)

    otherTab('no')
    await vi.waitFor(countedOff)
    expect(sdk.analytics.setConsent).toHaveBeenCalledWith({ analytics_storage: 'denied' })
    expect(sdk.perf).toEqual({ dataCollectionEnabled: false, instrumentationEnabled: false })
    expect(cookieWrites.some((write) => write.startsWith('_ga=; Max-Age=0'))).toBe(true)
    expect(heard).toHaveBeenCalled()
    expect(store.getSnapshot()).toBe('no')

    trackPage('/groups/:groupId')
    track('login', { method: 'password' })
    await settle()
    expect(sdk.analytics.logEvent).toHaveBeenCalledTimes(1)
  })

  it('drops the page view when the no lands while counting is still loading', async () => {
    const { trackPage } = await open('yes')
    trackPage('/')
    otherTab('no')
    await vi.waitFor(countedOff)
    expect(sdk.analytics.logEvent).not.toHaveBeenCalled()
  })

  it('treats site data cleared in another tab as unanswered, so counting stops and the note can ask again', async () => {
    const { trackPage, store } = await open('yes')
    trackPage('/')
    await vi.waitFor(() => expect(sdk.analytics.logEvent).toHaveBeenCalledTimes(1))

    otherTab(null)
    await vi.waitFor(countedOff)
    expect(store.getSnapshot()).toBeNull()
  })

  it('switches back on for a yes from another tab, without counting a page nobody opened', async () => {
    const { trackPage, store } = await open('yes')
    trackPage('/')
    await vi.waitFor(() => expect(sdk.analytics.logEvent).toHaveBeenCalledTimes(1))
    otherTab('no')
    await vi.waitFor(countedOff)

    otherTab('yes')
    await vi.waitFor(() => expect(sdk.analytics.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(sdk.instance, true))
    expect(sdk.analytics.setConsent).toHaveBeenLastCalledWith({ analytics_storage: 'granted' })
    expect(sdk.perf).toEqual({ dataCollectionEnabled: true, instrumentationEnabled: true })
    expect(store.getSnapshot()).toBe('yes')
    await settle()
    expect(sdk.analytics.logEvent).toHaveBeenCalledTimes(1)

    trackPage('/me')
    await vi.waitFor(() => expect(sdk.analytics.logEvent).toHaveBeenCalledTimes(2))
  })

  it('counts the page someone says yes on, by its route pattern', async () => {
    const { trackPage, setCountVisits } = await open()
    trackPage('/messages/:pairId')
    await setCountVisits(true)
    expect(stored[KEY]).toBe('yes')
    expect(sdk.analytics.logEvent).toHaveBeenCalledTimes(1)
    expect(sdk.analytics.logEvent).toHaveBeenCalledWith(sdk.instance, 'page_view', {
      page_path: '/messages/:pairId',
      page_location: 'https://example.test/messages/:pairId',
      page_title: '/messages/:pairId',
    })
  })
})
