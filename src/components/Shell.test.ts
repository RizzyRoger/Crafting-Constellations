import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckIn, type CheckInDraft } from './CheckIn'
import { Shell } from './Shell'

// The shell stays while pages come and go under it. A server render can't move between pages, so
// Shell runs on a small stand-in for React's hooks: each state keeps its slot from one render to
// the next, as it does while the shell stays mounted. The rail and the pages aren't rendered
const hooks = vi.hoisted(() => {
  type Slot = { state?: unknown; set?: (next: unknown) => void; ref?: { current: unknown } }
  let slots: Slot[] = []
  let at = 0
  const slot = () => (slots[at++] ??= {})
  return {
    path: '/constellation',
    mount: () => {
      slots = []
    },
    render: <T>(component: () => T): T => {
      at = 0
      return component()
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
      s.ref ??= { current: initial }
      return s.ref
    },
  }
})
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useLocation: () => ({ pathname: hooks.path }),
}))
// No Firebase in node
vi.mock('../lib/firebase', () => ({ auth: {}, db: {}, functions: {}, LOCAL_BACKEND: false, USING_EMULATORS: false, APP_CHECK_ON: false }))

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const find = (node: ReactNode, type: unknown): El | null => {
  if (Array.isArray(node)) return node.reduce<El | null>((hit, n) => hit ?? find(n, type), null)
  if (!node || typeof node !== 'object' || !('props' in node)) return null
  const el = node as El
  return el.type === type ? el : find(el.props.children, type)
}

type Prompt = { draft: CheckInDraft; onLater: () => void }

// One shell, on one page and then the next
const open = (path: string) => {
  hooks.path = path
  hooks.mount()
  const tree = () => hooks.render(() => Shell({ children: null }) as El)
  return {
    go: (to: string) => {
      hooks.path = to
      tree()
    },
    main: () => find(tree(), 'main')!.props as { tabIndex?: number; ref: { current: unknown } },
    prompt: () => (find(tree(), CheckIn)?.props ?? null) as Prompt | null,
  }
}

// Just enough of the page element to take focus
const page = () => {
  const seen = { tabindex: false, focused: false, listening: 0 }
  const el = {
    set tabIndex(_: number) {
      seen.tabindex = true
    },
    removeAttribute: () => {
      seen.tabindex = false
    },
    focus: () => {
      seen.focused = seen.tabindex
    },
    addEventListener: () => seen.listening++,
    removeEventListener: () => seen.listening--,
  }
  return { el, seen }
}

beforeEach(() => {
  hooks.path = '/constellation'
})

describe('Shell', () => {
  it('keeps what was typed in the prompt while a page that fills the shell leaves it out', () => {
    const shell = open('/constellation')
    shell.prompt()!.draft.setAnswers((prev) => ({ ...prev, feeling: 'Tired' }))
    shell.go('/groups/g')
    expect(shell.prompt()).toBeNull()
    shell.go('/constellation')
    expect(shell.prompt()!.draft.answers).toEqual({ feeling: 'Tired', mind: '', steps: '' })
  })

  it('keeps the check-in the prompt sent, so what became of it comes back with it', () => {
    const shell = open('/constellation')
    shell.prompt()!.draft.setSent('p1')
    shell.go('/messages/a_b')
    expect(shell.prompt()).toBeNull()
    shell.go('/notifications')
    expect(shell.prompt()!.draft.sent).toBe('p1')
  })

  it('doesn’t leave the page focusable, so a click on its text keeps Tab where the click was', () => {
    expect(open('/constellation').main().tabIndex).toBeUndefined()
  })

  it('takes focus to the page, for that move only, when the prompt is set aside', () => {
    const shell = open('/constellation')
    const { el, seen } = page()
    shell.main().ref.current = el
    shell.prompt()!.onLater()
    expect(seen).toEqual({ tabindex: true, focused: true, listening: 2 })
    expect(shell.prompt()).toBeNull()
  })
})
