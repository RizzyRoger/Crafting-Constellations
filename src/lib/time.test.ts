import type { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ago } from './time'

const NOW = new Date(2026, 9, 10, 12)

// Just the two methods ago() reads, so no Firestore at runtime
const at = (date: Date) => ({ toMillis: () => date.getTime(), toDate: () => date }) as unknown as Timestamp
const fromNow = (ms: number) => at(new Date(NOW.getTime() + ms))

describe('ago', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads a pending write as just now', () => {
    expect(ago(null)).toBe('just now')
    expect(ago(undefined)).toBe('just now')
  })

  it('reads server times ahead of a slow device clock as just now, never in the future', () => {
    expect(ago(fromNow(120_000))).toBe('just now')
    expect(ago(fromNow(3 * 3_600_000))).toBe('just now')
    expect(ago(fromNow(10 * 86_400_000))).toBe('just now')
  })

  it('still counts back for the past week', () => {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    expect(ago(fromNow(-30_000))).toBe('just now')
    expect(ago(fromNow(-2 * 60_000))).toBe(rtf.format(-2, 'minute'))
    expect(ago(fromNow(-3 * 3_600_000))).toBe(rtf.format(-3, 'hour'))
    expect(ago(fromNow(-5 * 86_400_000))).toBe(rtf.format(-5, 'day'))
  })

  it('leaves the year off dates from this year', () => {
    const label = ago(at(new Date(2026, 9, 1, 12)))
    expect(label).toBe(new Date(2026, 9, 1, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
    expect(label).not.toContain('2026')
  })

  it('gives the year for dates from another year, so last October reads apart from this one', () => {
    const lastYear = ago(at(new Date(2025, 9, 1, 12)))
    expect(lastYear).toContain('2025')
    expect(lastYear).not.toBe(ago(at(new Date(2026, 9, 1, 12))))
    expect(ago(at(new Date(2025, 11, 20, 12)))).toContain('2025')
  })
})
