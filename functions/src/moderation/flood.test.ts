import { describe, expect, it } from 'vitest'
import { applyFlood, FLOOD_MAX, FLOOD_WINDOW_MS } from './flood'

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
})