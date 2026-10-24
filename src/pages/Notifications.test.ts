import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Notifications } from './Notifications'

// The rail counts every unseen notice, with no limit, while this page loads only the newest
// few. Mark all read has to reach the unseen ones past that window too, or the rail's count
// sticks with nothing left on the page to clear it (notices can't be deleted by their owner).
// Firestore here is a small in-memory store: the page's queries are run against it as asked.

type Data = Record<string, unknown>
type Constraint = { where?: [string, string, unknown]; orderBy?: [string, string]; limit?: number }
type Asked = { path: string; constraints: Constraint[] }

const state = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  commits: [] as number[],
  errors: [] as unknown[],
  answered: [] as [string, string][],
  // Written here and not yet confirmed by the server
  local: new Set<string>(),
  // The path of every query the page asked
  asked: [] as string[],
}))

vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({
  describeError: (e: unknown) => {
    state.errors.push(e)
    return String(e)
  },
}))
// Answering a request writes at once, as the local cache does, so the row drops on the next render
vi.mock('../lib/social', () => ({
  acceptConnection: async (id: string) => {
    state.answered.push(['accept', id])
    state.store.set(`connections/${id}`, { ...state.store.get(`connections/${id}`), status: 'accepted' })
  },
  removeConnection: async (id: string) => {
    state.answered.push(['remove', id])
    state.store.delete(`connections/${id}`)
  },
}))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'alice', claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path, constraints: [] }),
  collectionGroup: (_db: unknown, group: string) => ({ path: `**/${group}`, constraints: [] }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: Asked, ...constraints: Constraint[]) => ({ path: ref.path, constraints: [...ref.constraints, ...constraints] }),
  where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
  orderBy: (field: string, dir = 'asc') => ({ orderBy: [field, dir] }),
  limit: (n: number) => ({ limit: n }),
  // Firestore refuses a batch of more than 500 writes
  writeBatch: () => {
    const writes: [string, Data][] = []
    return {
      update: (ref: { path: string }, data: Data) => writes.push([ref.path, data]),
      commit: async () => {
        if (writes.length > 500) throw new Error('Maximum 500 writes allowed per request')
        writes.forEach(([path, data]) => {
          const found = state.store.get(path)
          if (!found) throw new Error(`No document to update: ${path}`)
          state.store.set(path, { ...found, ...data })
        })
        state.commits.push(writes.length)
      },
    }
  },
  updateDoc: async () => undefined,
}))

const millis = (d: Data) => (d.createdAt as { toMillis: () => number }).toMillis()

const matches = (d: Data, [field, op, value]: [string, string, unknown]) =>
  op === 'array-contains' ? Array.isArray(d[field]) && d[field].includes(value) : op === '==' && d[field] === value

// A document in the collection asked of: one path, or every collection of a name ('**/name')
const within = (p: string, path: string) =>
  path.startsWith('**/') ? p.split('/').at(-2) === path.slice(3) : p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')

// A query run against the store, as Firestore would answer it
const run = ({ path, constraints }: Asked) => {
  const rows = [...state.store.entries()]
    .filter(([p]) => within(p, path))
    .map(([p, d]) => ({ id: p.split('/').pop()!, path: p, ...d }) as Data)
    .filter((d) => constraints.every((c) => !c.where || matches(d, c.where)))
  const order = constraints.find((c) => c.orderBy)?.orderBy
  if (order) rows.sort((a, b) => (order[1] === 'desc' ? millis(b) - millis(a) : millis(a) - millis(b)))
  const cap = constraints.find((c) => c.limit)?.limit
  return cap ? rows.slice(0, cap) : rows
}

// Rows asked for with `pending` say whether they're only written here so far
vi.mock('../lib/live', () => ({
  useQueryData: (key: string | null, build: () => Asked, { pending = false } = {}) => {
    if (!key) return { data: [], loading: false, error: null }
    const asked = build()
    state.asked.push(asked.path)
    const rows = run(asked)
    return { data: pending ? rows.map((d) => ({ ...d, pending: state.local.has(d.path as string) })) : rows, loading: false, error: null }
  },
  useDocData: () => ({ data: null, loading: false, error: null, pending: false }),
}))

const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) })

// `count` notices for alice, newest first, a minute apart; ids n0 (newest) upward
const seed = (count: number, seen: (i: number) => boolean) => {
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    state.store.set(`users/alice/notices/n${i}`, { type: 'held', createdAt: at(now - i * 60_000), seen: seen(i) })
  }
}

// What the rail counts: every notice of hers still unseen
const railCount = () => run({ path: 'users/alice/notices', constraints: [{ where: ['seen', '==', false] }] }).length

// The elements the page returns, read inside a render so its hooks run
const rendered = () => {
  let tree = null as ReactNode
  const Probe = () => {
    tree = Notifications()
    return null
  }
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Probe)))
  return tree
}

const markup = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Notifications)))

type Clickable = ReactElement<{ children?: ReactNode; onClick?: (e: { detail: number }) => Promise<void> }>

// The first button with this label, in page order
const findButton = (node: ReactNode, label: string): Clickable | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => findButton(child, label)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === 'button' && node.props.children === label) return node as Clickable
  return findButton(node.props.children, label)
}

// A click on whatever button with this label is now first: 0 clicks in a row for a key, 1 for a
// single click, 2 for the second click of a double-click
const click = async (label: string, detail = 1) => {
  const button = findButton(rendered(), label)
  expect(button).not.toBeNull()
  await button!.props.onClick!({ detail })
}

const markAllRead = () => click('Mark all read')

beforeEach(() => {
  state.store.clear()
  state.commits = []
  state.errors = []
  state.answered = []
  state.local.clear()
  state.asked = []
})

describe('Mark all read', () => {
  it('clears every unseen notice, not just the newest page of them', async () => {
    seed(60, () => false)
    expect(railCount()).toBe(60)
    await markAllRead()
    expect(state.errors).toEqual([])
    expect(railCount()).toBe(0)
  })

  it('shows and clears an unseen notice older than the newest page', async () => {
    seed(51, (i) => i < 50)
    expect(railCount()).toBe(1)
    const html = markup()
    expect(html).toContain('Mark all read')
    expect(html).toContain('notice notice--unread')
    await markAllRead()
    expect(state.errors).toEqual([])
    expect(railCount()).toBe(0)
  })

  it('splits a long absence into batches Firestore will take', async () => {
    seed(1200, () => false)
    await markAllRead()
    expect(state.errors).toEqual([])
    expect(state.commits).toEqual([500, 500, 200])
    expect(railCount()).toBe(0)
  })

  it('is not offered when nothing is unseen', () => {
    seed(60, () => true)
    expect(findButton(rendered(), 'Mark all read')).toBeNull()
    expect(markup()).not.toContain('notice--unread')
  })
})

// Answering a request drops its row at once, so the next request slides up into its place and
// its Accept and Not now sit right under the pointer
describe('Waiting for you', () => {
  const person = (id: string) => ({ penName: id, avatarSeed: id, pigment: 'sepia', pro: false, banned: false })

  // Two requests waiting on alice, in the order the page lists them
  const requests = () => {
    for (const other of ['bob', 'carol']) {
      state.store.set(`users/${other}`, person(other))
      state.store.set(`connections/alice_${other}`, { uids: ['alice', other], requester: other, recipient: 'alice', status: 'pending' })
    }
  }

  const status = (id: string) => state.store.get(`connections/${id}`)?.status

  it('accepts only the request double-clicked, not the one that slides up under the second click', async () => {
    requests()
    await click('Accept', 1)
    await click('Accept', 2)
    expect(state.answered).toEqual([['accept', 'alice_bob']])
    expect(status('alice_carol')).toBe('pending')
  })

  it('declines only the request double-clicked', async () => {
    requests()
    await click('Not now', 1)
    await click('Not now', 2)
    expect(state.answered).toEqual([['remove', 'alice_bob']])
    expect(status('alice_carol')).toBe('pending')
  })

  it('still answers each request clicked or pressed in its own turn', async () => {
    requests()
    await click('Accept', 0)
    await click('Not now', 1)
    expect(state.answered).toEqual([
      ['accept', 'alice_bob'],
      ['remove', 'alice_carol'],
    ])
  })

  it('marks nothing read from the second click of a double-click', async () => {
    seed(3, () => false)
    await click('Mark all read', 2)
    expect(state.commits).toEqual([])
    expect(railCount()).toBe(3)
  })
})

// The crisis note says the resources below are always here, and for writing held in a group
// it can be the only place left that shows them once a moderator has read it
describe('A crisis notice', () => {
  for (const seen of [false, true]) {
    it(`shows the support lines under it ${seen ? 'after' : 'before'} it is read`, () => {
      state.store.set('users/alice/notices/n0', { type: 'crisis', createdAt: at(Date.now()), seen })
      const html = markup()
      expect(html).toContain('The resources below are always here.')
      expect(html).toContain('If you need someone right now')
      expect(html).toContain('href="tel:988"')
    })
  }
})

// Reset profile is sent as 'removed' too, pointing at the profile itself. No group and no writing
// was involved: the person has to hear that their name and note were reset, and where to choose again
describe('A removed notice', () => {
  const removed = (contentPath: string) => {
    state.store.set('users/alice/notices/n0', { type: 'removed', contentPath, note: 'Please don’t use a real clinic’s name.', createdAt: at(Date.now()), seen: false })
  }

  it('says a moderator reset the pen name and note, when it points at the profile', () => {
    removed('users/alice')
    const html = markup()
    expect(html).toContain('A moderator reset your pen name and note')
    expect(html).toContain('href="/me"')
    expect(html).toContain('Note from the moderator: Please don’t use a real clinic’s name.')
    expect(html).not.toContain('removed something you wrote')
    expect(html).not.toContain('group’s guidelines')
  })

  // Reset retires the reported name only while nobody else holds it, and frees a name they renamed
  // to since, so the name they last went by can be theirs again: the note mustn't say it's gone
  it('says only that the reported name may not be available again', () => {
    removed('users/alice')
    const html = markup()
    expect(html).not.toContain('Your old name can’t be used again')
    expect(html).toContain('The name that was reported may not be available again.')
  })

  it('still says writing was removed, when it points at writing', () => {
    removed('groups/g1/posts/p1')
    const html = markup()
    expect(html).toContain('A moderator removed something you wrote, because it didn’t fit the group’s guidelines.')
    expect(html).not.toContain('reset your pen name')
  })
})

// Leaving Daily check-in lasts for the visit: the shell joins again on the next one, with a write
// that's local at first. A listen on member-only writing that the rules judge before the server has
// the membership is refused, and the row would say the writing is gone for the rest of the visit
describe('A notice about Daily check-in writing', () => {
  const POST = 'groups/daily-check-in/posts/p1'
  const MEMBER = 'groups/daily-check-in/members/alice'
  const NOTICES: [string, string, string][] = [
    ['a comment on her check-in', 'comment', `${POST}/comments/c1`],
    ['a mention in a check-in', 'mention', 'groups/daily-check-in/posts/p2'],
  ]

  // Written while she was a member; the notice stays after she leaves
  const told = (type: string, contentPath: string) => {
    const written = at(Date.now() - 60_000)
    state.store.set('groups/daily-check-in', { name: 'Daily check-in' })
    state.store.set(POST, { authorUid: 'alice', status: 'published', body: 'Slept badly again.', createdAt: at(Date.now() - 120_000) })
    state.store.set(contentPath, { authorUid: 'bob', status: 'published', text: 'Thinking of you today, @alice.', body: 'Thinking of you today, @alice.', createdAt: written })
    state.store.set('users/alice/notices/n0', { type, actorUid: 'bob', contentPath, contentAt: written, createdAt: at(Date.now()), seen: false })
  }

  const askedOfCheckIn = () => state.asked.filter((path) => path.startsWith('groups/daily-check-in/'))

  it.each(NOTICES)('reads nothing of %s while the join is only local, then the words once the server has it', (_, type, contentPath) => {
    told(type, contentPath)
    state.store.set(MEMBER, { uid: 'alice' })
    state.local.add(MEMBER)
    const joining = markup()
    expect(askedOfCheckIn()).toEqual([])
    expect(joining).not.toContain('No longer here.')
    expect(joining).not.toContain('no longer in this group')
    expect(joining).toContain('Daily check-in')

    state.local.delete(MEMBER)
    const joined = markup()
    expect(askedOfCheckIn()).toEqual([contentPath.slice(0, contentPath.lastIndexOf('/'))])
    expect(joined).toContain('Thinking of you today')
    expect(joined).not.toContain('No longer here.')
  })

  it('says she is no longer in it when there is no membership, and reads nothing', () => {
    told('comment', `${POST}/comments/c1`)
    const html = markup()
    expect(askedOfCheckIn()).toEqual([])
    expect(html).toContain('You’re no longer in this group or chat.')
  })
})
