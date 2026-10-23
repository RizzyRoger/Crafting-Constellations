import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Admin } from './Admin'

// Approve and Remove take the entry out of the queue whatever came of them, so what the
// moderator is told can't live in the entry: it has to outlast it, even the queue's last one

const state = vi.hoisted(() => ({ queue: [] as unknown[], said: '', asked: false }))

vi.mock('../lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn(), problemOf: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ uid: 'mod', refreshClaims: vi.fn() }) }))
vi.mock('../lib/live', () => ({ useQueryData: () => ({ data: state.queue, loading: false, error: null }) }))
vi.mock('../components/PageHead', () => ({ PageHead: () => null }))
// A server render can't press anything, so the queue's note is seeded: it is the first state
// the page asks for that starts as words
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  const useState = (initial: unknown) => {
    if (initial !== '' || state.asked) return react.useState(initial)
    state.asked = true
    return react.useState(state.said)
  }
  return { ...react, useState }
})

const STATUS = /<p class="meta live" role="status">(.*?)<\/p>/

const render = (said = '') => {
  state.said = said
  state.asked = false
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Admin)))
}

const entry = {
  id: 'dms~a_b~messages~m1',
  contentPath: 'dms/a_b/messages/m1',
  kind: 'dm',
  pairId: 'a_b',
  authorUid: 'a',
  authorPenName: 'Bramble',
  snapshot: { text: 'you are such a loser' },
  automod: { categories: ['harassment'], crisis: false, matches: [] },
  priority: 1,
  state: 'open',
  createdAt: null,
}

describe('review queue', () => {
  beforeEach(() => {
    state.queue = []
  })

  it('has its status region in place and empty before anything is decided', () => {
    state.queue = [entry]
    const html = render()
    expect(html).toMatch(/Bramble/)
    expect(html.match(STATUS)?.[1]).toBe('')
  })

  it('still says what came of a decision once the queue is clear', () => {
    const said = 'Private note · Bramble — Approved, but not delivered: they’re no longer connected, so it stays held.'
    const html = render(said)
    expect(html).toMatch(/Nothing waiting\. The queue is clear\./)
    expect(html.match(STATUS)?.[1]).toBe(said)
  })
})
