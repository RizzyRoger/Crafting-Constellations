import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post, Status } from '../lib/types'
import { CheckIn, type CheckInDraft } from './CheckIn'

// Where focus goes when a check-in is sent. A server render runs no effects, so CheckIn runs on a
// small stand-in for React's hooks: states keep their slots between renders, effects run after a
// render when their deps change, and an empty ref already holds its node, as it does by then
const hooks = vi.hoisted(() => {
  type Slot = { state?: unknown; set?: (next: unknown) => void; ref?: { current: unknown }; deps?: unknown[] }
  let slots: Slot[] = []
  let at = 0
  let effects: (() => void)[] = []
  const focused: string[] = []
  const slot = () => (slots[at++] ??= {})
  return {
    focused,
    rows: [] as unknown[],
    mount: () => {
      slots = []
      focused.length = 0
    },
    render: <T>(component: () => T): T => {
      at = 0
      effects = []
      const out = component()
      effects.forEach((effect) => effect())
      return out
    },
    useState: (initial: unknown) => {
      const s = slot()
      if (!s.set) {
        s.state = typeof initial === 'function' ? (initial as () => unknown)() : initial
        s.set = (next) => {
          s.state = typeof next === 'function' ? (next as (last: unknown) => unknown)(s.state) : next
        }
      }
      return [s.state, s.set]
    },
    useRef: (initial: unknown) => {
      const s = slot()
      s.ref ??= { current: initial ?? { focus: () => focused.push('heading') } }
      return s.ref
    },
    useEffect: (effect: () => void, deps: unknown[]) => {
      const s = slot()
      if (!s.deps || deps.some((dep, i) => !Object.is(dep, s.deps![i]))) effects.push(effect)
      s.deps = deps
    },
  }
})
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useEffect: hooks.useEffect,
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useMatch: () => null,
}))
// No Firebase in node. The send waits on the server, as it does while the write is on its way
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: (e: unknown) => String(e) }))
vi.mock('./ConfirmEmail', () => ({ ConfirmEmail: () => null }))
vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ uid: 'alice', claims: { emailVerified: true } }) }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: () => ({ id: 'p1' }),
  setDoc: () => new Promise(() => {}),
  serverTimestamp: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  query: () => ({}),
}))
vi.mock('../lib/live', () => ({
  useDocData: () => ({ data: { uid: 'alice' }, loading: false, error: null, pending: false }),
  useQueryData: () => ({ data: hooks.rows, loading: false, error: null }),
}))

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const find = (node: ReactNode, is: (el: El) => boolean): El | null => {
  if (Array.isArray(node)) return node.reduce<El | null>((hit, n) => hit ?? find(n, is), null)
  if (!node || typeof node !== 'object' || !('props' in node)) return null
  const el = node as El
  return is(el) ? el : find(el.props.children, is)
}

// The words written straight into the box, leaving out what its parts (the status, the links) say
const text = (node: ReactNode): string => {
  if (Array.isArray(node)) return node.map(text).join('')
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object' || !('props' in node)) return ''
  return text((node as El).props.children)
}

const post = (id: string, status: Status) =>
  ({ id, path: `groups/daily-check-in/posts/${id}`, authorUid: 'alice', status, body: 'words', createdAt: { toDate: () => new Date() } }) as unknown as Post

const box = (draft?: CheckInDraft) => {
  hooks.mount()
  return () => hooks.render(() => CheckIn({ prompt: true, onLater: () => {}, draft }) as El | null)
}

beforeEach(() => {
  hooks.rows = []
})

describe('CheckIn focus', () => {
  it('brings focus to its heading when its own send takes the form away', () => {
    const tree = box()
    // Each event lands on the latest render
    const on = (is: (el: El) => boolean, name: string, event: unknown) => (find(tree(), is)!.props[name] as (e: unknown) => void)(event)
    for (const id of ['feeling', 'mind', 'steps']) on((el) => el.props.id === `checkin-${id}`, 'onChange', { target: { value: 'words' } })
    on((el) => el.type === 'form', 'onSubmit', { preventDefault: () => {} })
    // The write shows at once, before the server has it
    hooks.rows = [post('p1', 'pending')]
    expect(text(tree())).toContain('Sent to Daily check-in.')
    expect(hooks.focused).toEqual(['heading'])
  })

  it('leaves focus where it is when the shell brings it back with a check-in it sent before', () => {
    hooks.rows = [post('p1', 'pending')]
    const tree = box({ answers: { feeling: '', mind: '', steps: '' }, setAnswers: () => {}, sent: 'p1', setSent: () => {} })
    expect(text(tree())).toContain('Sent to Daily check-in.')
    tree()
    expect(hooks.focused).toEqual([])
  })
})
