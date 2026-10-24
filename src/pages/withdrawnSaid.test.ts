import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Talk } from '../components/Talk'
import { Group } from './Group'
import { PostPage } from './Post'
import { Thread } from './Thread'

// Withdrawn writing drops out of its list at once, and anything said inside it goes too. Each
// place where I can withdraw keeps a status of its own, mounted from the start outside the list,
// and hands every piece of writing the way to say into it. No Firebase in node
const said = vi.hoisted(() => ({ say: (_text: string) => {}, places: [] as string[] }))
const items = vi.hoisted(() => [] as { item: { path: string }; say?: unknown }[])
const state = vi.hoisted(() => ({ postStatus: 'published' }))

vi.mock('../components/Said', async (importOriginal) => {
  const real = await importOriginal<typeof import('../components/Said')>()
  return {
    ...real,
    useSaid: (place: string) => {
      said.places.push(place)
      return [null, said.say]
    },
  }
})
// The real Item, noting what it's given
vi.mock('../components/Item', async (importOriginal) => {
  const { Item } = await importOriginal<typeof import('../components/Item')>()
  return {
    Item: (props: Parameters<typeof Item>[0]) => {
      items.push(props)
      return Item(props)
    },
  }
})
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ profile: null }),
  useMe: () => ({ uid: 'a', claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('../lib/people', () => ({ useGroupPeople: () => [] }))

// Something I wrote
const mine = vi.hoisted(() => (path: string, extra: Record<string, unknown> = {}) => ({
  id: path.split('/').pop(),
  path,
  authorUid: 'a',
  status: 'published',
  createdAt: null,
  text: 'mine',
  body: 'mine',
  ...extra,
}))

vi.mock('../lib/live', () => {
  const docs: Record<string, unknown> = {
    'groups/g': { id: 'g', name: 'Evenings', constellationName: 'Caring', memberCount: 2 },
    'groups/g/members/a': { id: 'a', uid: 'a' },
    'users/b': { id: 'b', penName: 'Bea', avatarSeed: 'b', pigment: 'ochre', pro: false },
  }
  const post = () => mine('groups/g/posts/p', { status: state.postStatus })
  const queries = (key: string) => {
    if (key.startsWith('connections|')) return [{ id: 'a_b', uids: ['a', 'b'], status: 'accepted' }]
    if (key.startsWith('post-mine|')) return [post()]
    if (key.startsWith('post-published|')) return state.postStatus === 'published' ? [post()] : []
    return []
  }
  const content: Record<string, unknown[]> = {
    'groups/g/messages': [mine('groups/g/messages/m1')],
    'dms/a_b/messages': [mine('dms/a_b/messages/m1')],
    'groups/g/posts': [mine('groups/g/posts/p1')],
    'groups/g/posts/p/comments': [mine('groups/g/posts/p/comments/c1')],
  }
  return {
    useDocData: (path: string | null) => ({ data: (path && docs[path]) ?? null, loading: false, error: null, pending: false }),
    useQueryData: (key: string | null) => ({ data: key ? queries(key) : [], loading: false, error: null }),
    useLiveContent: (path: string | null) => ({ data: (path && content[path]) ?? [], loading: false, error: null, synced: true }),
  }
})

// The page at this address, as markup, with the elements the page itself returned
const open = (address: string, pattern: string, page: () => ReactNode) => {
  let tree = null as ReactNode
  const Probe = () => {
    tree = page()
    return tree
  }
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [address] },
      createElement(Routes, null, createElement(Route, { path: pattern, element: createElement(Probe) })),
    ),
  )
  return { html, tree }
}

const REGION = '<p class="visually-hidden" role="status"></p>'

// An element's whole markup, from its opening tag to the close that balances it
const whole = (html: string, opening: string, tag: string) => {
  const start = html.indexOf(opening)
  expect(start, opening).toBeGreaterThanOrEqual(0)
  const tags = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g')
  tags.lastIndex = start
  let depth = 0
  for (let hit = tags.exec(html); hit; hit = tags.exec(html)) {
    depth += hit[0].startsWith('</') ? -1 : 1
    if (depth === 0) return html.slice(start, tags.lastIndex)
  }
  throw new Error(`${opening} never closes`)
}

// Where the status sits among the elements the page returned: each step's index and type. The same
// steps in two renders, and React keeps the one region mounted from the first to the second
const placeOfStatus = (node: ReactNode, Said: unknown, steps: string[] = []): string[] | null => {
  if (Array.isArray(node)) {
    return node.reduce<string[] | null>((hit, child, i) => hit ?? placeOfStatus(child, Said, [...steps, String(i)]), null)
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  const here = [...steps, typeof node.type === 'function' ? node.type.name : String(node.type)]
  return node.type === Said ? here : placeOfStatus(node.props.children, Said, here)
}

const sayingFor = (path: string) => items.filter((props) => props.item.path === path).map((props) => props.say)

beforeEach(() => {
  items.length = 0
  said.places = []
  state.postStatus = 'published'
})

describe('Withdrawing, read aloud', () => {
  it('in talk: every message can say into the talk’s status, held outside the conversation and empty', () => {
    const { html } = open('/', '/', () => Talk({ path: 'groups/g/messages', me: 'a', verified: true }))
    expect(sayingFor('groups/g/messages/m1')).toEqual([said.say])
    expect(said.places).toEqual(['groups/g/messages'])
    expect(html).toContain(REGION)
    expect(whole(html, '<div class="chat"', 'div')).not.toContain('role="status"')
  })

  it('in private notes: every note can say into the thread’s status, held outside the conversation and empty', () => {
    const { html } = open('/messages/a_b', '/messages/:pairId', Thread)
    expect(sayingFor('dms/a_b/messages/m1')).toEqual([said.say])
    expect(said.places).toEqual(['a_b'])
    expect(html).toContain(REGION)
    expect(whole(html, '<div class="chat"', 'div')).not.toContain('role="status"')
  })

  it('in a group’s posts: every post can say into the posts’ status, held outside the list that goes with the last one', () => {
    const { html } = open('/groups/g?tab=posts', '/groups/:groupId', Group)
    expect(sayingFor('groups/g/posts/p1')).toEqual([said.say])
    expect(said.places).toEqual(['g'])
    expect(html).toContain(REGION)
    expect(whole(html, '<ul class="post-list"', 'ul')).not.toContain('role="status"')
  })

  it('on a post’s page: the post and its comments can say into the page’s status, held outside them', () => {
    const { html } = open('/groups/g/posts/p', '/groups/:groupId/posts/:postId', PostPage)
    expect(sayingFor('groups/g/posts/p')).toEqual([said.say])
    expect(sayingFor('groups/g/posts/p/comments/c1')).toEqual([said.say])
    expect(said.places).toEqual(['groups/g/posts/p'])
    expect(html).toContain(REGION)
    expect(whole(html, '<div class="stack reading"', 'div')).not.toContain('role="status"')
  })

  // The note in its place arrives already holding its words, so it's often not read
  it('on a post’s page: keeps the status in its place when the post is withdrawn and the page becomes a note', async () => {
    const { Said } = await import('../components/Said')
    const before = placeOfStatus(open('/groups/g/posts/p', '/groups/:groupId/posts/:postId', PostPage).tree, Said)
    state.postStatus = 'withdrawn'
    const after = open('/groups/g/posts/p', '/groups/:groupId/posts/:postId', PostPage)
    expect(after.html).toContain('You withdrew this post.')
    expect(after.html).toContain(REGION)
    expect(before).not.toBeNull()
    expect(placeOfStatus(after.tree, Said)).toEqual(before)
  })
})
