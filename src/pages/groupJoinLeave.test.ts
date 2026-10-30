import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Group } from './Group'

// Join and Leave in a group's header are swapped for a note the moment they're pressed (joining's
// local write, or leaving), so focus moves first to where what they did is said. And opening
// another group from the rail keeps the same page mounted, so what's pending or said for one group
// must stay with it. A server render attaches no refs and can't press anything, so the page runs on
// a small stand-in for React's hooks, as statusFocus.test.ts does: states keep their slots between
// renders (the same page, kept mounted), and a ref on an element holds a stand-in node with its
// words as last put on the page
const react = vi.hoisted(() => {
  type Slot = { state?: unknown; ref?: { current: unknown } }
  let slots: Slot[] = []
  let at = 0
  const slot = () => (slots[at++] ??= {})
  return {
    // Focus taken and writes made, in order
    log: [] as string[],
    // Puts the page's state on the page now, as flushSync does
    commit: () => {},
    mount: () => {
      slots = []
    },
    begin: () => {
      at = 0
    },
    useState: (initial: unknown) => {
      const s = slot()
      if (!('state' in s)) s.state = typeof initial === 'function' ? (initial as () => unknown)() : initial
      const set = (next: unknown) => {
        s.state = typeof next === 'function' ? (next as (last: unknown) => unknown)(s.state) : next
      }
      return [s.state, set]
    },
    useRef: (initial: unknown) => (slot().ref ??= { current: initial }),
  }
})
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: react.useState,
  useRef: react.useRef,
}))
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  flushSync: <R>(fn: () => R) => {
    const out = fn()
    react.commit()
    return out
  },
}))

// The group open now: a case moves it, as a click on the rail does
const route = vi.hoisted(() => ({ groupId: 'g1' }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ groupId: route.groupId }),
  useSearchParams: () => [new URLSearchParams(), () => {}],
}))

// Alice's memberships as the page sees them. A write shows at once, pending, and waits for a case
// to answer it; a refused one is undone, as Firestore does. No Firebase in node
type Membership = { here: boolean; pending: boolean }
const server = vi.hoisted(() => {
  const server = {
    members: {} as Record<string, Membership>,
    held: new Map<string, (ok: boolean) => void>(),
    write: (call: string, groupId: string, joining: boolean) => {
      react.log.push(call)
      server.members[groupId] = { here: joining, pending: true }
      return new Promise<void>((resolve, reject) =>
        server.held.set(call, (ok) => {
          server.members[groupId] = { here: ok === joining, pending: false }
          if (ok) resolve()
          else reject('refused')
        }),
      )
    },
  }
  return server
})
vi.mock('../lib/social', () => ({
  joinGroup: (groupId: string) => server.write(`join ${groupId}`, groupId, true),
  leaveGroup: (groupId: string) => server.write(`leave ${groupId}`, groupId, false),
}))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: String }))
vi.mock('../lib/people', () => ({ useGroupPeople: () => [] }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'alice', claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('../lib/live', () => {
  const groups: Record<string, unknown> = {
    g1: { id: 'g1', name: 'Evenings', constellationId: 'c1', constellationName: 'Caring', memberCount: 2 },
    g2: { id: 'g2', name: 'Mornings', constellationId: 'c1', constellationName: 'Caring', memberCount: 3 },
  }
  return {
    useDocData: (path: string | null) => {
      const [, groupId, members] = path?.split('/') ?? []
      if (!members) return { data: groups[groupId] ?? null, loading: false, error: null, pending: false }
      const m = server.members[groupId] ?? { here: false, pending: false }
      return { data: m.here ? { id: 'alice', uid: 'alice' } : null, loading: false, error: null, pending: m.pending }
    },
    useQueryData: () => ({ data: [], loading: false, error: null }),
    useLiveContent: () => ({ data: [], loading: false, error: null }),
  }
})

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isElement = (node: unknown): node is El => !!node && typeof node === 'object' && 'props' in node

// Every element in the tree, in page order
const elements = (node: ReactNode): El[] => {
  if (Array.isArray(node)) return node.flatMap(elements)
  return isElement(node) ? [node, ...elements(node.props.children)] : []
}

const text = (node: ReactNode): string => {
  if (Array.isArray(node)) return node.map(text).join('')
  if (typeof node === 'string') return node
  return isElement(node) ? text(node.props.children) : ''
}

// What an element is called here: its role, or the words on a button
const nameOf = (el: El) => {
  const { role, children } = el.props
  return String(role ?? (typeof children === 'string' ? children : el.type))
}

// An element as it was last put on the page. Taking focus notes what it said then, and whether it
// was brought into view (a key) or the page left where it was (a click)
const node = (name: string, words: string) => ({
  tabIndex: 0,
  focus: (options?: FocusOptions) =>
    react.log.push(`focus ${name}, saying ${words ? `"${words}"` : 'nothing'}${options?.preventScroll ? '' : ', into view'}`),
  removeAttribute: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
})

// A render, put on the page: each ref holds its element with the words it has now
const render = () => {
  react.begin()
  const tree = Group()
  for (const el of elements(tree)) {
    const ref = el.props.ref as { current: unknown } | undefined
    if (ref) ref.current = node(nameOf(el), text(el.props.children))
  }
  return tree
}

// The page opened afresh; each read of it renders it again, still mounted
const open = () => {
  react.mount()
  react.commit = () => void render()
  render()
  return render
}

const find = (tree: ReactNode, name: string) => elements(tree).find((el) => nameOf(el) === name)

const tick = () => new Promise((done) => setTimeout(done))

// A press on whatever has this name now: a click, or a key (detail 0). What the handler set goes on
// the page once it returns. Leaving waits a moment before it writes
const press = async (page: () => ReactNode, name: string, detail = 1) => {
  const el = find(page(), name)
  expect(el, name).toBeDefined()
  const click = el!.props.onClick as (e: { detail: number }) => void
  click({ detail })
  page()
  await tick()
}

// The server takes (or refuses) a write it was holding
const answer = async (call: string, ok = true) => {
  const held = server.held.get(call)
  expect(held, call).toBeDefined()
  held!(ok)
  await tick()
}

const said = (tree: ReactNode) => text(find(tree, 'status'))

const member = { here: true, pending: false }

beforeEach(() => {
  react.log.length = 0
  server.members = {}
  server.held.clear()
  route.groupId = 'g1'
})

describe('Join and Leave in a group’s header', () => {
  it('Join takes focus to where it’s said before its button goes, then says the group was joined', async () => {
    const page = open()
    await press(page, 'Join this group', 0)
    expect(react.log).toEqual(['focus status, saying nothing, into view', 'join g1'])
    expect(find(page(), 'Join this group')).toBeUndefined()
    expect(text(page())).toContain('joining…')

    await answer('join g1')
    expect(said(page())).toBe('You joined Evenings.')
    expect(find(page(), 'Leave group')).toBeDefined()
  })

  it('Leave takes focus there only once it’s empty, before its button goes, then says the group was left', async () => {
    const page = open()
    await press(page, 'Join this group')
    await answer('join g1')
    expect(said(page())).toBe('You joined Evenings.')

    react.log.length = 0
    await press(page, 'Leave group')
    expect(react.log).toEqual(['focus status, saying nothing', 'leave g1'])
    expect(find(page(), 'Leave group')).toBeUndefined()
    expect(text(page())).toContain('leaving…')

    await answer('leave g1')
    expect(said(page())).toBe('You left Evenings.')
    expect(find(page(), 'Join this group')).toBeDefined()
  })

  it('says why a refused Join didn’t go through, and offers it again', async () => {
    const page = open()
    await press(page, 'Join this group', 0)
    await answer('join g1', false)
    expect(text(find(page(), 'alert'))).toBe('refused')
    expect(said(page())).toBe('')
    expect(find(page(), 'Join this group')).toBeDefined()
  })
})

// Leaving waits for the server, so offline it waits until the connection is back. Meanwhile the
// group has gone from the rail, and another opened from there keeps this page mounted
describe('another group opened while one is being left', () => {
  beforeEach(() => {
    server.members = { g1: member, g2: member }
  })

  it('shows as itself, with its talk, while the first still shows as being left', async () => {
    const page = open()
    await press(page, 'Leave group')
    route.groupId = 'g2'
    const tree = page()
    expect(find(tree, 'Leave group')).toBeDefined()
    expect(find(tree, 'tablist')).toBeDefined()
    expect(text(tree)).not.toContain('leaving…')
    expect(text(tree)).not.toContain('Join to read and write here')

    route.groupId = 'g1'
    expect(text(page())).toContain('leaving…')
  })

  it.each([
    ['goes through', true],
    ['is refused', false],
  ])('says nothing there of what the first one’s leave came to, when it %s', async (_, ok) => {
    const page = open()
    await press(page, 'Leave group')
    route.groupId = 'g2'
    page()
    await answer('leave g1', ok)
    const tree = page()
    expect(find(tree, 'alert')).toBeUndefined()
    expect(said(tree)).toBe('')
    expect(find(tree, 'Leave group')).toBeDefined()
  })

  // Firestore answers the first one's leave first, and both can land before the page renders again
  it.each([
    ['with', true],
    ['without', false],
  ])('says what was done there when both answers land, %s a render between', async (_, between) => {
    server.members = { g1: member }
    const page = open()
    await press(page, 'Leave group')
    route.groupId = 'g2'
    await press(page, 'Join this group')
    await answer('leave g1')
    if (between) page()
    await answer('join g2')
    expect(said(page())).toBe('You joined Mornings.')
  })

  // Back in the first group by the time both land: the other group's join can't put out what the
  // first one's leave came to here
  it.each([
    ['goes through', true, 'You left Evenings.'],
    ['is refused', false, ''],
  ])('keeps what the first one’s leave came to when it %s, once they’re back there', async (_, ok, words) => {
    server.members = { g1: member }
    const page = open()
    await press(page, 'Leave group')
    route.groupId = 'g2'
    await press(page, 'Join this group')
    route.groupId = 'g1'
    page()
    await answer('leave g1', ok)
    await answer('join g2')
    const tree = page()
    expect(said(tree)).toBe(words)
    expect(text(find(tree, 'alert'))).toBe(ok ? '' : 'refused')
  })
})

describe('what Join or Leave said, moving between groups', () => {
  it('a refusal in one group isn’t shown in another opened after it, nor brought back to the first', async () => {
    const page = open()
    await press(page, 'Join this group')
    await answer('join g1', false)
    expect(text(find(page(), 'alert'))).toBe('refused')

    route.groupId = 'g2'
    expect(find(page(), 'alert')).toBeUndefined()
    route.groupId = 'g1'
    expect(find(page(), 'alert')).toBeUndefined()
  })

  // Coming back to the words already there would have them read out again, as if just done
  it('what was said in one group isn’t said in another, nor again on coming back', async () => {
    const page = open()
    await press(page, 'Join this group')
    await answer('join g1')
    expect(said(page())).toBe('You joined Evenings.')

    route.groupId = 'g2'
    expect(said(page())).toBe('')
    route.groupId = 'g1'
    expect(said(page())).toBe('')
  })
})
