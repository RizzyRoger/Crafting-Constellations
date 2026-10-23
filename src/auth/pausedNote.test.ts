import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePausedNote } from './pausedNote'

// A stand-in for React's hooks, one slot list per page (as in live.test.ts): `render` runs the
// hook, `commit` runs the effects that render queued, as React does after it
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
      return [s.value as S, (next: S) => void (s.value = next)] as const
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
    page: (): Slot[] => [],
    render: <R>(page: Slot[], hook: () => R): R => {
      slots = page
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

// AuthProvider's flag: set when a pause signs someone out here, cleared when forgotten
const auth = vi.hoisted(() => {
  const state = { paused: false, forgetPause: () => void (state.paused = false) }
  return state
})

vi.mock('react', () => react)
vi.mock('./AuthProvider', () => ({ useAuth: () => auth }))

// One visit to sign-in: its first render, then its effects, then whatever it shows after
const visit = () => {
  const page = react.page()
  const first = react.render(page, usePausedNote)
  react.commit()
  return { first, after: react.render(page, usePausedNote) }
}

beforeEach(() => {
  auth.paused = false
})

describe('the paused note on sign-in', () => {
  it('is said on the page the pause sent them to, for as long as it stays open', () => {
    auth.paused = true
    expect(visit()).toEqual({ first: true, after: true })
  })

  it('is not said to the next person to open sign-in in this tab', () => {
    auth.paused = true
    visit()
    expect(visit()).toEqual({ first: false, after: false })
  })

  it('is never said when nobody was paused', () => {
    expect(visit()).toEqual({ first: false, after: false })
  })
})
