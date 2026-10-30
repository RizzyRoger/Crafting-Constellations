/*
 * The local backend against a stand-in Firestore that fails the ways the real one can: a read
 * that gives up after its tries, or a commit that goes through and still reports an error (the
 * SDK then runs the transaction again). The backend's other modules are stand-ins too, so this
 * follows only what local-backend.ts does with them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startLocalBackend } from './local-backend.js'

const fake = vi.hoisted(() => {
  const now = 1_000_000_000_000
  const readTime = { toMillis: () => now }
  const state = {
    listeners: [] as { name: string; onNext: (snap: unknown) => void }[],
    unsubscribed: 0,
    // How many more reads of each collection fail
    failing: new Map<string, number>(),
    // How many more commits go through and then report an error
    ambiguousCommits: 0,
    calls: new Map<string, Record<string, unknown>>(),
    updates: [] as { path: string; data: Record<string, unknown> }[],
  }
  // What the startup reads find
  const held: Record<string, string[]> = { groups: ['groups/g1'], 'group:posts': ['groups/g1/posts/p1'], friendships: ['friendships/a_b'] }
  const unavailable = () => Object.assign(new Error('14 UNAVAILABLE: No connection established'), { code: 14 })

  const query = (name: string): unknown => ({
    where: () => query(name),
    limit: () => query(name),
    onSnapshot: (onNext: (snap: unknown) => void) => {
      state.listeners.push({ name, onNext })
      return () => (state.unsubscribed += 1)
    },
    get: async () => {
      const left = state.failing.get(name) ?? 0
      state.failing.set(name, left - 1)
      if (left > 0) throw unavailable()
      return { readTime, docs: (held[name] ?? []).map((path) => ({ id: path.split('/').pop(), ref: { path } })) }
    },
  })
  const count = { get: async () => ({ data: () => ({ count: 2 }) }) }
  const doc = (path: string) => ({
    path,
    collection: () => ({ count: () => count, where: () => ({ count: () => count }) }),
    update: async (data: Record<string, unknown>) => void state.updates.push({ path, data }),
  })

  // One at a time, as Firestore locks what a transaction reads. Like the SDK, a commit that
  // reports an error runs the whole transaction again, even when the commit went through.
  const attempt = async (work: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
    const writes: (() => void)[] = []
    const result = await work({
      get: async (ref: { id: string }) => {
        const data = state.calls.get(ref.id)
        return { data: () => (data ? { ...data } : undefined), get: (field: string) => data?.[field], readTime }
      },
      update: (ref: { id: string }, data: Record<string, unknown>) => writes.push(() => Object.assign(state.calls.get(ref.id) ?? {}, data)),
    })
    writes.forEach((write) => write())
    if (writes.length === 0 || state.ambiguousCommits === 0) return result
    state.ambiguousCommits -= 1
    return attempt(work)
  }
  let turn: Promise<unknown> = Promise.resolve()
  const runTransaction = (work: (tx: unknown) => Promise<unknown>) => {
    const result = turn.then(() => attempt(work))
    turn = result.catch(() => undefined)
    return result
  }

  // A call as the site writes it, `ageMs` old on the server's clock
  const call = (id: string, ageMs: number, extra: Record<string, unknown> = {}) => {
    state.calls.set(id, { uid: 'u1', name: 'saveProfile', data: {}, authTime: 0, state: 'new', createdAt: { toMillis: () => now - ageMs }, ...extra })
    return { id, path: `calls/${id}`, update: async (data: Record<string, unknown>) => void Object.assign(state.calls.get(id) ?? {}, data) }
  }

  return {
    state,
    readTime,
    call,
    db: { collection: query, collectionGroup: (name: string) => query(`group:${name}`), doc, runTransaction },
    saveProfile: vi.fn(async () => ({ ok: true })),
    mirrorFriendshipOf: vi.fn(async () => {}),
  }
})

vi.mock('./app.js', () => ({
  NOT_FOUND: 5,
  auth: { getUser: async (uid: string) => ({ uid, disabled: false, customClaims: {}, email: `${uid}@example.test`, emailVerified: true }) },
  db: fake.db,
}))
vi.mock('./index.js', () => ({ saveProfile: { run: fake.saveProfile } }))
vi.mock('./content.js', () => ({ handleNewContent: async () => {} }))
vi.mock('./reports.js', () => ({ handleNewReport: async () => {} }))
vi.mock('./friendships.js', () => ({ mirrorFriendshipOf: fake.mirrorFriendshipOf, noticeOnAccept: async () => {} }))

// A real turn of the event loop: Node reports unhandled rejections once the microtasks run out
const settle = () => new Promise((resolve) => setImmediate(resolve))

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => void unhandled.push(reason)
let backend: Awaited<ReturnType<typeof startLocalBackend>> | undefined

// Starts the backend and sends each listener its first snapshot: the calls listener hands over `calls`
const start = async (calls: { id: string }[] = []) => {
  backend = await startLocalBackend()
  fake.state.listeners.forEach(({ name, onNext }) =>
    onNext({ readTime: fake.readTime, docs: [], docChanges: () => (name === 'calls' ? calls.map((ref) => ({ type: 'added', doc: { ref } })) : []) }),
  )
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.clearAllMocks()
  // Every variable prepareEnv reads or sets, so each is put back afterwards
  vi.stubEnv('GCLOUD_PROJECT', 'demo-faults')
  vi.stubEnv('FIREBASE_CONFIG', undefined)
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', undefined)
  vi.stubEnv('ADMIN_EMAILS', 'moderator@example.test')
  Object.assign(fake.state, { listeners: [], unsubscribed: 0, failing: new Map(), ambiguousCommits: 0, calls: new Map(), updates: [] })
  unhandled.length = 0
  process.on('unhandledRejection', onUnhandled)
})

afterEach(async () => {
  const stopped = backend?.stop(0)
  await vi.advanceTimersByTimeAsync(0)
  await stopped
  backend = undefined
  process.off('unhandledRejection', onUnhandled)
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('claiming a call', () => {
  it('runs a call whose claim went through though its commit reported an error, so the site gets an answer', async () => {
    fake.state.ambiguousCommits = 1
    await start([fake.call('c1', 1000)])
    expect(fake.saveProfile).toHaveBeenCalledTimes(1)
    expect(fake.state.calls.get('c1')).toMatchObject({ state: 'done', result: { ok: true } })
  })

  it('still runs a call only once when it is handed over twice (a replayed snapshot)', async () => {
    fake.state.ambiguousCommits = 1
    const ref = fake.call('c1', 1000)
    await start([ref, ref])
    expect(fake.saveProfile).toHaveBeenCalledTimes(1)
    expect(fake.state.calls.get('c1')).toMatchObject({ state: 'done' })
  })

  it('never runs a call someone else claimed', async () => {
    await start([fake.call('c1', 1000, { state: 'running', runner: 'another', claim: 'another' })])
    expect(fake.saveProfile).not.toHaveBeenCalled()
    expect(fake.state.calls.get('c1')).toMatchObject({ state: 'running', runner: 'another' })
  })

  it('lets an old call expire, and never runs it when that commit reported an error', async () => {
    fake.state.ambiguousCommits = 1
    await start([fake.call('c1', 60_000)])
    expect(fake.saveProfile).not.toHaveBeenCalled()
    expect(fake.state.calls.get('c1')).toMatchObject({ state: 'expired' })
  })
})

describe('reads at startup', () => {
  it('logs a failed first clean-up of old calls, and carries on', async () => {
    fake.state.failing.set('calls', 1)
    await start()
    expect(unhandled).toEqual([])
    expect(console.log).toHaveBeenCalledWith(expect.any(String), '[local-backend]', 'cleanup failed:', expect.objectContaining({ code: 14 }))
    expect(fake.state.unsubscribed).toBe(0)
  })

  it.each([
    // The likes and comments listeners both read every post
    { read: 'groups', failures: 1, path: 'groups/g1', counts: { memberCount: 2 } },
    { read: 'group:posts', failures: 2, path: 'groups/g1/posts/p1', counts: { likeCount: 2, commentCount: 2 } },
  ])('recounts everything once a failed first read of $read works again', async ({ read, failures, path, counts }) => {
    fake.state.failing.set(read, failures)
    await start()
    expect(unhandled).toEqual([])
    // retrying's first wait, then the second the counters collect paths for
    await vi.advanceTimersByTimeAsync(5000 + 1000)
    expect(fake.state.updates).toContainEqual({ path, data: counts })
  })

  it('clears friendships left behind once a failed first read works again', async () => {
    fake.state.failing.set('friendships', 1)
    await start()
    expect(unhandled).toEqual([])
    expect(fake.mirrorFriendshipOf).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.mirrorFriendshipOf).toHaveBeenCalledWith('a_b')
  })
})
