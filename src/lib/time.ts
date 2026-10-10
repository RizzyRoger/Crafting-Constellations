import type { Timestamp } from 'firebase/firestore'

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

// "3 hours ago", "yesterday", "just now"
export const ago = (ts: Timestamp | null | undefined) => {
  if (!ts) return 'just now'
  const diff = ts.toMillis() - Date.now()
  if (Math.abs(diff) < 45_000) return 'just now'
  const [unit, size] = UNITS.find(([, ms]) => Math.abs(diff) >= ms) ?? UNITS[UNITS.length - 1]
  if (unit === 'day' && Math.abs(diff) > 6 * 86_400_000) {
    return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return rtf.format(Math.round(diff / size), unit)
}
