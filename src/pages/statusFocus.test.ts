import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Connection } from '../lib/types'
import { Me } from './Me'
import { Notifications } from './Notifications'

// Notifications and You say what a button did in a status region, and move focus there before the
// button's row goes. React puts state set in a click on the page only once the handler returns (or
// at once, inside flushSync), so a status cleared just before focus moves can still hold the last
// answer's words when focus lands, and a screen reader reads those out for this one. A server render
// attaches no refs, so the pages run on a small stand-in for React's hooks: states keep their slots
// between renders, and a ref on an element holds a stand-in node with its words as last put on the page
const react = vi.hoisted(() => {
  type Slot = { state?: unknown; ref?: { current: unknown } }
  let slots: Slot[] = []
  let at = 0
  const slot = () => (slots[at++] ??= {})
  return {
    // Focus taken and writes made, in order
    log: [] as string[],
    // Puts the open page's state on the page now, as flushSync does
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
  acceptConnection: (id: string) => server.answer(`accept ${id}`),
  removeConnection: (id: string) => server.answer(`remove ${id}`),
  blockConnection: (id: string, by: string) => server.answer(`block ${id} by ${by}`),
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
  const people = ['alice', 'bob', 'carol', 'dave'].map((id) => ({ id, penName: id, avatarSeed: id, pigment: 'sepia', pro: false, banned: false }))
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

// What an element is called here: its role, or the words on a button
const nameOf = (el: El) => {
  const { role, children } = el.props
  return String(role ?? (typeof children === 'string' ? children : el.type))
}

// An element as it was last put on the page. Taking focus notes what it said then
const node = (name: string, words: string) => ({
  tabIndex: 0,
  focus: () => react.log.push(words ? `focus ${name}, saying "${words}"` : `focus ${name}, saying nothing`),
  removeAttribute: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
})

// A render, put on the page: each ref holds its element with the words it has now
const render = (component: () => ReactNode) => {
  react.begin()
  const tree = component()
  for (const el of elements(tree)) {
    const ref = el.props.ref as { current: unknown } | undefined
    if (ref) ref.current = node(nameOf(el), text(el.props.children))
  }
  return tree
}

// A page opened afresh; each read of it renders it again
const open = (component: () => ReactNode) => {
  react.mount()
  const page = () => render(component)
  react.commit = () => void page()
  page()
  return page
}

const find = (tree: ReactNode, name: string) => elements(tree).find((el) => nameOf(el) === name)

// A click on whatever has this name now. What the handler set goes on the page once it returns,
// and what it set once its write was through goes on after that
const press = async (page: () => ReactNode, name: string) => {
  const el = find(page(), name)
  expect(el, name).toBeDefined()
  const settled = (el!.props.onClick as (e: { detail: number }) => unknown)({ detail: 1 })
  page()
  await settled
  await new Promise((done) => setTimeout(done))
  page()
}

const said = (tree: ReactNode) => text(find(tree, 'status'))

beforeEach(() => {
  react.log.length = 0
  server.refuse = false
  rows.connections = []
  rows.unseen = []
})

describe('Notifications', () => {
  it.each([
    ['Not now', 'remove alice_carol', 'Request from carol set aside.'],
    ['Mark all read', 'mark all read', 'All marked read.'],
  ])('%s after an answer takes focus to where it’s said only once that’s empty', async (button, call, words) => {
    rows.connections = [tie('bob'), tie('carol')]
    rows.unseen = [{ id: 'n1', type: 'held', seen: false, createdAt: { toMillis: () => 1 } }]
    const page = open(Notifications)
    await press(page, 'Accept')
    expect(said(page())).toBe('Connected with bob. You can write privately now.')

    // Bob's row has gone, so carol's request is first now
    rows.connections = [tie('carol')]
    react.log.length = 0
    await press(page, button)
    expect(react.log).toEqual(['focus status, saying nothing', call])
    expect(said(page())).toBe(words)
  })
})

describe('You', () => {
  beforeEach(() => {
    rows.connections = [tie('bob'), tie('carol'), tie('dave', { status: 'accepted' })]
  })

  // Accepting bob moves him to her friends, ahead of dave
  it.each([
    ['Not now', 'remove alice_carol', 'Request from carol set aside.'],
    ['Disconnect', 'remove alice_bob', 'Disconnected from bob.'],
  ])('%s after a change takes focus to where it’s said only once that’s empty', async (button, call, words) => {
    const page = open(Me)
    await press(page, 'Accept')
    expect(said(page())).toBe('Connected with bob. You can write privately now.')

    rows.connections = [tie('bob', { status: 'accepted' }), tie('carol'), tie('dave', { status: 'accepted' })]
    react.log.length = 0
    await press(page, button)
    expect(react.log).toEqual(['focus status, saying nothing', call])
    expect(said(page())).toBe(words)
  })

  it('takes focus there only once it’s empty after a change that didn’t go through, too', async () => {
    server.refuse = true
    const page = open(Me)
    await press(page, 'Accept')
    expect(said(page())).toBe('That didn’t go through. Try again in a moment.')

    server.refuse = false
    react.log.length = 0
    await press(page, 'Accept')
    expect(react.log).toEqual(['focus status, saying nothing', 'accept alice_bob'])
    expect(said(page())).toBe('Connected with bob. You can write privately now.')
  })
})
