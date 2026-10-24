import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Content } from '../lib/types'
import { ConsentNote } from './ConsentNote'
import { Item } from './Item'
import { LikeButton } from './LikeButton'
import { Report } from './Report'

// Where focus goes when a press takes its own button away, or disables it, which drops focus out of
// the page too. A server render runs no effects and attaches no refs, so these run on a small
// stand-in for React's hooks: states keep their slots between renders, effects run after a render
// when their deps change, and a ref on an element holds a stand-in node that notes taking focus
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
    useId: () => 'r',
  }
})
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: react.useState,
  useRef: react.useRef,
  useEffect: react.useEffect,
  useId: react.useId,
}))

// No Firebase in node. A report waits on the server until a case answers it, and a like until a case lets it land
const server = vi.hoisted(() => ({ answer: { resolve: (_: unknown) => {}, reject: (_: unknown) => {} }, land: () => {} }))
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: String }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => ({}),
  addDoc: () =>
    new Promise((resolve, reject) => {
      server.answer = { resolve, reject }
    }),
  setDoc: (ref: { path: string }) => {
    react.log.push(`setDoc ${ref.path}`)
    return new Promise<void>((resolve) => {
      server.land = resolve
    })
  },
  deleteDoc: (ref: { path: string }) => {
    react.log.push(`deleteDoc ${ref.path}`)
    return new Promise(() => {})
  },
}))
vi.mock('../lib/live', () => ({ useDocData: () => ({ data: null, loading: false, error: null, pending: false }) }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/withdraw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/withdraw')>()),
  withdraw: async (path: string) => {
    react.log.push(`withdraw ${path}`)
    return null
  },
}))
const consent = vi.hoisted(() => ({ choice: null as 'yes' | 'no' | null }))
vi.mock('../lib/telemetry', () => ({
  TELEMETRY_AVAILABLE: true,
  useCountVisits: () => consent.choice,
  setCountVisits: async (yes: boolean) => {
    consent.choice = yes ? 'yes' : 'no'
  },
}))

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

// What an element is called here: its role or id, or the words on a button
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
  // What stays around it as it goes
  closest: () => node('around'),
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

const mount = (component: () => ReactNode) => {
  react.mount()
  attached.clear()
  return () => render(component)
}

const find = (tree: ReactNode, name: string) => elements(tree).find((el) => nameOf(el) === name)

// A click, or with detail 0 a key, on whatever has this name now
const press = (tree: ReactNode, name: string, detail = 1) => {
  const el = find(tree, name)
  expect(el, name).toBeDefined()
  return (el!.props.onClick as (e: { detail: number }) => unknown)({ detail })
}

beforeEach(() => {
  react.log.length = 0
  consent.choice = null
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Report', () => {
  const report = () => mount(() => Report({ contentPath: 'groups/g/messages/m1', me: 'u1' }))

  it('takes focus into the form it opens, to what’s wrong', () => {
    const tree = report()
    press(tree(), 'Report')
    tree()
    expect(react.log).toEqual(['focus r-reason'])
  })

  it('brings focus back to Report when the form is cancelled', () => {
    const tree = report()
    press(tree(), 'Report')
    press(tree(), 'Cancel')
    tree()
    expect(react.log).toEqual(['focus r-reason', 'focus Report'])
  })

  it('brings focus to the thanks once the report is sent, in place of the form', async () => {
    const tree = report()
    press(tree(), 'Report')
    const sending = press(tree(), 'Send report')
    tree()
    server.answer.resolve({ id: 'r1' })
    await sending
    const sent = tree()
    expect(find(sent, 'Send report')).toBeUndefined()
    expect(react.log).toEqual(['focus r-reason', 'focus status'])
  })

  it('brings focus back to Send when the report is refused, since sending disabled it', async () => {
    const tree = report()
    press(tree(), 'Report')
    const sending = press(tree(), 'Send report')
    tree()
    server.answer.reject('refused')
    await sending
    expect(text(find(tree(), 'alert'))).toBe('refused')
    expect(react.log).toEqual(['focus r-reason', 'focus Send report'])
  })
})

describe('Withdraw', () => {
  const mine = { id: 'm1', path: 'dms/a_b/messages/m1', authorUid: 'me', status: 'pending', createdAt: null } as unknown as Content

  it('moves focus to what stays around the writing before it goes, without scrolling there', async () => {
    const tree = mount(() => Item({ item: mine, me: 'me', variant: 'bubble', children: null }))
    await press(tree(), 'Withdraw')
    expect(react.log).toEqual(['focus around, where it is', 'withdraw dms/a_b/messages/m1'])
  })
})

describe('Like', () => {
  const like = () => mount(() => LikeButton({ postPath: 'groups/g/posts/p', me: 'u1' }))

  it('stays pressable while its write is on its way: disabled, it would drop focus', () => {
    const tree = like()
    press(tree(), 'Like')
    expect(find(tree(), 'Like')!.props.disabled).toBeFalsy()
  })

  // Offline it waits until the device is back, and a second press does nothing till then
  it('says it’s waiting while its write is on its way, and stops once it lands', async () => {
    const tree = like()
    expect(find(tree(), 'Like')!.props['aria-disabled']).toBeFalsy()
    press(tree(), 'Like')
    expect(find(tree(), 'Like')!.props['aria-disabled']).toBe(true)
    server.land()
    await vi.waitFor(() => expect(find(tree(), 'Like')!.props['aria-disabled']).toBeFalsy())
  })

  it('does nothing at a second press while the first is on its way', () => {
    const tree = like()
    press(tree(), 'Like')
    press(tree(), 'Like')
    expect(react.log).toEqual(['setDoc groups/g/posts/p/likes/u1'])
  })
})

describe('The consent note', () => {
  // The page around the note: the shell's main, a page's heading, or both
  const page = (...there: string[]) => ({
    getElementById: (id: string) => (there.includes(id) ? node(id) : null),
    querySelector: (selector: string) => (there.includes(selector) ? node(selector) : null),
  })

  it.each([
    ['Count my visits', 'Saved. Visits on this device are counted.'],
    ['No, thank you', 'Saved. Nothing is counted.'],
  ])('brings focus to the page when “%s” takes the note away, and says so', (button, said) => {
    vi.stubGlobal('document', page('main', 'h1'))
    const tree = mount(() => ConsentNote())
    // Mounted with the note, so the answer is heard once the note has gone
    expect(text(find(tree(), 'status'))).toBe('')
    press(tree(), button)
    const after = tree()
    expect(find(after, 'consent-title')).toBeUndefined()
    expect(react.log).toEqual(['focus main, where it is'])
    expect(text(find(after, 'status'))).toBe(said)
  })

  // The landing page's heading is a long way above a note answered further down
  it('brings focus to the page’s heading where there’s no shell, as on the landing page, without scrolling there', () => {
    vi.stubGlobal('document', page('h1'))
    const tree = mount(() => ConsentNote())
    press(tree(), 'No, thank you')
    expect(react.log).toEqual(['focus h1, where it is'])
  })

  // Hidden and absolute, it sits where it falls: under the full-height shell, a pixel past the window
  it('keeps the region at the top of the page, where it adds nothing to the page’s height', () => {
    vi.stubGlobal('document', page('main'))
    const tree = mount(() => ConsentNote())
    expect(find(tree(), 'status')!.props.style).toEqual({ top: 0 })
    press(tree(), 'Count my visits')
    expect(find(tree(), 'status')!.props.style).toEqual({ top: 0 })
  })
})
