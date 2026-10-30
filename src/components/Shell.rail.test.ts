import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from './Shell'

// The rail names each private conversation and counts the requests waiting on me, looking the
// people up by id, and one Firestore `in` query holds 30 ids. No DOM here, so the rail runs on a
// small stand-in for React's hooks: each keeps its slot from one render to the next, as it does
// while the rail stays mounted, and a render's effects run after it, as React runs them
const react = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: unknown }
  let slots: Slot[] = []
  let at = 0
  let effects: (() => void)[] = []
  const slot = () => (slots[at++] ??= {})
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((x, i) => Object.is(x, b[i]))
  return {
    useState: (initial: unknown) => {
      const s = slot()
      if (!('value' in s)) s.value = typeof initial === 'function' ? (initial as () => unknown)() : initial
      const set = (next: unknown) => {
        s.value = typeof next === 'function' ? (next as (last: unknown) => unknown)(s.value) : next
      }
      return [s.value, set]
    },
    useMemo: (make: () => unknown, deps: unknown[]) => {
      const s = slot()
      if (!same(s.deps, deps)) Object.assign(s, { value: make(), deps })
      return s.value
    },
    useRef: (initial: unknown) => {
      const s = slot()
      if (!('value' in s)) s.value = { current: initial }
      return s.value
    },
    useEffect: (run: () => unknown, deps: unknown[]) => {
      const s = slot()
      if (same(s.deps, deps)) return
      s.deps = deps
      effects.push(() => {
        if (typeof s.cleanup === 'function') s.cleanup()
        s.cleanup = run()
      })
    },
    // One render of a mounted component, then its effects
    render: <R>(component: Slot[], run: () => R): R => {
      slots = component
      at = 0
      const out = run()
      const queued = effects
      effects = []
      queued.forEach((effect) => effect())
      return out
    },
  }
})

// Firestore with a few rows in it. Each listen is answered as it opens, unless answers are held,
// and an `in` longer than 30 is refused as Firestore refuses it
const store = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, Record<string, unknown>>>,
  hold: false,
  open: new Map<() => void, string>(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: react.useState,
  useMemo: react.useMemo,
  useRef: react.useRef,
  useEffect: react.useEffect,
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useLocation: () => ({ pathname: '/constellation', search: '' }),
  useNavigate: () => () => undefined,
}))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('../auth/useSignOut', () => ({ useSignOut: () => async () => undefined }))
vi.mock('./CheckIn', () => ({ CheckIn: () => null, useCheckInDraft: () => ({}) }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'alice' },
    profile: { id: 'alice', penName: 'Alice', avatarSeed: 'alice', pigment: 'ochre', pro: false, banned: false },
    claims: { admin: false, pro: false, banned: false, emailVerified: true },
  }),
}))
vi.mock('firebase/firestore', async (importOriginal) => {
  type Filter = { field: string; op: string; value: unknown }
  type Ask = { path: string; filters: Filter[] }
  const fits = ({ field, op, value }: Filter, id: string, row: Record<string, unknown>) => {
    if (field === '__name__') return (value as string[]).includes(id)
    if (op === 'array-contains') return (row[field] as unknown[] | undefined)?.includes(value) ?? false
    return row[field] === value
  }
  return {
    ...(await importOriginal<typeof import('firebase/firestore')>()),
    collection: (_db: unknown, path: string) => ({ path }),
    collectionGroup: (_db: unknown, id: string) => ({ path: `*/${id}` }),
    documentId: () => '__name__',
    where: (field: string, op: string, value: unknown) => {
      if (op === 'in' && (value as unknown[]).length > 30) {
        throw new Error('Invalid Query. \'in\' filters support a maximum of 30 elements in the value array.')
      }
      return { field, op, value }
    },
    query: (ref: { path: string }, ...filters: (Filter | null)[]) => ({ path: ref.path, filters: filters.filter(Boolean) }),
    orderBy: () => null,
    limit: () => null,
    startAt: () => null,
    endAt: () => null,
    onSnapshot: (ask: Ask, ...args: unknown[]) => {
      const [next] = args.filter((arg) => typeof arg === 'function') as ((snap: unknown) => void)[]
      const answer = () => {
        const docs = Object.entries(store.rows[ask.path] ?? {})
          .filter(([id, row]) => ask.filters.every((filter) => fits(filter, id, row)))
          .map(([id, row]) => ({ id, ref: { path: `${ask.path}/${id}` }, data: () => row, metadata: { hasPendingWrites: false } }))
        next({ docs, docChanges: () => docs, metadata: { fromCache: false, hasPendingWrites: false } })
      }
      store.open.set(answer, ask.path)
      if (!store.hold) answer()
      return () => store.open.delete(answer)
    },
  }
})

type El = ReactElement<{ to?: string; children?: ReactNode; 'aria-label'?: string }>

const all = (node: ReactNode, test: (el: El) => boolean): El[] => {
  if (Array.isArray(node)) return node.flatMap((child: ReactNode) => all(child, test))
  if (!isValidElement(node)) return []
  const el = node as El
  return [...(test(el) ? [el] : []), ...all(el.props.children, test)]
}

const Rail = all(
  react.render([], () => Shell({ children: null }) as ReactNode),
  (el) => typeof el.type === 'function' && el.type.name === 'Rail',
)[0].type as () => ReactNode

// The rail, mounted. A look renders it three times: its own listens answer, then the lookups
// those lead to, then it shows what they brought
const mount = () => {
  const slots: object[] = []
  const look = () => {
    const render = () => react.render(slots, Rail)
    render()
    render()
    const tree = render()
    return {
      chats: all(tree, (el) => el.props.to?.startsWith('/messages/') ?? false).map((el) => el.props.children),
      notify: all(tree, (el) => el.props.to === '/notifications')[0].props['aria-label'],
    }
  }
  return look
}

const uidOf = (prefix: string, n: number) => `${prefix}${String(n).padStart(2, '0')}`

const person = (uid: string, banned = false) => ({ penName: `Pen ${uid}`, avatarSeed: uid, pigment: 'sepia', pro: false, banned })

// A private thread with someone, its last note at `ms`
const thread = (uid: string, ms: number) => ({ [`alice_${uid}`]: { uids: ['alice', uid], lastMessageAt: { toMillis: () => ms } } })

const asking = (uid: string) => ({
  [`alice_${uid}`]: { uids: ['alice', uid], requester: uid, recipient: 'alice', status: 'pending' },
})

// Answers the listens open on `path`, or only the first few
const answerOpen = (path: string, few = Infinity) =>
  [...store.open]
    .filter(([, at]) => at === path)
    .slice(0, few)
    .forEach(([answer]) => answer())

beforeEach(() => {
  store.rows = {}
  store.hold = false
  store.open.clear()
})

describe('the rail’s people', () => {
  it('names every private conversation past the 30th, newest first', () => {
    // Uids sort in the order the threads were last written to, so the newest one sorts last
    const partners = Array.from({ length: 31 }, (_, n) => uidOf('p', n))
    store.rows.users = Object.fromEntries(partners.map((uid) => [uid, person(uid)]))
    store.rows.dms = Object.assign({}, ...partners.map((uid, n) => thread(uid, n + 1)))

    const { chats } = mount()()
    expect(chats).toEqual(partners.map((uid) => `Pen ${uid}`).reverse())
    expect(chats).not.toContain('Someone')
  })

  it('counts every request waiting from someone who can be seen, past the 30th', () => {
    const askers = Array.from({ length: 32 }, (_, n) => uidOf('q', n))
    // One of them has been banned since, so their request drops out of the count
    store.rows.users = Object.fromEntries(askers.map((uid) => [uid, person(uid, uid === 'q15')]))
    store.rows.connections = Object.assign({}, ...askers.map(asking))

    expect(mount()().notify).toBe('Notifications, 31 new')
  })

  it('keeps the names it shows while a new conversation’s person is looked up', () => {
    const partners = Array.from({ length: 31 }, (_, n) => uidOf('p', n + 1))
    store.rows.users = Object.fromEntries(['p00', ...partners].map((uid) => [uid, person(uid)]))
    store.rows.dms = Object.assign({}, ...partners.map((uid, n) => thread(uid, n + 1)))
    const look = mount()
    const named = partners.map((uid) => `Pen ${uid}`).reverse()
    expect(look().chats).toEqual(named)

    // Someone new writes; their uid sorts first, so every part of the lookup changes
    store.hold = true
    store.rows.dms = { ...store.rows.dms, ...thread('p00', 99) }
    answerOpen('dms')
    expect(look().chats).toEqual(['Someone', ...named])
    // One part's answer alone would leave the other part's people nameless
    answerOpen('users', 1)
    expect(look().chats).toEqual(['Someone', ...named])
    answerOpen('users')
    expect(look().chats).toEqual(['Pen p00', ...named])
  })
})
