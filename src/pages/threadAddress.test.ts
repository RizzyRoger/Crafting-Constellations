import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Thread } from './Thread'

// An address that isn't a thread between me and one other person says so. It must never ask
// for users/ or users/x/y: doc() throws on those, and the throw took the whole app down
const asked = vi.hoisted(() => ({ docs: [] as (string | null)[] }))
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ profile: null }),
  useMe: () => ({ uid: 'a', claims: { emailVerified: true } }),
}))
vi.mock('../lib/live', () => ({
  useDocData: (path: string | null) => {
    asked.docs.push(path)
    return { data: null, loading: Boolean(path), error: null, pending: false }
  },
  useQueryData: () => ({ data: [], loading: false, error: null }),
  useLiveContent: () => ({ data: [], loading: false, error: null }),
}))

const render = (url: string) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [url] },
      createElement(Routes, null, createElement(Route, { path: '/messages/:pairId', element: createElement(Thread) })),
    ),
  )

beforeEach(() => {
  asked.docs = []
})

describe('Thread at an address that is not mine', () => {
  it.each(['/messages/a_a', '/messages/a_', '/messages/_a', '/messages/b_a', '/messages/a_b%2Fc'])('%s says so', (url) => {
    expect(render(url)).toContain('This conversation isn’t yours to open.')
    expect(asked.docs.filter(Boolean)).toEqual([])
  })

  it('opens the one I share with someone', () => {
    render('/messages/a_b')
    expect(asked.docs).toContain('users/b')
  })
})
