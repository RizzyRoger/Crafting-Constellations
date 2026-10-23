import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Status } from '../lib/types'
import { PostPage } from './Post'

// My own post, opened after I withdrew it or a moderator removed it: the lookup for
// my writing still finds it, whatever its status. No Firebase in node
const state = vi.hoisted(() => ({ status: 'published' as string, comments: [] as (string | null)[] }))

vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ profile: null }),
  useMe: () => ({ uid: 'me', claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('../lib/people', () => ({ useGroupPeople: () => [] }))
vi.mock('../lib/live', () => ({
  useDocData: (path: string | null) => ({
    data: path === 'groups/g/members/me' ? { id: 'me', uid: 'me' } : path === 'groups/g' ? { id: 'g', name: 'Evenings' } : null,
    loading: false,
    error: null,
    pending: false,
  }),
  useQueryData: (key: string | null) => ({
    data:
      key?.startsWith('post-mine|') || (key?.startsWith('post-published|') && state.status === 'published')
        ? [{ id: 'p', path: 'groups/g/posts/p', authorUid: 'me', status: state.status, createdAt: null, body: 'what I wrote that night' }]
        : [],
    loading: false,
    error: null,
  }),
  useLiveContent: (path: string | null) => {
    state.comments.push(path)
    return { data: [], loading: false, error: null }
  },
}))

const open = (status: Status) => {
  state.status = status
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/groups/g/posts/p'] },
      createElement(Routes, null, createElement(Route, { path: '/groups/:groupId/posts/:postId', element: createElement(PostPage) })),
    ),
  )
}

beforeEach(() => {
  state.comments = []
})

describe('PostPage', () => {
  it('shows my published post with its comments and Withdraw', () => {
    const html = open('published')
    expect(html).toContain('what I wrote that night')
    expect(html).toContain('>Withdraw</button>')
    expect(state.comments).toEqual(['groups/g/posts/p/comments'])
  })

  it('says I withdrew a post, in place of it, its comments and a Withdraw the rules refuse', () => {
    const html = open('withdrawn')
    expect(html).toContain('You withdrew this post.')
    expect(html).toContain('href="/groups/g"')
    expect(html).not.toContain('what I wrote that night')
    expect(html).not.toContain('Withdraw<')
    expect(state.comments).toEqual([null])
  })

  it('says a moderator removed it', () => {
    const html = open('removed')
    expect(html).toContain('A moderator removed this post')
    expect(html).not.toContain('what I wrote that night')
    expect(html).not.toContain('Withdraw<')
    expect(state.comments).toEqual([null])
  })
})
