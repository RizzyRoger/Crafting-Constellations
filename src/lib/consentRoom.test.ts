import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_ROOM, consentRoom, makeRoomFor } from './consentRoom'

describe('consentRoom', () => {
  it('is the slip’s height and the gap under it, in whole pixels', () => {
    expect(consentRoom(231, '16px')).toBe('247px')
    expect(consentRoom(230.4, '20px')).toBe('251px')
  })

  it('is the height alone where the slip has no gap under it', () => {
    expect(consentRoom(231, 'auto')).toBe('231px')
  })
})

describe('makeRoomFor', () => {
  // A stand-in for the browser's observer, which the test fires as the slip reflows
  const watcher = { reflow: () => {}, watched: [] as unknown[], stopped: false }
  beforeEach(() => {
    Object.assign(watcher, { reflow: () => {}, watched: [], stopped: false })
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          watcher.reflow = callback
        }
        observe(target: unknown) {
          watcher.watched.push(target)
        }
        disconnect() {
          watcher.stopped = true
        }
      },
    )
    vi.stubGlobal('getComputedStyle', () => ({ bottom: '16px' }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const page = () => {
    const set = new Map<string, string>()
    const root = { style: { setProperty: (name: string, value: string) => set.set(name, value), removeProperty: (name: string) => set.delete(name) } }
    return { set, root: root as unknown as HTMLElement }
  }

  it('leaves room as the slip shows, before the observer first reports', () => {
    const { set, root } = page()
    const slip = { offsetHeight: 231 } as HTMLElement
    makeRoomFor(slip, root)
    expect(set.get(CONSENT_ROOM)).toBe('247px')
    expect(watcher.watched).toEqual([slip])
  })

  it('follows the slip as it reflows', () => {
    const { set, root } = page()
    const slip = { offsetHeight: 231 } as { offsetHeight: number }
    makeRoomFor(slip as HTMLElement, root)
    slip.offsetHeight = 180
    watcher.reflow()
    expect(set.get(CONSENT_ROOM)).toBe('196px')
  })

  it('gives the room back when the slip goes', () => {
    const { set, root } = page()
    const done = makeRoomFor({ offsetHeight: 231 } as HTMLElement, root)
    done()
    expect(set.has(CONSENT_ROOM)).toBe(false)
    expect(watcher.stopped).toBe(true)
  })
})
