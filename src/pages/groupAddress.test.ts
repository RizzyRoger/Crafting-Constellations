import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Group } from './Group'
import { PostPage } from './Post'

// React Router decodes %2F, so /groups/a%2Fb asks for group 'a/b'. Such an address says the
// group or post isn't here. It must never ask for groups/a/b or start a lookup at 'a/b':
// doc() and startAt() throw on those, and no reload could open the page
const asked = vi.hoisted(() => ({ all: [] as string[] }))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ profile: null }),
  useMe: () => ({ uid: 'alice', claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('../lib/live', () => {
  // alice is in g1
  const docs: Record<string, unknown> = {
    'groups/g1': { id: 'g1', name: 'Evenings', constellationId: 'c1', constellationName: 'Caring', memberCount: 2 },
    'groups/g1/members/alice': { id: 'alice', uid: 'alice' },
  }
  const none = { data: [], loading: false, error: null }
  return {
    useDocData: (path: string | null) => {
      if (path) asked.all.push(path)
      return { data: (path && docs[path]) ?? null, loading: false, error: null, pending: false }
    },
    useQueryData: (key: string | null) => {
      if (key) asked.all.push(key)
      return none
    },
    useLiveContent: (path: string | null) => {
      if (path) asked.all.push(path)
      return none
    },
  }
})

const render = (url: string) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [url] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/groups/:groupId', element: createElement(Group) }),
        createElement(Route, { path: '/groups/:groupId/posts/:postId', element: createElement(PostPage) }),
      ),
    ),
  )

const touching = (id: string) => asked.all.filter((name) => name.includes(id))

beforeEach(() => {
  asked.all = []
})

describe('a group address with an encoded slash', () => {
  it('says the group isn’t here, asking for nothing', () => {
    expect(render('/groups/a%2Fb')).toContain('This group isn’t here any more.')
    expect(asked.all).toEqual([])
  })

  it('opens a real one', () => {
    expect(render('/groups/g1?tab=posts')).toContain('Evenings')
    expect(asked.all).toContain('groups/g1')
  })
})

describe('a post address with an encoded slash', () => {
  it('in the group says the post isn’t available, asking for nothing', () => {
    expect(render('/groups/a%2Fb/posts/p1')).toContain('This post isn’t available.')
    expect(asked.all).toEqual([])
  })

  it('in the post says it isn’t available, with the way back to the group, and looks nothing up from it', () => {
    const html = render('/groups/g1/posts/a%2Fb')
    expect(html).toContain('This post isn’t available.')
    expect(html).toContain('href="/groups/g1"')
    expect(touching('a/b')).toEqual([])
  })

  it('looks a real one up', () => {
    render('/groups/g1/posts/p1')
    expect(asked.all.some((name) => name.startsWith('post-published|groups/g1/posts/p1'))).toBe(true)
  })
})
