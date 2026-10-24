const KEY = 'cc.reloadedForRelease'
// A second failure this soon after reloading means the code really is missing, not just old
const GAP_MS = 60_000
// How long the page waits on fixing cached copies before it reloads anyway
const REFRESH_MS = 3_000

type Store = Pick<Storage, 'getItem' | 'setItem'>
type Fetch = (url: string, init: RequestInit) => Promise<Response>

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

// Hosting answers a code file that's gone with the front page, under the year-long header real
// code gets, and the browser keeps that copy. If a rollback brings the file back, a reload still
// finds the front page. So ask Hosting again for any cached copy that isn't code, and leave real
// code alone: asking again for a file that's gone would cache the front page over it.
export const refreshCode = async (hrefs: string[], request: Fetch, wait = REFRESH_MS) => {
  const fix = async (href: string) => {
    const cached = await request(href, { cache: 'only-if-cached', mode: 'same-origin' })
    if (cached.ok && /javascript/i.test(cached.headers.get('content-type') ?? '')) return
    // Read to the end so the new copy is stored whole before the reload
    await (await request(href, { cache: 'reload' })).arrayBuffer()
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const cap = new Promise<void>((done) => (timer = setTimeout(done, wait)))
  await Promise.race([Promise.allSettled(hrefs.map(fix)), cap])
  clearTimeout(timer)
}

// The build adds a preload link for a page's file and each file it needs, which names them even
// where the import error doesn't (Safari's has no address)
const pageCode = () =>
  [...document.querySelectorAll<HTMLLinkElement>('link[rel=modulepreload]')]
    .map((link) => new URL(link.href, location.href))
    .filter((url) => url.origin === location.origin && url.pathname.startsWith('/assets/'))
    .map((url) => url.href)

// Only for a page someone is opening: they've left the last one, so a reload loses nothing. Never
// for code fetched in the background (telemetry), which would reload a tab holding unsent writing.
// The error still goes on to the page's Reload note, which shows if the reload doesn't happen; the
// cached copies are fixed then too, so that Reload can work
export const loadPage = <T>(
  load: () => Promise<T>,
  reload = () => window.location.reload(),
  storage: () => Store = () => sessionStorage,
  now = Date.now,
  refresh = async () => refreshCode(pageCode(), (url, init) => fetch(url, init)),
) =>
  load().catch(async (error: unknown) => {
    const fixed = refresh().catch(() => undefined)
    if (reloadForRelease(storage, now())) {
      await fixed
      reload()
    }
    throw error
  })
