import { describe, expect, it } from 'vitest'
import { loadPage, reloadForRelease } from './release'

const memory = () => {
  const items = new Map<string, string>()
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) }
}

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

describe('loadPage', () => {
  const gone = new Error('Failed to fetch dynamically imported module')

  it('opens the page without reloading when its code loads', async () => {
    const store = memory()
    let reloads = 0
    const page = { Admin: 'review sheet' }
    await expect(loadPage(async () => page, () => void reloads++, () => store, () => 1_000_000)).resolves.toBe(page)
    expect(reloads).toBe(0)
  })

  it('reloads once for code that went with a deploy, and still passes the error on', async () => {
    const store = memory()
    let reloads = 0
    const fail = () => Promise.reject(gone)
    await expect(loadPage(fail, () => void reloads++, () => store, () => 1_000_000)).rejects.toBe(gone)
    expect(reloads).toBe(1)
    // Still failing straight after the reload: the code is missing, so the Reload note shows instead
    await expect(loadPage(fail, () => void reloads++, () => store, () => 1_010_000)).rejects.toBe(gone)
    expect(reloads).toBe(1)
  })
})
