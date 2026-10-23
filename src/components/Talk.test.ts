import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Talk } from './Talk'

// A talk that has just opened with its history, heard from the server unless a case says
// only the cache has answered; no Firebase in node
const live = vi.hoisted(() => ({ synced: true }))
// The real announcer, noting what it is told
const told = vi.hoisted(() => [] as { opening: boolean }[])
vi.mock('./Arrivals', async (importOriginal) => {
  const { Arrivals } = await importOriginal<typeof import('./Arrivals')>()
  return {
    Arrivals: (props: Parameters<typeof Arrivals>[0]) => {
      told.push(props)
      return Arrivals(props)
    },
  }
})
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/live', () => ({
  useLiveContent: () => ({
    data: [
      {
        id: 'm1',
        path: 'groups/g/messages/m1',
        authorUid: 'sam',
        status: 'published',
        createdAt: null,
        text: 'an old note from last week',
        author: { penName: 'Sam', avatarSeed: 'sam', pigment: 'ochre', pro: false },
      },
    ],
    loading: false,
    error: null,
    synced: live.synced,
  }),
}))

const render = (verified: boolean, synced = true) => {
  live.synced = synced
  told.length = 0
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Talk, { path: 'groups/g/messages', me: 'u1', verified })))
}

describe('Talk', () => {
  it('shows its history in a named region that is not live', () => {
    for (const html of [render(true), render(false)]) {
      const chat = html.match(/<div class="chat"[^>]*>/)?.[0]
      expect(chat).toBe('<div class="chat" role="region" aria-label="Group talk">')
      expect(html).toMatch(/an old note from last week/)
    }
  })

  it('has one live part, its announcer, in place and empty: the history it opened with is not news', () => {
    // Unconfirmed, so no composer, which has a live part of its own
    const html = render(false)
    expect(html.match(/<[^>]*aria-live[^>]*>/g)).toEqual(['<p class="visually-hidden" aria-live="polite">'])
    expect(html).toMatch(/<p class="visually-hidden" aria-live="polite"><\/p>/)
  })

  it('keeps the announcer opening until the server has answered, though the cache already shows rows', () => {
    // The cache can answer with only part of the history, which would read as news
    render(true, false)
    expect(told.map((props) => props.opening)).toEqual([true])
    render(true, true)
    expect(told.map((props) => props.opening)).toEqual([false])
  })
})
