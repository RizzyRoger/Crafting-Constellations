import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPage, refreshCode, reloadForRelease } from './release'

const memory = () => {
  const items = new Map<string, string>()
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) }
}

const fixNothing = async () => {}

describe('reloadForRelease', () => {
  it('reloads once for code that went with a deploy', () => {
    const store = memory()
    expect(reloadForRelease(() => store, 1_000_000)).toBe(true)
  })

  it('does not reload again straight after, so a real outage cannot loop', () => {
    const store = memory()
    expect(reloadForRelease(() => store, 1_000_000)).toBe(true)
    expect(reloadForRelease(() => store, 1_005_000)).toBe(false)
    expect(reloadForRelease(() => store, 1_059_999)).toBe(false)
  })

  it('reloads again for a later deploy', () => {
    const store = memory()
    expect(reloadForRelease(() => store, 1_000_000)).toBe(true)
    expect(reloadForRelease(() => store, 1_000_000 + 10 * 60_000)).toBe(true)
  })

  it('leaves it to the person when storage is blocked', () => {
    expect(
      reloadForRelease(() => {
        throw new Error('SecurityError')
      }, 1_000_000),
    ).toBe(false)
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(reloadForRelease(() => full, 1_000_000)).toBe(false)
  })
})

const site = 'https://crafting-constellations.web.app'
const admin = `${site}/assets/Admin-vj57QZ1I.js`
const react = `${site}/assets/react-CRBQKoJX.js`
const firebase = `${site}/assets/firebase-BTVuDerO.js`

const code = () => new Response('export const Admin = 1', { headers: { 'content-type': 'text/javascript; charset=utf-8' } })
// What Hosting sends for a code file that's gone: the front page, under the year-long header
const frontPage = () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })

// A browser cache holding some copies, and Hosting answering whatever is live now
const browser = (cache: Record<string, () => Response>, live: Record<string, () => Response> = {}) => {
  const calls: string[] = []
  const answers: Response[] = []
  const request = async (url: string, init: RequestInit) => {
    calls.push(`${init.cache} ${url}`)
    if (init.cache === 'only-if-cached') {
      expect(init.mode).toBe('same-origin')
      if (!cache[url]) throw new TypeError('Failed to fetch')
      return cache[url]()
    }
    const answer = (live[url] ?? frontPage)()
    answers.push(answer)
    return answer
  }
  return { calls, answers, request }
}

describe('refreshCode', () => {
  it('asks Hosting again for a cached front page, after a rollback brought the file back', async () => {
    const { calls, answers, request } = browser({ [admin]: frontPage }, { [admin]: code })
    await refreshCode([admin], request)
    expect(calls).toEqual([`only-if-cached ${admin}`, `reload ${admin}`])
    // Read whole, so the browser stores the new copy before the page reloads
    expect(answers[0].bodyUsed).toBe(true)
  })

  it('asks again for a cached error too', async () => {
    const { calls, request } = browser({ [admin]: () => new Response('Not found', { status: 404 }) })
    await refreshCode([admin], request)
    expect(calls).toEqual([`only-if-cached ${admin}`, `reload ${admin}`])
  })

  it('leaves real code alone, so a file that went with a deploy keeps its good copy', async () => {
    // Asking again for firebase-… while a release without it is live would cache the front page
    // over it, and a rollback to its release would then fail to start at all
    const { calls, request } = browser({ [react]: code, [firebase]: code, [admin]: frontPage })
    await refreshCode([react, firebase, admin], request)
    expect(calls.filter((call) => call.startsWith('reload'))).toEqual([`reload ${admin}`])
  })

  it('leaves a file alone that the browser has no copy of', async () => {
    const { calls, request } = browser({})
    await refreshCode([admin], request)
    expect(calls).toEqual([`only-if-cached ${admin}`])
  })

  it('carries on when Hosting cannot be reached', async () => {
    const request = async (_url: string, init: RequestInit) => {
      if (init.cache === 'only-if-cached') return frontPage()
      throw new TypeError('Failed to fetch')
    }
    await expect(refreshCode([admin, react], request)).resolves.toBeUndefined()
  })

  it('stops waiting after a short while, so the reload still comes', async () => {
    const request = (_url: string, init: RequestInit) =>
      init.cache === 'only-if-cached' ? Promise.resolve(frontPage()) : new Promise<Response>(() => {})
    await expect(refreshCode([admin], request, 10)).resolves.toBeUndefined()
  })
})

describe('loadPage', () => {
  const gone = new Error('Failed to fetch dynamically imported module')

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the page without reloading when its code loads', async () => {
    const store = memory()
    let reloads = 0
    let refreshes = 0
    const page = { Admin: 'review sheet' }
    await expect(
      loadPage(async () => page, () => void reloads++, () => store, () => 1_000_000, async () => void refreshes++),
    ).resolves.toBe(page)
    expect(reloads).toBe(0)
    expect(refreshes).toBe(0)
  })

  it('reloads once for code that went with a deploy, and still passes the error on', async () => {
    const store = memory()
    let reloads = 0
    const fail = () => Promise.reject(gone)
    await expect(loadPage(fail, () => void reloads++, () => store, () => 1_000_000, fixNothing)).rejects.toBe(gone)
    expect(reloads).toBe(1)
    // Still failing straight after the reload: the code is missing, so the Reload note shows instead
    await expect(loadPage(fail, () => void reloads++, () => store, () => 1_010_000, fixNothing)).rejects.toBe(gone)
    expect(reloads).toBe(1)
  })

  it('fixes cached copies of the code before its one reload', async () => {
    const store = memory()
    const { calls, request } = browser({ [admin]: frontPage }, { [admin]: code })
    const fail = () => Promise.reject(gone)
    const reload = () => void calls.push('reload')
    await expect(loadPage(fail, reload, () => store, () => 1_000_000, () => refreshCode([admin], request))).rejects.toBe(gone)
    expect(calls).toEqual([`only-if-cached ${admin}`, `reload ${admin}`, 'reload'])
  })

  it('still reloads when fixing the copies goes wrong', async () => {
    const store = memory()
    let reloads = 0
    const broken = async () => {
      throw new Error('no document')
    }
    await expect(loadPage(() => Promise.reject(gone), () => void reloads++, () => store, () => 1_000_000, broken)).rejects.toBe(gone)
    expect(reloads).toBe(1)
  })

  it('fixes the copies without reloading when it may not reload, so the Reload note can work', async () => {
    let reloads = 0
    let refreshes = 0
    const blocked = () => {
      throw new Error('SecurityError')
    }
    await expect(loadPage(() => Promise.reject(gone), () => void reloads++, blocked, () => 1_000_000, async () => void refreshes++)).rejects.toBe(gone)
    expect(reloads).toBe(0)
    expect(refreshes).toBe(1)
  })

  it("reads the page's code files from the build's preload links", async () => {
    const store = memory()
    const { calls, request } = browser({ [react]: code, [firebase]: code, [admin]: frontPage }, { [admin]: code })
    const links = [
      { href: react },
      { href: firebase },
      { href: admin },
      // Not this site's code: left alone
      { href: 'https://fonts.googleapis.com/assets/sans.js' },
      { href: `${site}/favicon.svg` },
      { href: '' },
    ]
    const selectors: string[] = []
    vi.stubGlobal('document', {
      querySelectorAll: (selector: string) => {
        selectors.push(selector)
        return links
      },
    })
    vi.stubGlobal('location', new URL(`${site}/admin`))
    vi.stubGlobal('fetch', request)
    const reload = () => void calls.push('reload')
    await expect(loadPage(() => Promise.reject(gone), reload, () => store, () => 1_000_000)).rejects.toBe(gone)
    expect(selectors).toEqual(['link[rel=modulepreload]'])
    expect(calls).toEqual([`only-if-cached ${react}`, `only-if-cached ${firebase}`, `only-if-cached ${admin}`, `reload ${admin}`, 'reload'])
  })
})
