import { createElement, type FunctionComponent, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Shell } from '../components/Shell'
import { PersonSheet } from '../constellation/PersonSheet'
import type { Connection, Profile } from '../lib/types'
import { Chat } from './Chat'
import { Me } from './Me'
import { Messages } from './Messages'
import { NewChat } from './NewChat'
import { Notifications } from './Notifications'
import { Professional } from './Professional'
import { Thread } from './Thread'

// Verify's Continue and Later go back to the page a link to it carries as `from` (afterVerify), or
// to the chart when there's none. A server render drops a link's state, so here a link shows it:
// every way to /verify has to say where it was opened. Alice hasn't confirmed her email, and Bob
// is asking to connect with her; no Firebase in node
vi.mock('react-router-dom', async (importOriginal) => {
  const router = await importOriginal<typeof import('react-router-dom')>()
  const react = await import('react')
  type Props = { to: string; state?: { from?: string }; className?: string; children?: ReactNode }
  return { ...router, Link: ({ to, state, className, children }: Props) => react.createElement('a', { href: to, className, 'data-from': state?.from }, children) }
})
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, storage: {}, functions: {}, LOCAL_BACKEND: false, USING_EMULATORS: false }))
vi.mock('../lib/callables', () => ({ describeError: String, problemOf: () => undefined }))
vi.mock('../lib/telemetry', () => ({ TELEMETRY_AVAILABLE: false, useCountVisits: () => null, setCountVisits: vi.fn() }))
vi.mock('../auth/useSignOut', () => ({ useSignOut: () => async () => undefined }))
vi.mock('../components/ProfileForm', () => ({ ProfileForm: () => null }))
vi.mock('../components/CheckIn', () => ({ CheckIn: () => null, useCheckInDraft: () => ({}) }))
vi.mock('../auth/AuthProvider', () => {
  const profile = { id: 'alice', penName: 'Alice', avatarSeed: 'alice', pigment: 'ochre', pro: false, banned: false }
  const claims = { admin: false, pro: false, banned: false, emailVerified: false }
  return {
    useMe: () => ({ uid: 'alice', profile, claims, user: { uid: 'alice', email: 'alice@example.com' } }),
    useAuth: () => ({ user: { uid: 'alice' }, profile, claims }),
  }
})
vi.mock('../lib/live', () => {
  const people = ['alice', 'bob'].map((id) => ({ id, penName: id, avatarSeed: id, pigment: 'sepia', pro: false, banned: false }))
  const asking = { id: 'alice_bob', uids: ['alice', 'bob'], requester: 'bob', recipient: 'alice', status: 'pending' }
  const rows = (key: string | null) => (key === 'connections|alice' ? [asking] : key === 'people' ? people : [])
  return {
    useQueryData: (key: string | null) => ({ data: rows(key), loading: false, error: null }),
    useDocData: () => ({ data: null, loading: false, error: null, pending: false }),
    useLiveContent: () => ({ data: [], loading: false, error: null, synced: true }),
  }
})

// Where each link to /verify on the page says to come back to, in page order
const comesBackTo = (page: string, route: string, element: ReactNode) => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [page] }, createElement(Routes, null, createElement(Route, { path: route, element }))))
  return [...html.matchAll(/<a href="\/verify"[^>]*>/g)].map(([tag]) => /data-from="([^"]*)"/.exec(tag)?.[1] ?? 'the chart')
}

const PAGES: [string, string, string, FunctionComponent, number][] = [
  ['a private-notes thread', '/messages/alice_bob', '/messages/:pairId', Thread, 1],
  ['a private chat', '/chats/c1', '/chats/:chatId', Chat, 1],
  ['Private notes', '/messages', '/messages', Messages, 1],
  ['a new private chat', '/chats/new', '/chats/new', NewChat, 1],
  ['Notifications, under a request to accept', '/notifications', '/notifications', Notifications, 1],
  ['the licence application', '/professional', '/professional', Professional, 1],
  ['You, under a request to accept and in Account', '/me', '/me', Me, 2],
]

const bob = { id: 'bob', penName: 'Bob', avatarSeed: 'bob', pigment: 'sepia', pro: false, banned: false } as Profile

const sheet = (connection?: Connection) =>
  createElement(PersonSheet, { person: bob, me: 'alice', verified: false, connection, groups: [], onClose: () => undefined })

describe('Confirm email links', () => {
  it.each(PAGES)('come back to %s', (_, page, route, Page, count) => {
    expect(comesBackTo(page, route, createElement(Page))).toEqual(Array(count).fill(page))
  })

  it('come back to the person whose sheet was open, to reach out', () => {
    expect(comesBackTo('/constellation?person=bob', '/constellation', sheet())).toEqual(['/constellation?person=bob'])
  })

  it('come back to the person whose sheet was open, to accept', () => {
    const asking = { id: 'alice_bob', uids: ['alice', 'bob'], requester: 'bob', recipient: 'alice', status: 'pending' } as Connection
    expect(comesBackTo('/constellation?person=bob', '/constellation', sheet(asking))).toEqual(['/constellation?person=bob'])
  })

  it('in the rail come back to whatever page is open', () => {
    const page = '/groups/g1?tab=posts'
    expect(comesBackTo(page, '/groups/:groupId', createElement(Shell, null, null))).toEqual([page, page])
  })
})
