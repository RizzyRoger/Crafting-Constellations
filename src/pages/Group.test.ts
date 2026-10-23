import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Group } from './Group'

// A member whose email isn't confirmed yet is told "You can still read", and the rules
// let them read posts and comments. A post without a title has no title link, so the
// comment link is their only way to the whole post and its comments.

const state = vi.hoisted(() => ({ verified: false, membership: 'confirmed' as 'confirmed' | 'pending' | 'none' }))

vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'alice', claims: { admin: false, pro: false, banned: false, emailVerified: state.verified } }),
  useAuth: () => ({ profile: null }),
}))
vi.mock('../lib/live', () => ({
  useDocData: (path: string | null) => {
    const docs: Record<string, unknown> = {
      'groups/g1': { id: 'g1', name: 'Evenings', constellationId: 'c1', constellationName: 'Caring', memberCount: 2 },
      ...(state.membership === 'none' ? {} : { 'groups/g1/members/alice': { id: 'alice', uid: 'alice' } }),
    }
    const pending = path === 'groups/g1/members/alice' && state.membership === 'pending'
    return { data: (path && docs[path]) ?? null, loading: false, error: null, pending }
  },
  useQueryData: () => ({ data: [], loading: false, error: null }),
  useLiveContent: () => ({
    data: [
      {
        id: 'p1',
        path: 'groups/g1/posts/p1',
        authorUid: 'bob',
        author: { penName: 'Bob', avatarSeed: 'bob', pigment: 'ultramarine' },
        status: 'published',
        createdAt: null,
        body: 'a long night '.repeat(60),
        commentCount: 3,
      },
    ],
    loading: false,
    error: null,
  }),
}))

const openPosts = () =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/groups/g1?tab=posts'] },
      createElement(Routes, null, createElement(Route, { path: '/groups/:groupId', element: createElement(Group) })),
    ),
  )

beforeEach(() => {
  state.verified = false
  state.membership = 'confirmed'
})

describe('an untitled post in the group list', () => {
  it('opens for a member whose email is not confirmed, without a Like button', () => {
    const html = openPosts()
    expect(html).toContain('You can still read.')
    expect(html).toContain('…')
    expect(html).toContain('href="/groups/g1/posts/p1"')
    expect(html).toContain('aria-label="3 comments"')
    expect(html).not.toContain('aria-label="Like"')
  })

  it('opens and can be liked once the email is confirmed', () => {
    state.verified = true
    const html = openPosts()
    expect(html).toContain('href="/groups/g1/posts/p1"')
    expect(html).toContain('aria-label="Like"')
  })
})

describe('the group header', () => {
  it('offers Leave to a member, waits while joining, and offers Join to anyone else', () => {
    expect(openPosts()).toContain('Leave group')
    state.membership = 'pending'
    expect(openPosts()).toContain('joining…')
    state.membership = 'none'
    expect(openPosts()).toContain('Join this group')
  })
})
