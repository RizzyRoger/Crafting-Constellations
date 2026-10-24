import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Me } from './Me'

// Each button in Your people moves its row to another list or drops it at once, so the next row's
// button slides up under the pointer, and the second click of a double-click lands on it. Alice has
// one person in each list; no Firebase in node
const social = vi.hoisted(() => ({ calls: [] as string[][] }))

vi.mock('../lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('../lib/telemetry', () => ({ TELEMETRY_AVAILABLE: false, useCountVisits: () => null, setCountVisits: vi.fn() }))
vi.mock('../auth/useSignOut', () => ({ useSignOut: () => async () => undefined }))
vi.mock('../components/ProfileForm', () => ({ ProfileForm: () => null }))
vi.mock('../components/CheckIn', () => ({ CheckIn: () => null }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({
    uid: 'alice',
    profile: { id: 'alice', penName: 'Alice', avatarSeed: 'alice', pigment: 'ochre', pro: false, banned: false },
    claims: { admin: false, pro: false, banned: false, emailVerified: true },
    user: { email: 'alice@example.com' },
  }),
}))
vi.mock('../lib/social', () => ({
  acceptConnection: async (id: string) => void social.calls.push(['accept', id]),
  removeConnection: async (id: string) => void social.calls.push(['remove', id]),
  blockConnection: async (id: string, by: string) => void social.calls.push(['block', id, by]),
}))
vi.mock('../lib/live', () => {
  const tie = (other: string, over: Record<string, unknown>) => ({ id: `alice_${other}`, uids: ['alice', other], requester: other, recipient: 'alice', ...over })
  const connections = [
    tie('bob', { status: 'pending' }),
    tie('carol', { status: 'pending', requester: 'alice', recipient: 'carol' }),
    tie('dave', { status: 'accepted' }),
    tie('erin', { status: 'blocked', blockedBy: 'alice' }),
  ]
  const people = ['alice', 'bob', 'carol', 'dave', 'erin'].map((id) => ({ id, penName: id, avatarSeed: id, pigment: 'sepia', pro: false, banned: false }))
  const rows = (key: string) => (key === 'connections|alice' ? connections : key === 'people' ? people : [])
  return { useQueryData: (key: string) => ({ data: rows(key), loading: false, error: null }) }
})

type Clickable = ReactElement<{ children?: ReactNode; onClick?: (e: { detail: number }) => unknown }>

// The first button with this label, in page order
const findButton = (node: ReactNode, label: string): Clickable | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => findButton(child, label)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === 'button' && node.props.children === label) return node as Clickable
  return findButton(node.props.children, label)
}

// The elements the page returns, read inside a render so its hooks run
const rendered = () => {
  let tree = null as ReactNode
  const Probe = () => {
    tree = Me()
    return null
  }
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Probe)))
  return tree
}

// 0 clicks in a row for a key, 1 for a single click, 2 for the second click of a double-click
const click = async (label: string, detail: number) => {
  const button = findButton(rendered(), label)
  expect(button).not.toBeNull()
  await button!.props.onClick!({ detail })
}

beforeEach(() => {
  social.calls = []
})

const BUTTONS: [string, string[]][] = [
  ['Accept', ['accept', 'alice_bob']],
  ['Not now', ['remove', 'alice_bob']],
  ['Cancel', ['remove', 'alice_carol']],
  ['Disconnect', ['remove', 'alice_dave']],
  ['Block', ['block', 'alice_dave', 'alice']],
  ['Unblock', ['remove', 'alice_erin']],
]

describe('Your people', () => {
  it.each(BUTTONS)('%s does nothing on the second click of a double-click', async (label) => {
    await click(label, 2)
    expect(social.calls).toEqual([])
  })

  it.each(BUTTONS)('%s still acts on a click or a key', async (label, call) => {
    await click(label, 1)
    await click(label, 0)
    expect(social.calls).toEqual([call, call])
  })
})
