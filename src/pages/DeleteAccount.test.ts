import { createElement, isValidElement, type ElementType, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DeleteAccount } from './DeleteAccount'

// Once the account is gone the front page goes up at once, before signOut starts, as signing out
// from anywhere does. Otherwise Auth's change can land first, and Gate sends them to sign in with
// this page to come back to, for whoever signs in next on this device
const seen = vi.hoisted(() => [] as unknown[][])

vi.mock('react-router-dom', () => ({
  useNavigate: () => (...args: unknown[]) => void seen.push(['navigate', ...args]),
  Link: () => null,
}))
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: () => ({}) },
  GoogleAuthProvider: class {},
  reauthenticateWithCredential: async () => void seen.push(['reauthenticate']),
  reauthenticateWithPopup: async () => void seen.push(['reauthenticate']),
  signOut: async () => void seen.push(['signOut']),
}))
vi.mock('../lib/firebase', () => ({ auth: {} }))
vi.mock('../lib/callables', () => ({
  deleteAccount: async () => void seen.push(['deleteAccount']),
  describeError: String,
  problemOf: () => null,
}))
vi.mock('../lib/telemetry', () => ({ track: () => {} }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { email: 'jo@example.com', providerData: [{ providerId: 'password' }] },
    profile: { penName: 'Jo' },
    claims: {},
  }),
}))

type El = ReactElement<{ children?: ReactNode; onSubmit?: (e: { preventDefault: () => void }) => Promise<void> }>

const find = (node: ReactNode, type: ElementType): El | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, type)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  return node.type === type ? (node as El) : find(node.props.children, type)
}

describe('DeleteAccount', () => {
  it('puts the front page up at once once the account is gone, before signing out', async () => {
    let tree = null as ReactNode
    const Probe = () => {
      tree = DeleteAccount()
      return null
    }
    renderToStaticMarkup(createElement(Probe))
    await find(tree, 'form')!.props.onSubmit!({ preventDefault: () => {} })
    expect(seen).toEqual([
      ['reauthenticate'],
      ['deleteAccount'],
      ['navigate', '/', { state: { left: true }, replace: true, flushSync: true }],
      ['signOut'],
    ])
  })
})
