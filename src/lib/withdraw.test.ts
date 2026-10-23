import { FirebaseError } from 'firebase/app'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canWithdraw, withdraw } from './withdraw'

// The write is a stand-in: it takes the change or refuses it, as the rules would
const fake = vi.hoisted(() => ({ refuse: false, writes: [] as { path: string; data: unknown }[] }))

vi.mock('./firebase', () => ({ db: {}, auth: {}, functions: {}, LOCAL_BACKEND: false }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  updateDoc: async (ref: { path: string }, data: unknown) => {
    if (fake.refuse) throw new FirebaseError('permission-denied', 'Missing or insufficient permissions.')
    fake.writes.push({ path: ref.path, data })
  },
}))

beforeEach(() => {
  fake.refuse = false
  fake.writes = []
})

describe('canWithdraw', () => {
  it('matches the rules: pending, published and held writing can be taken back', () => {
    expect(['pending', 'published', 'held'].map((s) => canWithdraw(s as never))).toEqual([true, true, true])
  })

  it('writing already withdrawn or removed cannot', () => {
    expect(canWithdraw('withdrawn')).toBe(false)
    expect(canWithdraw('removed')).toBe(false)
  })
})

describe('withdraw', () => {
  it('sets the status and reports nothing wrong', async () => {
    await expect(withdraw('groups/g/posts/p')).resolves.toBeNull()
    expect(fake.writes).toEqual([{ path: 'groups/g/posts/p', data: { status: 'withdrawn' } }])
  })

  it('resolves to why a refusal happened instead of rejecting into the console', async () => {
    fake.refuse = true
    await expect(withdraw('groups/g/posts/p')).resolves.toBe('You can’t do that here.')
  })
})
