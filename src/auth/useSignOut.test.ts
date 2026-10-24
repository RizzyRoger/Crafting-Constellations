import { describe, expect, it, vi } from 'vitest'
import { useSignOut } from './useSignOut'

// The router renders a navigation as a transition, which waits behind an update already queued
// (a snapshot for the open page). If Auth's change lands meanwhile, Gate is still on the page and
// sends them to sign in with this page to come back to, for whoever signs in next. So the front
// page goes up at once, before signOut starts
const seen = vi.hoisted(() => [] as unknown[][])

vi.mock('react-router-dom', () => ({
  useNavigate: () => (...args: unknown[]) => void seen.push(['navigate', ...args]),
}))
vi.mock('firebase/auth', () => ({ signOut: async () => void seen.push(['signOut']) }))
vi.mock('../lib/firebase', () => ({ auth: {} }))

describe('useSignOut', () => {
  it('puts the front page up at once, before signing out', async () => {
    await useSignOut()()
    expect(seen).toEqual([['navigate', '/', { replace: true, flushSync: true }], ['signOut']])
  })
})
