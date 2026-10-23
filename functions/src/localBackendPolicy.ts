import { acceptedWhileAway } from './notifyPolicy.js'

// Firebase-free rules for the local backend, kept apart so they can be unit tested

// A connection's status before a change, as far as the accepted notice goes. Snapshots carry
// no "before", so the backend remembers what it saw. One it never saw that is already accepted
// was asked and answered while it wasn't watching (off, or a listener reconnecting): if that
// was recent, it counts as pending, so the acceptance is still announced.
export const statusBefore = (seen: string | undefined, status: unknown, acceptedAtMs: number | undefined, nowMs: number) =>
  seen ?? (acceptedWhileAway(status, acceptedAtMs, nowMs) ? 'pending' : undefined)

// The Firebase CLI hands list params to functions as JSON, and an unset one as its declared
// default (ADMIN_EMAILS: []); .env files hold them comma-separated
export const listParam = (raw: string | undefined) => {
  if (raw === undefined) return '[]'
  if (raw.trim().startsWith('[')) return raw
  return JSON.stringify(raw.split(',').map((item) => item.trim()).filter(Boolean))
}

// Whether a list param (as listParam leaves it) names anyone. The params loader reads JSON that
// isn't a list of strings as empty and throws on JSON it can't parse, and blank entries match no email.
export const namesAnyone = (param: string) => {
  try {
    const list: unknown = JSON.parse(param)
    const emails = Array.isArray(list) && list.every((item): item is string => typeof item === 'string') ? list : []
    return emails.some((email) => email.trim() !== '')
  } catch {
    return false
  }
}

type Turn = { at: number; work: () => Promise<unknown> }

// Runs work one at a time for each key, and of the work waiting for a key, the earliest `at`
// goes next: work handed over together (one snapshot) or while earlier work runs (a burst
// split across snapshots) runs in that order. Different keys run side by side, and a failure
// doesn't stop the work behind it.
export const earliestFirst = () => {
  // A key is here while its work runs, with what waits behind it
  const waiting = new Map<string, Turn[]>()
  const next = (key: string) => {
    const queue = waiting.get(key) ?? []
    if (queue.length === 0) {
      waiting.delete(key)
      return
    }
    const earliest = queue.reduce((best, turn) => (turn.at < best.at ? turn : best))
    waiting.set(key, queue.filter((turn) => turn !== earliest))
    const done = () => next(key)
    void Promise.resolve().then(earliest.work).then(done, done)
  }
  return (key: string, at: number, work: () => Promise<unknown>) => {
    const queue = waiting.get(key)
    waiting.set(key, [...(queue ?? []), { at, work }])
    // Start after everything handed over in this same moment is waiting too
    if (!queue) queueMicrotask(() => next(key))
  }
}
