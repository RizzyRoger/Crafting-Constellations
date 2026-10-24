import type { Query, Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { arrivalNote, nextArrivals, type Seen } from './arrivals'
import { mergeLive, useDocData, useLiveContent, useQueryData } from './live'
import type { Content, Status } from './types'

// A stand-in for React's hooks, one slot list per component. `render` runs a component's
// hooks; `commit` then runs the effects that render queued, as React does after it. So the
// render after a key change sees the state the last key left, before any new listen opens.
const react = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: unknown }
  let slots: Slot[] = []
  let at = 0
  let effects: (() => void)[] = []
  const slot = () => (slots[at++] ??= {})
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((x, i) => Object.is(x, b[i]))
  return {
    useState: <S>(initial: S) => {
      const s = slot()
      if (!('value' in s)) s.value = initial
      const set = (next: S | ((last: S) => S)) => {
        s.value = typeof next === 'function' ? (next as (last: S) => S)(s.value as S) : next
      }
      return [s.value as S, set] as const
    },
    useMemo: <V>(make: () => V, deps: unknown[]) => {
      const s = slot()
      if (!same(s.deps, deps)) Object.assign(s, { value: make(), deps })
      return s.value as V
    },
    useEffect: (run: () => void | (() => void), deps: unknown[]) => {
      const s = slot()
      if (same(s.deps, deps)) return
      s.deps = deps
      effects.push(() => {
        if (typeof s.cleanup === 'function') s.cleanup()
        s.cleanup = run()
      })
    },
    component: (): Slot[] => [],
    render: <R>(component: Slot[], hook: () => R): R => {
      slots = component
      at = 0
      return hook()
    },
    commit: () => {
      const queued = effects
      effects = []
      queued.forEach((run) => run())
    },
  }
})

// Firestore that records each listen by name and lets a test answer or refuse it
const fs = vi.hoisted(() => ({
  listened: [] as string[],
  open: new Map<string, (snap: unknown) => void>(),
  refuse: new Map<string, (error: Error) => void>(),
}))

vi.mock('react', () => react)
vi.mock('./firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ name: path }),
  collection: (_db: unknown, path: string) => ({ name: path }),
  where: (field: string, op: string, value: unknown) => `${field}${op}${String(value)}`,
  orderBy: () => '',
  limit: () => '',
  query: (ref: { name: string }, ...parts: string[]) => ({ name: `${ref.name}?${parts.filter(Boolean).join('&')}` }),
  onSnapshot: (ref: { name: string }, ...args: unknown[]) => {
    const [next, error] = args.filter((arg) => typeof arg === 'function')
    fs.listened.push(ref.name)
    fs.open.set(ref.name, next as (snap: unknown) => void)
    fs.refuse.set(ref.name, error as (error: Error) => void)
    return () => {
      fs.open.delete(ref.name)
      fs.refuse.delete(ref.name)
    }
  },
}))

const snapOf = (path: string, data: object | null, pending = false) => ({
  id: path.split('/').pop(),
  ref: { path },
  exists: () => data !== null,
  data: () => data ?? undefined,
  metadata: { hasPendingWrites: pending },
})

const answerDoc = (path: string, data: object | null) => fs.open.get(path)?.(snapOf(path, data))

// Answers every open listen whose name starts with `prefix`: from the server unless said
// otherwise, and with changed rows unless only the metadata changed. Rows in `pending` are only
// local writes so far; `confirmed` ones the server just took, and only their metadata changed
const answerRows = (
  prefix: string,
  rows: Record<string, object>,
  { fromCache = false, metadataOnly = false, pending = [] as string[], confirmed = [] as string[] } = {},
) =>
  [...fs.open]
    .filter(([name]) => name.startsWith(prefix))
    .forEach(([, next]) => {
      const docs = Object.entries(rows).map(([path, data]) => snapOf(path, data, pending.includes(path)))
      const metadata = docs.filter((d) => confirmed.includes(d.ref.path))
      const docChanges = ({ includeMetadataChanges = false } = {}) => (metadataOnly ? (includeMetadataChanges ? metadata : []) : docs)
      next({ docs, docChanges, metadata: { fromCache, hasPendingWrites: pending.length > 0 } })
    })

const refuseRows = (prefix: string) =>
  [...fs.refuse].filter(([name]) => name.startsWith(prefix)).forEach(([, error]) => error(new Error('permission-denied')))

const at = (ms: number) => ({ toMillis: () => ms }) as Timestamp

const item = (id: string, status: Status, ms: number, authorUid = 'me'): Content => ({
  id,
  path: `groups/g/messages/${id}`,
  authorUid,
  status,
  createdAt: at(ms),
})

type Note = Content & { text: string }

beforeEach(() => {
  fs.listened.length = 0
  fs.open.clear()
  fs.refuse.clear()
})

describe('live hooks when the key changes', () => {
  it('Back to a group I am not in opens none of its talk before its membership comes', () => {
    const group = react.component()
    const talk = react.component()
    // Group.tsx: member-only listeners wait for the server's membership
    const open = (gid: string) => {
      const membership = react.render(group, () => useDocData<{ uid: string }>(`groups/${gid}/members/me`))
      const member = !membership.loading && Boolean(membership.data) && !membership.pending
      if (member) react.render(talk, () => useLiveContent(`groups/${gid}/messages`, 'me', { direction: 'asc', max: 80 }))
      react.commit()
      return membership
    }

    open('B')
    answerDoc('groups/B/members/me', null)
    open('B')
    open('A')
    answerDoc('groups/A/members/me', { uid: 'me' })
    expect(open('A').data).toMatchObject({ uid: 'me' })
    expect(fs.listened.some((name) => name.startsWith('groups/A/messages?'))).toBe(true)

    // The render after Back still holds A's membership: it must not read as B's
    expect(open('B')).toMatchObject({ data: null, loading: true, error: null, pending: false })
    answerDoc('groups/B/members/me', null)
    expect(open('B')).toMatchObject({ data: null, loading: false })
    expect(fs.listened.some((name) => name.startsWith('groups/B/messages'))).toBe(false)
  })

  it('switching private conversations never shows the last one’s notes', () => {
    const thread = react.component()
    const show = (pairId: string) => {
      const notes = react.render(thread, () => useLiveContent<Note>(`dms/${pairId}/messages`, 'me', { direction: 'asc', max: 200 }))
      react.commit()
      return { texts: notes.data.map((note) => note.text), loading: notes.loading }
    }

    show('me_x')
    answerRows('dms/me_x/messages?', { 'dms/me_x/messages/n1': { status: 'published', createdAt: at(1), text: 'to x' } })
    expect(show('me_x')).toEqual({ texts: ['to x'], loading: false })

    // Y's notes wait on the server; until then there is nothing, not X's
    expect(show('me_y')).toEqual({ texts: [], loading: true })
    expect(show('me_y')).toEqual({ texts: [], loading: true })
    answerRows('dms/me_y/messages?', { 'dms/me_y/messages/n2': { status: 'published', createdAt: at(2), text: 'to y' } })
    expect(show('me_y')).toEqual({ texts: ['to y'], loading: false })
  })

  it('a query keeps its last rows, marked loading, until the new key’s come', () => {
    const rail = react.component()
    const search = (needle: string) => {
      const found = react.render(rail, () =>
        useQueryData<{ id: string }>(needle ? `rail-search|${needle}` : null, () => ({ name: `users?${needle}` }) as unknown as Query),
      )
      react.commit()
      return { ids: found.data.map((p) => p.id), loading: found.loading }
    }

    search('j')
    answerRows('users?j', { 'users/jo': {}, 'users/jan': {} })
    expect(search('j')).toEqual({ ids: ['jo', 'jan'], loading: false })
    expect(search('jo')).toEqual({ ids: ['jo', 'jan'], loading: true })
    answerRows('users?jo', { 'users/jo': {} })
    expect(search('jo')).toEqual({ ids: ['jo'], loading: false })
    expect(search('')).toEqual({ ids: [], loading: false })
    expect(search('m')).toEqual({ ids: [], loading: true })
  })

  it('group talk leaves out my old messages from before the newest published ones', () => {
    const talk = react.component()
    const show = () => {
      const messages = react.render(talk, () => useLiveContent<Note>('groups/g/messages', 'me', { direction: 'asc', max: 2 }))
      react.commit()
      return messages.data.map((m) => m.id)
    }

    show()
    answerRows('groups/g/messages?status', {
      'groups/g/messages/new': { status: 'published', createdAt: at(300), authorUid: 'ann' },
      'groups/g/messages/mid': { status: 'published', createdAt: at(200), authorUid: 'me' },
    })
    answerRows('groups/g/messages?authorUid', {
      'groups/g/messages/mid': { status: 'published', createdAt: at(200), authorUid: 'me' },
      'groups/g/messages/old': { status: 'published', createdAt: at(100), authorUid: 'me' },
    })
    expect(show()).toEqual(['mid', 'new'])
  })
})

// The published window can answer first from the cache, holding only what the list of mine
// brought there, and from the server a moment later
describe('live content says when the server has answered', () => {
  const mine = { 'groups/g/messages/m1': { status: 'published', createdAt: at(100), authorUid: 'me', text: 'mine' } }
  const others = {
    'groups/g/messages/o1': { status: 'published', createdAt: at(120), authorUid: 'ann', text: 'from ann' },
    'groups/g/messages/o2': { status: 'published', createdAt: at(150), authorUid: 'bo', text: 'from bo' },
  }
  // Opens the talk's listens, and gives back its next render
  const watch = () => {
    const talk = react.component()
    const show = () => {
      const messages = react.render(talk, () => useLiveContent<Note>('groups/g/messages', 'me', { direction: 'asc', max: 80 }))
      react.commit()
      return messages
    }
    show()
    return show
  }

  it('shows what the cache holds at once, but is synced only once the server has answered both lists', () => {
    const show = watch()
    expect(show()).toMatchObject({ loading: true, synced: false })
    answerRows('groups/g/messages?authorUid', mine)
    answerRows('groups/g/messages?status', mine, { fromCache: true })
    // Offline this is all there is, so it shows
    expect(show()).toMatchObject({ loading: false, synced: false })
    expect(show().data.map((m) => m.id)).toEqual(['m1'])

    answerRows('groups/g/messages?status', { ...mine, ...others })
    expect(show()).toMatchObject({ loading: false, synced: true })
    expect(show().data.map((m) => m.id)).toEqual(['m1', 'o1', 'o2'])
  })

  it('hears the server even when its answer changes no rows', () => {
    const show = watch()
    answerRows('groups/g/messages?authorUid', mine)
    answerRows('groups/g/messages?status', { ...mine, ...others }, { fromCache: true })
    const cached = show()
    expect(cached.synced).toBe(false)

    answerRows('groups/g/messages?status', { ...mine, ...others }, { metadataOnly: true })
    expect(show()).toMatchObject({ synced: true })
    // The same rows, so nothing built from them is rebuilt
    expect(show().data).toBe(cached.data)
  })

  it('stays synced when the connection drops, and renders nothing new for a snapshot of only metadata', () => {
    const show = watch()
    answerRows('groups/g/messages?authorUid', mine)
    answerRows('groups/g/messages?status', { ...mine, ...others })
    const synced = show()
    expect(synced.synced).toBe(true)

    answerRows('groups/g/messages?status', { ...mine, ...others }, { fromCache: true, metadataOnly: true })
    answerRows('groups/g/messages?authorUid', mine, { fromCache: true, metadataOnly: true })
    const after = show()
    expect(after.synced).toBe(true)
    expect(after.data).toBe(synced.data)
  })

  it('counts a refused list as answered', () => {
    const show = watch()
    refuseRows('groups/g/messages?authorUid')
    expect(show()).toMatchObject({ loading: true, synced: false })
    answerRows('groups/g/messages?status', others)
    expect(show()).toMatchObject({ loading: false, synced: true, error: new Error('permission-denied') })
  })

  it('is not synced for another conversation until that one’s server answers', () => {
    const thread = react.component()
    const show = (pairId: string) => {
      const notes = react.render(thread, () => useLiveContent<Note>(`dms/${pairId}/messages`, 'me', { direction: 'asc', max: 200 }))
      react.commit()
      return notes
    }

    show('me_x')
    answerRows('dms/me_x/messages?', { 'dms/me_x/messages/n1': { status: 'published', createdAt: at(1), text: 'to x' } })
    expect(show('me_x').synced).toBe(true)
    expect(show('me_y').synced).toBe(false)
    answerRows('dms/me_y/messages?', { 'dms/me_y/messages/n2': { status: 'published', createdAt: at(2), text: 'to y' } }, { fromCache: true })
    expect(show('me_y')).toMatchObject({ loading: false, synced: false })
    answerRows('dms/me_y/messages?', { 'dms/me_y/messages/n2': { status: 'published', createdAt: at(2), text: 'to y' } }, { metadataOnly: true })
    expect(show('me_y').synced).toBe(true)
  })

  it('opens talk with its history, not one false "new messages", when the cache answers before the server', () => {
    const show = watch()
    // As Talk and Thread do: Arrivals steps over the rows, opening until they are synced
    let seen: Seen = null
    const say = () => {
      const messages = show()
      const next = nextArrivals(seen, messages.data, !messages.synced, 'me')
      seen = next.seen
      return arrivalNote(next, 'me')
    }

    expect(say()).toBeNull()
    answerRows('groups/g/messages?authorUid', mine)
    expect(say()).toBeNull()
    answerRows('groups/g/messages?status', mine, { fromCache: true })
    expect(say()).toBeNull()
    answerRows('groups/g/messages?status', { ...mine, ...others })
    expect(say()).toBeNull()

    // Once open, what someone else writes is news
    const hello = { 'groups/g/messages/o3': { status: 'published', createdAt: at(200), authorUid: 'ann', text: 'hello' } }
    answerRows('groups/g/messages?status', { ...mine, ...others, ...hello })
    expect(say()).toBe('New message: hello')
  })
})

// The shell joins Daily check-in with a write that's local at first, and a member-only listen the
// rules judge before the server has it is refused. A page listing my memberships has to tell them apart
describe('rows marked pending', () => {
  const JOINING = 'groups/daily-check-in/members/me'
  const rows = { 'groups/a/members/me': { uid: 'me' }, [JOINING]: { uid: 'me' } }
  type Member = { path: string; pending?: boolean }
  // Opens my memberships' listen, and gives back its next render
  const watch = (options?: { pending: boolean }) => {
    const page = react.component()
    const show = () => {
      const found = react.render(page, () => useQueryData<Member>('my-members|me', () => ({ name: 'members?uid==me' }) as unknown as Query, options))
      react.commit()
      return found.data
    }
    show()
    return show
  }

  it('say which are only local writes, and hear the server take one even when its data is the same', () => {
    const show = watch({ pending: true })
    answerRows('members?', rows, { pending: [JOINING] })
    expect(show().map((m) => [m.path, m.pending])).toEqual([
      ['groups/a/members/me', false],
      [JOINING, true],
    ])

    answerRows('members?', rows, { metadataOnly: true, confirmed: [JOINING] })
    expect(show().map((m) => [m.path, m.pending])).toEqual([
      ['groups/a/members/me', false],
      [JOINING, false],
    ])
  })

  it('are left as they were when not asked for', () => {
    const show = watch()
    answerRows('members?', rows, { pending: [JOINING] })
    const first = show()
    expect(first.map((m) => 'pending' in m)).toEqual([false, false])

    // Only metadata changed, so nothing built from the rows is rebuilt
    answerRows('members?', rows, { metadataOnly: true, confirmed: [JOINING] })
    expect(show()).toBe(first)
  })
})

describe('mergeLive', () => {
  // The newest three published (one of them mine), and my newest: one just published,
  // one from before the window, and writing still held or waiting
  const published = [item('p3', 'published', 300, 'ann'), item('p2', 'published', 200), item('p1', 'published', 100, 'bo')]
  const mine = [item('fresh', 'published', 250), item('p2', 'published', 200), item('old', 'published', 50), item('held', 'held', 40), item('waiting', 'pending', 30)]
  const ids = (items: Content[]) => items.map((i) => i.id)

  it('once the published window is full, leaves out my published items from before it', () => {
    expect(ids(mergeLive(published, mine, { direction: 'asc', max: 3 }))).toEqual(['waiting', 'held', 'p1', 'p2', 'fresh', 'p3'])
    expect(ids(mergeLive(published, mine, { direction: 'desc', max: 3 }))).toEqual(['p3', 'fresh', 'p2', 'p1', 'held', 'waiting'])
  })

  it('keeps all of mine while the published window holds everything', () => {
    expect(ids(mergeLive(published, mine, { direction: 'asc', max: 4 }))).toEqual(['waiting', 'held', 'old', 'p1', 'p2', 'fresh', 'p3'])
  })

  it('shows an item in both lists once, as my copy has it', () => {
    expect(ids(mergeLive(published, [item('p2', 'withdrawn', 200)], { direction: 'asc', max: 3 }))).toEqual(['p1', 'p3'])
  })
})
