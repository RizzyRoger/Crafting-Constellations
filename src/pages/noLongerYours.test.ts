import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Chat } from './Chat'
import { PostPage } from './Post'
import { Thread } from './Thread'

// Old threads, notices and Back still open a thread whose connection is gone, a chat
// you left, or a post withdrawn since. Each page must never listen to that document:
// the rules refuse it, and a refused listen breaks the Firestore client (tasks/lessons.md).
// Here nothing is found, so every document read is recorded as the page asks for it.

const state = vi.hoisted(() => ({ me: 'alice', listened: [] as string[] }))

vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: state.me, claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('../lib/live', () => ({
  useDocData: (path: string | null) => {
    if (path) state.listened.push(path)
    const data = path === `groups/g/members/${state.me}` ? { id: state.me, uid: state.me } : null
    return { data, loading: false, error: null, pending: false }
  },
  useQueryData: () => ({ data: [], loading: false, error: null }),
  useLiveContent: () => ({ data: [], loading: false, error: null }),
}))

const open = (url: string, pattern: string, page: ComponentType) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [url] }, createElement(Routes, null, createElement(Route, { path: pattern, element: createElement(page) }))),
  )

beforeEach(() => {
  state.listened = []
})

describe('opening something that is no longer yours', () => {
  it('a private thread after a disconnect listens to the other profile only', () => {
    state.me = 'alice'
    const html = open('/messages/alice_bob', '/messages/:pairId', Thread)
    expect(state.listened).toEqual(['users/bob'])
    expect(html).toContain('You can write once you’re connected.')
  })

  it('a chat you left listens to no document', () => {
    state.me = 'alice'
    const html = open('/chats/c1', '/chats/:chatId', Chat)
    expect(state.listened).toEqual([])
    expect(html).toContain('This chat isn’t yours to open.')
  })

  it('a withdrawn post listens to the group and your membership only', () => {
    state.me = 'bob'
    const html = open('/groups/g/posts/p', '/groups/:groupId/posts/:postId', PostPage)
    expect(state.listened).toEqual(['groups/g', 'groups/g/members/bob'])
    expect(html).toContain('This post isn’t available.')
  })
})
