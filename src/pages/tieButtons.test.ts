import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonSheet } from '../constellation/PersonSheet'
import type { Connection, Profile } from '../lib/types'
import { Me } from './Me'
import { Notifications } from './Notifications'

// The buttons that change where two people stand, on Notifications, on You and in the person sheet.
// Each change swaps or drops the button pressed at once, so focus has to move before it goes, and
// what changed has to be said. A server render runs no effects and attaches no refs, so the pages
// run on a small stand-in for React's hooks: states keep their slots between renders, effects run
// after a render when their deps change, and a ref on an element holds a stand-in node that notes
// taking focus
const react = vi.hoisted(() => {
  type Slot = { state?: unknown; ref?: { current: unknown }; deps?: unknown[] }
  let slots: Slot[] = []
  let at = 0
  let effects: (() => void)[] = []
  const slot = () => (slots[at++] ??= {})
  return {
    // Focus taken and writes made, in order
    log: [] as string[],
    mount: () => {
      slots = []
    },
    begin: () => {
      at = 0
      effects = []
    },
    runEffects: () => effects.forEach((effect) => effect()),
    useState: (initial: unknown) => {
      const s = slot()
      if (!('state' in s)) s.state = typeof initial === 'function' ? (initial as () => unknown)() : initial
      const set = (next: unknown) => {
        s.state = typeof next === 'function' ? (next as (last: unknown) => unknown)(s.state) : next
      }
      return [s.state, set]
    },
    useRef: (initial: unknown) => (slot().ref ??= { current: initial }),
    useEffect: (effect: () => void, deps: unknown[]) => {
      const s = slot()
      if (!s.deps || deps.some((dep, i) => !Object.is(dep, s.deps![i]))) effects.push(effect)
      s.deps = deps
    },
  }
})
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: react.useState,
  useRef: react.useRef,
  useEffect: react.useEffect,
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useLocation: () => ({ key: 'k', pathname: '/', search: '', hash: '', state: null }),
}))

// Each write is taken at once, or refused when a case says so. No Firebase in node
const server = vi.hoisted(() => {
  const server = {
    refuse: false,
    answer: (call: string) => {
      react.log.push(call)
      return server.refuse ? Promise.reject('refused') : Promise.resolve()
    },
  }
  return server
})
vi.mock('../lib/social', () => ({
  requestConnection: (me: string, other: string) => server.answer(`request ${me} ${other}`),
  acceptConnection: (id: string) => server.answer(`accept ${id}`),
  removeConnection: (id: string) => server.answer(`remove ${id}`),
  blockConnection: (id: string, by: string) => server.answer(`block ${id} by ${by}`),
  blockPerson: (me: string, other: string) => server.answer(`block ${other} by ${me}`),
}))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, path: string) => ({ path }),
  writeBatch: () => ({ update: () => {}, commit: () => server.answer('mark all read') }),
}))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('../lib/callables', () => ({ describeError: String }))
vi.mock('../lib/telemetry', () => ({ TELEMETRY_AVAILABLE: false, useCountVisits: () => null, setCountVisits: vi.fn() }))
vi.mock('../auth/useSignOut', () => ({ useSignOut: () => async () => undefined }))
vi.mock('../components/ProfileForm', () => ({ ProfileForm: () => null }))
vi.mock('../components/CheckIn', () => ({ CheckIn: () => null }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({
    uid: 'alice',
    profile: { id: 'alice', penName: 'alice', avatarSeed: 'alice', pigment: 'ochre', pro: false, banned: false },
    claims: { admin: false, pro: false, banned: false, emailVerified: true },
    user: { email: 'alice@example.com' },
  }),
}))

// Alice's ties and notices, as each page asks for them
const rows = vi.hoisted(() => ({ connections: [] as unknown[], unseen: [] as unknown[] }))
vi.mock('../lib/live', () => {
  const people = ['alice', 'bob', 'carol', 'dave', 'erin'].map((id) => ({ id, penName: id, avatarSeed: id, pigment: 'sepia', pro: false, banned: false }))
  const asked = (key: string | null) =>
    key === 'connections|alice' ? rows.connections : key === 'people' ? people : key === 'unseen-notices|alice' ? rows.unseen : []
  return {
    useQueryData: (key: string | null) => ({ data: asked(key), loading: false, error: null }),
    useDocData: () => ({ data: null, loading: false, error: null, pending: false }),
  }
})

const tie = (other: string, over: Partial<Connection> = {}) =>
  ({ id: `alice_${other}`, uids: ['alice', other], requester: other, recipient: 'alice', status: 'pending', ...over }) as Connection

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

// What an element is called here: its label, role or id, or the words on a button
const nameOf = (el: El) => {
  const { role, id, children, className } = el.props
  return String(el.props['aria-label'] ?? role ?? id ?? (typeof children === 'string' ? children : (className ?? el.type)))
}

const node = (name: string) => ({
  tabIndex: 0,
  focus: (options?: FocusOptions) => react.log.push(options?.preventScroll ? `focus ${name}, where it is` : `focus ${name}`),
  removeAttribute: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollIntoView: () => {},
})

// A render, as React would commit it: refs whose element has gone are emptied, the rest hold theirs,
// and then the effects run
const attached = new Set<{ current: unknown }>()
const render = (component: () => ReactNode) => {
  react.begin()
  const tree = component()
  attached.forEach((ref) => (ref.current = null))
  attached.clear()
  for (const el of elements(tree)) {
    const ref = el.props.ref as { current: unknown } | undefined
    if (!ref) continue
    ref.current = node(nameOf(el))
    attached.add(ref)
  }
  react.runEffects()
  return tree
}

// A page opened afresh. Whatever its opening did (the sheet takes focus as it comes up) is left out
const open = (component: () => ReactNode) => {
  react.mount()
  attached.clear()
  const tree = () => render(component)
  tree()
  react.log.length = 0
  return tree
}

const find = (tree: ReactNode, name: string) => elements(tree).find((el) => nameOf(el) === name)

// A click, or with detail 0 a key, on whatever has this name now; then what it waits on settles
const press = async (tree: ReactNode, name: string, detail = 1) => {
  const el = find(tree, name)
  expect(el, name).toBeDefined()
  await (el!.props.onClick as (e: { detail: number }) => unknown)({ detail })
  await new Promise((settled) => setTimeout(settled))
}

const said = (tree: ReactNode) => text(find(tree, 'status'))

beforeEach(() => {
  react.log.length = 0
  server.refuse = false
  rows.connections = []
  rows.unseen = []
  // The sheet notes what chose the person, and brings itself into view, as it comes up
  vi.stubGlobal('document', { activeElement: null, body: {} })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('SVGElement', class {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Notifications', () => {
  beforeEach(() => {
    rows.connections = [tie('bob'), tie('carol')]
  })

  it('says nothing until an answer is through, in a region there from the start', () => {
    const tree = open(Notifications)
    expect(find(tree(), 'status')).toBeDefined()
    expect(said(tree())).toBe('')
  })

  it.each([
    ['Accept', 'accept alice_bob', 'Connected with bob. You can write privately now.'],
    ['Not now', 'remove alice_bob', 'Request from bob set aside.'],
  ])('%s moves focus to where the answer is said before its row goes, and says it', async (button, call, words) => {
    const tree = open(Notifications)
    await press(tree(), button)
    expect(react.log).toEqual(['focus status, where it is', call])
    expect(said(tree())).toBe(words)
  })

  // A click leaves the page where it is; from a key, focus is brought into view
  it('brings where it’s said into view when the answer came from a key', async () => {
    const tree = open(Notifications)
    await press(tree(), 'Accept', 0)
    expect(react.log).toEqual(['focus status', 'accept alice_bob'])
  })

  it('Mark all read moves focus there too, before it goes with the last unseen notice', async () => {
    rows.unseen = [{ id: 'n1', type: 'held', seen: false, createdAt: { toMillis: () => 1 } }]
    const tree = open(Notifications)
    await press(tree(), 'Mark all read')
    expect(react.log).toEqual(['focus status, where it is', 'mark all read'])
    expect(said(tree())).toBe('All marked read.')
  })

  it('says nothing went through when the answer is refused, and shows why', async () => {
    server.refuse = true
    const tree = open(Notifications)
    await press(tree(), 'Accept')
    const after = tree()
    expect(said(after)).toBe('')
    expect(text(find(after, 'alert'))).toBe('refused')
  })
})

describe('You', () => {
  beforeEach(() => {
    rows.connections = [
      tie('bob'),
      tie('carol', { requester: 'alice', recipient: 'carol' }),
      tie('dave', { status: 'accepted' }),
      tie('erin', { status: 'blocked', blockedBy: 'alice' }),
    ]
  })

  it.each([
    ['Accept', 'accept alice_bob', 'Connected with bob. You can write privately now.'],
    ['Not now', 'remove alice_bob', 'Request from bob set aside.'],
    ['Cancel', 'remove alice_carol', 'Request to carol cancelled.'],
    ['Disconnect', 'remove alice_dave', 'Disconnected from dave.'],
    ['Block', 'block alice_dave by alice', 'You blocked dave.'],
    ['Unblock', 'remove alice_erin', 'Unblocked erin.'],
  ])('%s moves focus to where the change is said before its row goes, and says it', async (button, call, words) => {
    const tree = open(Me)
    await press(tree(), button)
    expect(react.log).toEqual(['focus status, where it is', call])
    expect(said(tree())).toBe(words)
  })

  // A click on a row far down a long list leaves it there; from a key, focus is brought into view
  it('brings where it’s said into view when the change came from a key', async () => {
    const tree = open(Me)
    await press(tree(), 'Disconnect', 0)
    expect(react.log).toEqual(['focus status', 'remove alice_dave'])
  })

  // Outside Your people: the last row going takes the whole section with it
  it('keeps where it says so when the last of Your people goes', async () => {
    rows.connections = [tie('bob')]
    const tree = open(Me)
    await press(tree(), 'Not now')
    rows.connections = []
    const after = tree()
    expect(find(after, 'people')).toBeUndefined()
    expect(said(after)).toBe('Request from bob set aside.')
  })

  it('says when a change didn’t go through', async () => {
    server.refuse = true
    const tree = open(Me)
    await press(tree(), 'Block')
    expect(said(tree())).toBe('That didn’t go through. Try again in a moment.')
  })
})

describe('The person sheet', () => {
  const bob = { id: 'bob', penName: 'bob', avatarSeed: 'bob', pigment: 'sepia', pro: false, banned: false } as Profile
  const sheet = (connection?: Connection) => () =>
    PersonSheet({ person: bob, me: 'alice', verified: true, connection, groups: [], onClose: () => {} })

  const CHANGES: [string, Connection | undefined, string, string][] = [
    ['Reach out', undefined, 'request alice bob', 'Request sent to bob.'],
    ['Cancel', tie('bob', { requester: 'alice', recipient: 'bob' }), 'remove alice_bob', 'Request to bob cancelled.'],
    ['Accept', tie('bob'), 'accept alice_bob', 'Connected with bob. You can write privately now.'],
    ['Not now', tie('bob'), 'remove alice_bob', 'Request from bob set aside.'],
    ['Disconnect', tie('bob', { status: 'accepted' }), 'remove alice_bob', 'Disconnected from bob.'],
    ['Block', undefined, 'block bob by alice', 'You blocked bob.'],
    ['Block', tie('bob'), 'block alice_bob by alice', 'You blocked bob.'],
    ['Unblock', tie('bob', { status: 'blocked', blockedBy: 'alice' }), 'remove alice_bob', 'Unblocked bob.'],
  ]

  it.each(CHANGES)('%s keeps focus in the sheet as it goes, and says what changed', async (button, connection, call, words) => {
    const tree = open(sheet(connection))
    expect(said(tree())).toBe('')
    await press(tree(), button)
    expect(react.log).toEqual(['focus About bob, where it is', call])
    expect(said(tree())).toBe(words)
  })

  // Each change swaps the row's buttons at once: Block or Reach out slides under the second click
  it.each(CHANGES)('%s does nothing on the second click of a double-click', async (button, connection) => {
    const tree = open(sheet(connection))
    await press(tree(), button, 2)
    expect(react.log).toEqual([])
  })

  it.each(CHANGES)('%s still acts on a click or a key', async (button, connection, call) => {
    const tree = open(sheet(connection))
    await press(tree(), button, 1)
    await press(tree(), button, 0)
    expect(react.log.filter((line) => !line.startsWith('focus'))).toEqual([call, call])
  })

  it('says nothing went through when a change is refused, and shows why', async () => {
    server.refuse = true
    const tree = open(sheet())
    await press(tree(), 'Block')
    const after = tree()
    expect(said(after)).toBe('')
    expect(text(find(after, 'alert'))).toBe('refused')
  })
})
