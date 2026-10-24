import type { Timestamp } from 'firebase/firestore'

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

// "3 hours ago", "yesterday", "just now", "Oct 1", "Oct 1, 2025"
export const ago = (ts: Timestamp | null | undefined) => {
  if (!ts) return 'just now'
  // Times are the server's, so a device clock running behind would read them as "in 2 minutes"
  const diff = Math.min(ts.toMillis() - Date.now(), 0)
  if (Math.abs(diff) < 45_000) return 'just now'
  const [unit, size] = UNITS.find(([, ms]) => Math.abs(diff) >= ms) ?? UNITS[UNITS.length - 1]
  if (unit === 'day' && Math.abs(diff) > 6 * 86_400_000) {
    const date = ts.toDate()
    // The year only when it isn't this one, so last October doesn't pass for this October
    const year = date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
    return date.toLocaleDateString(undefined, { year, month: 'short', day: 'numeric' })
  }
  return rtf.format(Math.round(diff / size), unit)
}
