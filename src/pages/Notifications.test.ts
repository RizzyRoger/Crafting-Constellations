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
}))

vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({
  describeError: (e: unknown) => {
    state.errors.push(e)
    return String(e)
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

// A query run against the store, as Firestore would answer it
const run = ({ path, constraints }: Asked) => {
  const rows = [...state.store.entries()]
    .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
    .map(([p, d]) => ({ id: p.split('/').pop()!, path: p, ...d }) as Data)
    .filter((d) => constraints.every((c) => !c.where || (c.where[1] === '==' && d[c.where[0]] === c.where[2])))
  const order = constraints.find((c) => c.orderBy)?.orderBy
  if (order) rows.sort((a, b) => (order[1] === 'desc' ? millis(b) - millis(a) : millis(a) - millis(b)))
  const cap = constraints.find((c) => c.limit)?.limit
  return cap ? rows.slice(0, cap) : rows
}

vi.mock('../lib/live', () => ({
  useQueryData: (key: string | null, build: () => Asked) => ({ data: key ? run(build()) : [], loading: false, error: null }),
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

type Clickable = ReactElement<{ children?: ReactNode; onClick?: () => Promise<void> }>

const findButton = (node: ReactNode, label: string): Clickable | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => findButton(child, label)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === 'button' && node.props.children === label) return node as Clickable
  return findButton(node.props.children, label)
}

const markAllRead = async () => {
  const button = findButton(rendered(), 'Mark all read')
  expect(button).not.toBeNull()
  await button!.props.onClick!()
}

beforeEach(() => {
  state.store.clear()
  state.commits = []
  state.errors = []
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
