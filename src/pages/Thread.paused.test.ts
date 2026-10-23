import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Thread } from './Thread'

// A ban keeps the person's connection (an unban brings it back), but they can never read a
// note meanwhile, so the thread mustn't offer to write to them, and says why. Opened from an
// address or an older notice; no Firebase in node
const state = vi.hoisted(() => ({
  banned: false,
  status: 'accepted' as string | null,
  notes: [] as Record<string, unknown>[],
}))
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ profile: null }),
  useMe: () => ({ uid: 'a', claims: { emailVerified: true } }),
}))
vi.mock('../lib/live', () => ({
  useDocData: () => ({
    data: { id: 'b', penName: 'Bea', avatarSeed: 'b', pigment: 'ochre', pro: false, banned: state.banned },
    loading: false,
    error: null,
    pending: false,
  }),
  useQueryData: () => ({
    data: state.status ? [{ id: 'a_b', uids: ['a', 'b'], requester: 'a', recipient: 'b', status: state.status, blockedBy: 'a' }] : [],
    loading: false,
    error: null,
  }),
  useLiveContent: () => ({ data: state.notes, loading: false, error: null, synced: true }),
}))

const render = () =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/messages/a_b'] },
      createElement(Routes, null, createElement(Route, { path: '/messages/:pairId', element: createElement(Thread) })),
    ),
  )

const PAUSED = 'This conversation is closed while their account is paused.'

beforeEach(() => {
  state.banned = false
  state.status = 'accepted'
  state.notes = []
})

describe('Thread with someone whose account is paused', () => {
  it('offers the composer and a first note to someone connected and not paused', () => {
    const html = render()
    expect(html).toContain('<textarea')
    expect(html).toContain('Write the first note to Bea.')
    expect(html).not.toContain(PAUSED)
  })

  it('offers neither the composer nor a first note, and says why', () => {
    state.banned = true
    const html = render()
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Write the first note to Bea.')
    expect(html).toContain('Nothing written yet.')
    expect(html).toContain(PAUSED)
  })

  it('still shows the notes already written', () => {
    state.banned = true
    state.notes = [{ id: 'm1', path: 'dms/a_b/messages/m1', authorUid: 'b', status: 'published', createdAt: null, text: 'an old note from last week' }]
    const html = render()
    expect(html).toContain('an old note from last week')
    expect(html).not.toContain('<textarea')
    expect(html).toContain(PAUSED)
  })

  it('does not send them to the constellation to reach out, where they can’t be found', () => {
    state.banned = true
    for (const status of ['pending', null]) {
      state.status = status
      const html = render()
      expect(html).toContain(PAUSED)
      expect(html).not.toContain('Reach out from the constellation')
    }
  })

  it('keeps the plain closed note for a conversation I blocked', () => {
    state.banned = true
    state.status = 'blocked'
    const html = render()
    expect(html).toContain('This conversation is closed.')
    expect(html).not.toContain(PAUSED)
  })
})
