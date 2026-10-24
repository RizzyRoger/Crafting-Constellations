import { describe, expect, it, vi } from 'vitest'
import { useCurrentPath } from './currentPath'

// No DOM in node, so the hook runs on a stand-in for React: a ref keeps its slot between draws, an
// effect runs (after its last cleanup) when its deps change, and unmounting runs what's left
const react = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: unknown }
  let slots: Slot[] = []
  let at = 0
  const slot = () => (slots[at++] ??= {})
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((x, i) => Object.is(x, b[i]))
  return {
    useRef: <T>(initial: T) => {
      const s = slot()
      if (!('value' in s)) s.value = { current: initial }
      return s.value as { current: T }
    },
    useEffect: (run: () => void | (() => void), deps: unknown[]) => {
      const s = slot()
      if (same(s.deps, deps)) return
      s.deps = deps
      if (typeof s.cleanup === 'function') s.cleanup()
      s.cleanup = run()
    },
    draw: <T>(hook: () => T): T => {
      at = 0
      return hook()
    },
    unmount: () => {
      slots.forEach((s) => typeof s.cleanup === 'function' && s.cleanup())
      slots = []
    },
  }
})
const router = vi.hoisted(() => ({ location: { pathname: '/' } }))

vi.mock('react', () => react)
vi.mock('react-router-dom', () => ({ useLocation: () => router.location }))

describe('useCurrentPath', () => {
  it('reads the address the page is on now, not the one it was on when asked', () => {
    router.location = { pathname: '/chats/c1' }
    const currentPath = react.draw(useCurrentPath)
    expect(currentPath()).toBe('/chats/c1')
    // Another chat from the rail keeps the same page mounted
    router.location = { pathname: '/chats/c2' }
    react.draw(useCurrentPath)
    expect(currentPath()).toBe('/chats/c2')
    react.unmount()
  })

  it('reads nothing once the page has gone, so an await that outlasts it goes nowhere', () => {
    router.location = { pathname: '/chats/new' }
    const currentPath = react.draw(useCurrentPath)
    react.unmount()
    expect(currentPath()).toBeNull()
  })
})
