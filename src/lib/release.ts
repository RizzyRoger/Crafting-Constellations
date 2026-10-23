const KEY = 'cc.reloadedForRelease'
// A second failure this soon after reloading means the code really is missing, not just old
const GAP_MS = 60_000

type Store = Pick<Storage, 'getItem' | 'setItem'>

// A page's code failed to load. A tab opened before a deploy asks for the old release's files,
// which are gone, and one reload brings the new ones. The reload is noted in storage so a real
// outage can't keep reloading; without storage there's no such note, so leave it to the person.
export const reloadForRelease = (storage: () => Store, now: number) => {
  try {
    const store = storage()
    const last = Number(store.getItem(KEY))
    if (last && now - last < GAP_MS) return false
    store.setItem(KEY, String(now))
    return true
  } catch {
    return false
  }
}

// Only for a page someone is opening: they've left the last one, so a reload loses nothing. Never
// for code fetched in the background (telemetry), which would reload a tab holding unsent writing.
// The error still goes on to the page's Reload note, which shows if the reload doesn't happen
export const loadPage = <T>(
  load: () => Promise<T>,
  reload = () => window.location.reload(),
  storage: () => Store = () => sessionStorage,
  now = Date.now,
) =>
  load().catch((error: unknown) => {
    if (reloadForRelease(storage, now())) reload()
    throw error
  })
