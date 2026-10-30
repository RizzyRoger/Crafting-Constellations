import { FirebaseError } from 'firebase/app'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Admin } from './Admin'

// Approve and Remove resolve their queue entry as they run, so the listen drops it and the focused
// button goes with it, usually before the call answers. A server render runs no effects, attaches
// no refs and never unmounts anything, so the page runs on a small stand-in for React: each
// component keeps its hooks between renders by where it sits (and its key), one that has gone runs
// its cleanups, effects run after a render when their deps change, and a ref on an element holds a
// stand-in node with its words as last put on the page, which notes taking focus
const react = vi.hoisted(() => {
  type Slot = { state?: unknown; ref?: { current: unknown }; deps?: unknown[]; effect?: () => unknown; cleanup?: unknown }
  let slots: Slot[] = []
  let at = 0
  const slot = () => (slots[at++] ??= {})
  return {
    // Focus taken and calls made, in order
    log: [] as string[],
    use: (hooks: Slot[]) => {
      slots = hooks
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
    useEffect: (effect: () => unknown, deps: unknown[]) => {
      const s = slot()
      if (!s.deps || deps.some((dep, i) => !Object.is(dep, s.deps![i]))) s.effect = effect
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
  useSearchParams: () => [new URLSearchParams(), () => {}],
}))

// Each decision waits on the server until a case answers it. No Firebase in node
const server = vi.hoisted(() => ({ answer: { resolve: (_: unknown) => {}, reject: (_: unknown) => {} } }))
const waiting = (call: string) =>
  new Promise((resolve, reject) => {
    react.log.push(call)
    server.answer = { resolve, reject }
  })
vi.mock('../lib/firebase', () => ({ db: {}, storage: {}, auth: {}, functions: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/callables')>()),
  approveContent: ({ queueId }: { queueId: string }) => waiting(`approve ${queueId}`),
  removeContent: ({ queueId }: { queueId: string }) => waiting(`remove ${queueId}`),
}))
const me = vi.hoisted(() => ({ refreshClaims: vi.fn(async () => undefined) }))
vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ uid: 'mod', refreshClaims: me.refreshClaims }) }))
const rows = vi.hoisted(() => ({ queue: [] as unknown[] }))
vi.mock('../lib/live', () => ({
  useQueryData: (key: string | null) => ({ data: key === 'admin-queue' ? rows.queue : [], loading: false, error: null }),
}))
vi.mock('../components/PageHead', () => ({ PageHead: () => null }))

type Props = Record<string, unknown> & { children?: ReactNode }
type El = { type: unknown; key: string | null; props: Props }

const isElement = (node: unknown): node is El => !!node && typeof node === 'object' && 'props' in node

// Every element in the tree, in page order
const elements = (node: unknown): El[] => {
  if (Array.isArray(node)) return node.flatMap(elements)
  return isElement(node) ? [node, ...elements(node.props.children)] : []
}

const text = (node: unknown): string => {
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

// Each component's hooks, by where it sits on the page
const mounted = new Map<string, NonNullable<Parameters<typeof react.use>[0]>>()

// What a render puts on the page, with each component run in its place
const expand = (tree: ReactNode, at: string, seen: Set<string>): unknown => {
  if (Array.isArray(tree)) return tree.map((child: ReactNode, i) => expand(child, `${at}[${isElement(child) ? (child.key ?? i) : i}]`, seen))
  if (!isElement(tree)) return tree
  const el = tree as El
  if (typeof el.type === 'function') {
    const where = `${at}/${el.type.name}`
    seen.add(where)
    if (!mounted.has(where)) mounted.set(where, [])
    react.use(mounted.get(where)!)
    return expand((el.type as (props: Props) => ReactNode)(el.props), where, seen)
  }
  return { type: el.type, key: el.key, props: { ...el.props, children: expand(el.props.children, `${at}/${String(el.type)}`, seen) } }
}

// A render, as React would commit it: refs hold their elements as they are now, components that
// have gone run their cleanups, then effects whose deps changed run
const attached = new Set<{ current: unknown }>()
const render = () => {
  const seen = new Set<string>()
  const tree = expand({ type: Admin, key: null, props: {} } as unknown as ReactNode, '', seen)
  attached.forEach((ref) => (ref.current = null))
  attached.clear()
  for (const el of elements(tree)) {
    const ref = el.props.ref as { current: unknown } | undefined
    if (!ref) continue
    ref.current = node(nameOf(el), text(el.props.children))
    attached.add(ref)
  }
  for (const [where, hooks] of mounted) {
    if (seen.has(where)) continue
    mounted.delete(where)
    hooks.forEach((s) => typeof s.cleanup === 'function' && s.cleanup())
  }
  for (const hooks of mounted.values()) {
    for (const s of hooks) {
      if (!s.effect) continue
      if (typeof s.cleanup === 'function') s.cleanup()
      s.cleanup = s.effect()
      s.effect = undefined
    }
  }
  return tree
}

const find = (tree: unknown, name: string) => elements(tree).find((el) => nameOf(el) === name)

// A click on whatever has this name now: what the handler set goes on the page as it returns
const press = (name: string) => {
  const el = find(render(), name)
  expect(el, name).toBeDefined()
  page.activeElement = el
  const settled = (el!.props.onClick as (e: unknown) => Promise<unknown>)({})
  render()
  return settled
}

const said = () => text(find(render(), 'status'))
const alerted = () => text(find(render(), 'alert'))

// Where focus is, as focusLost reads it
const page = { activeElement: null as unknown, body: { body: true } }

const entry = {
  id: 'm1',
  contentPath: 'dms/a_b/messages/m1',
  kind: 'dm',
  pairId: 'a_b',
  authorUid: 'a',
  authorPenName: 'Bramble',
  snapshot: { text: 'you are such a loser' },
  automod: { categories: ['harassment'], crisis: false, matches: [] },
  priority: 1,
  state: 'open',
  createdAt: null,
}

// The listen drops a resolved entry, and the focused button goes with it
const resolved = () => {
  rows.queue = []
  if (page.activeElement !== null && (page.activeElement as El).props) page.activeElement = page.body
  render()
}

beforeEach(() => {
  react.log.length = 0
  mounted.clear()
  me.refreshClaims.mockClear()
  rows.queue = [entry]
  page.activeElement = page.body
  vi.stubGlobal('document', page)
  render()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('review queue decisions', () => {
  it('takes focus to where Remove is said when the entry leaves before the call answers, then says it', async () => {
    const settled = press('Remove')
    resolved()
    expect(react.log).toEqual(['remove m1', 'focus status, saying nothing'])
    server.answer.resolve({ ok: true, outcome: 'removed' })
    await settled
    expect(said()).toBe('Private note · Bramble — Removed. They’ll find a note in Notifications.')
  })

  it('takes focus to where Approve was said when the call answers before the entry leaves', async () => {
    const settled = press('Approve')
    server.answer.resolve({ ok: true, outcome: 'published' })
    await settled
    render()
    resolved()
    expect(react.log).toEqual(['approve m1', 'focus status, saying "Private note · Bramble — Approved and delivered."'])
  })

  it('clears the last decision’s words as the next is pressed, so focus never lands on them', async () => {
    rows.queue = [entry, { ...entry, id: 'm2' }]
    render()
    const first = press('Remove')
    server.answer.resolve({ ok: true, outcome: 'gone' })
    await first
    rows.queue = [{ ...entry, id: 'm2' }]
    render()
    expect(said()).toBe('Private note · Bramble — This had already been taken down or deleted, so nothing changed.')

    react.log.length = 0
    const second = press('Approve')
    resolved()
    expect(react.log).toEqual(['approve m2', 'focus status, saying nothing'])
    server.answer.resolve({ ok: true, outcome: 'kept' })
    await second
    expect(said()).toBe('Private note · Bramble — Kept up.')
  })

  it('leaves focus alone when the moderator has moved on before the entry leaves', async () => {
    const settled = press('Remove')
    page.activeElement = { field: true }
    resolved()
    server.answer.resolve({ ok: true, outcome: 'removed' })
    await settled
    expect(react.log).toEqual(['remove m1'])
  })

  it('leaves focus alone when another moderator decided the entry', () => {
    resolved()
    expect(react.log).toEqual([])
  })

  it('keeps the entry, and focus on its button, when the call is refused', async () => {
    const settled = press('Remove')
    server.answer.reject(new FirebaseError('functions/permission-denied', 'Admins only.'))
    await settled
    expect(alerted()).toBe('You can’t do that here.')
    // Turned away without a reason: the role may have gone
    expect(me.refreshClaims).toHaveBeenCalledOnce()
    expect(said()).toBe('')
    // Decided later by someone else: not this moderator's doing
    resolved()
    expect(react.log).toEqual(['remove m1'])
  })

  // A moderator's own case is another moderator's to decide (notTheirOwn in functions/src/admin.ts)
  it('says plainly why their own case was refused, and doesn’t take it as the role gone', async () => {
    const settled = press('Approve')
    server.answer.reject(Object.assign(new FirebaseError('functions/permission-denied', 'Ask another moderator.'), { details: { problem: 'self' } }))
    await settled
    expect(alerted()).toBe('This is about you, so another moderator has to decide it.')
    expect(me.refreshClaims).not.toHaveBeenCalled()
  })
})
