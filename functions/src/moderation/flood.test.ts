import { describe, expect, it } from 'vitest'
import { applyFlood, FLOOD_LOG_MAX, FLOOD_MAX, FLOOD_SKEW_MS, FLOOD_WINDOW_MS } from './flood'

describe('write flood', () => {
  const now = 1_000_000

  it('allows a short run of notes', () => {
    const stamps = Array.from({ length: FLOOD_MAX - 1 }, (_, i) => now - i * 1000)
    expect(applyFlood(stamps, now).flooded).toBe(false)
  })

  it('holds the note that crosses the limit', () => {
    const stamps = Array.from({ length: FLOOD_MAX }, (_, i) => now - i * 1000)
    const next = applyFlood(stamps, now)
    expect(next.flooded).toBe(true)
    expect(next.stamps).toHaveLength(FLOOD_MAX + 1)
  })

  it('forgets notes older than the window', () => {
    const stale = Array.from({ length: FLOOD_MAX }, () => now - FLOOD_WINDOW_MS - 1)
    expect(applyFlood(stale, now).flooded).toBe(false)
  })

  it('ignores a missing or junk log', () => {
    expect(applyFlood(undefined, now).flooded).toBe(false)
    expect(applyFlood(['nope', now], now).stamps).toEqual([now, now])
  })

  it('counts notes written well after this one as no flood of its own, however late it is judged', () => {
    const later = Array.from({ length: FLOOD_MAX }, (_, i) => now + FLOOD_SKEW_MS + (i + 1) * 1000)
    expect(applyFlood(later, now).flooded).toBe(false)
  })

  it('counts the notes of its own burst judged before it, even ones written just after it', () => {
    const later = Array.from({ length: FLOOD_MAX }, (_, i) => now + (i + 1) * 1000)
    expect(applyFlood(later, now).flooded).toBe(true)
  })

  it('keeps every stamp in the window when an older note is judged last', () => {
    const later = Array.from({ length: 60 }, (_, i) => now + (i + 1) * 1000)
    expect(applyFlood(later, now).stamps).toEqual([now, ...later])
  })

  it('keeps the newest stamps once the log is full', () => {
    const later = Array.from({ length: FLOOD_LOG_MAX }, (_, i) => now + (i + 1) * 1000)
    expect(applyFlood(later, now).stamps).toEqual(later)
  })

  // Notes judged one after another in this order, as the backend catches up; the ones held
  const held = (order: number[]) =>
    order.reduce<{ log: unknown; held: number[] }>(
      ({ log, held }, writtenAt) => {
        const next = applyFlood(log, writtenAt)
        return { log: next.stamps, held: next.flooded ? [...held, writtenAt] : held }
      },
      { log: undefined, held: [] },
    ).held

  it('judges a slow backlog as it was written, in any order', () => {
    // Twelve notes three minutes apart, written while the backend was off
    const written = Array.from({ length: 12 }, (_, i) => now + i * 3 * 60_000)
    const shuffled = [5, 0, 11, 3, 8, 1, 10, 6, 2, 9, 4, 7].map((i) => written[i])
    expect(held(written)).toEqual([])
    expect(held([...written].reverse())).toEqual([])
    expect(held(shuffled)).toEqual([])
  })

  it('still holds a real burst judged in the order it was written', () => {
    const written = Array.from({ length: 12 }, (_, i) => now + i * 10_000)
    expect(held(written)).toEqual(written.slice(FLOOD_MAX))
  })

  it('holds a burst judged out of order just as much', () => {
    // Sixty notes a second apart, judged in two batches of thirty, each newest first
    const written = Array.from({ length: 60 }, (_, i) => now + i * 1000)
    const first = written.slice(0, 30).reverse()
    const second = written.slice(30).reverse()
    expect(held([...first, ...second])).toEqual([...first.slice(FLOOD_MAX), ...second])
  })

  it('publishes the same few of a burst whatever order its triggers run in', () => {
    // Forty notes from a script, 50ms apart; triggers run side by side and retry, in no fixed order
    const written = Array.from({ length: 40 }, (_, i) => now + i * 50)
    const shuffled = [17, 3, 38, 0, 25, 9, 31, 12, 6, 22, 39, 1, 28, 15, 34, 4, 20, 10, 36, 7, 27, 2, 33, 14, 24, 8, 37, 19, 5, 30, 11, 26, 16, 35, 13, 29, 23, 32, 18, 21].map((i) => written[i])
    for (const order of [written, [...written].reverse(), shuffled]) {
      expect(held(order)).toEqual(order.slice(FLOOD_MAX))
    }
  })
})