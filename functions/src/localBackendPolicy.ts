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

// Auth's account for a caller, or none when it has no record of one. Any other failure (Auth
// unreachable, a quota, a key that won't refresh) is the server's trouble, not the caller's: it is
// passed on, so the call fails as internal, as on Cloud Functions, instead of asking a signed-in
// person to sign in
export const userOrNone = <T>(lookup: Promise<T>) =>
  lookup.catch((error: { code?: unknown } | undefined) => {
    if (error?.code === 'auth/user-not-found') return null
    throw error
  })

// FIREBASE_CONFIG for the backend: the one it was given, or just the project with no Storage
// bucket (Storage isn't available without Blaze, so account deletion skips it). On the emulators a
// bucket counts only beside the Storage emulator: emulators:exec names one of its own accord, and
// with no Storage emulator the purge would reach the real Cloud Storage.
export const firebaseConfigFor = (projectId: string, env: Record<string, string | undefined>) => {
  const realStorageFromEmulators = Boolean(env.FIRESTORE_EMULATOR_HOST) && !env.FIREBASE_STORAGE_EMULATOR_HOST
  return env.FIREBASE_CONFIG && !realStorageFromEmulators ? env.FIREBASE_CONFIG : JSON.stringify({ projectId })
}

// Waits for work, but for `ms` at most
export const within = async (work: Promise<unknown>, ms: number) => {
  let timer: NodeJS.Timeout | undefined
  await Promise.race([work, new Promise((resolve) => (timer = setTimeout(resolve, ms)))])
  clearTimeout(timer)
}

// Work under way, so stopping can wait for it for a while and learn what it had to leave
// unfinished. A failure is the work's own to report: here it only counts as ended.
export const underWay = <T>() => {
  const running = new Set<{ item: T; ended: Promise<void> }>()
  return {
    add: (item: T, work: Promise<unknown>) => {
      const entry = { item, ended: work.then(() => undefined, () => undefined) }
      running.add(entry)
      void entry.ended.then(() => running.delete(entry))
    },
    // Waits up to `ms` for everything under way; what is still going then
    settle: async (ms: number) => {
      await within(Promise.all([...running].map((entry) => entry.ended)), ms)
      return [...running].map((entry) => entry.item)
    },
  }
}
