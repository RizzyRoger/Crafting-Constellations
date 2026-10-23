import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listenToProfile } from './AuthProvider'

// Firestore that records the profile listen and lets a test answer it, from the cache or the server
const fs = vi.hoisted(() => ({
  path: '',
  options: undefined as unknown,
  next: (_snap: unknown) => {},
  refuse: (_error: Error) => {},
}))

vi.mock('../lib/firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: (ref: { path: string }, options: unknown, next: (snap: unknown) => void, refuse: (error: Error) => void) => {
    Object.assign(fs, { path: ref.path, options, next, refuse })
    return () => {}
  },
}))

const snap = (fromCache: boolean, data?: Record<string, unknown>) => ({
  id: 'u1',
  exists: () => data !== undefined,
  data: () => data,
  metadata: { fromCache, hasPendingWrites: false },
})

let heard: unknown[] = []

beforeEach(() => {
  heard = []
  listenToProfile('u1', (profile) => heard.push(profile))
})

describe('listenToProfile', () => {
  it('listens to their profile, metadata too, so the server’s answer is heard after the cache’s', () => {
    expect(fs.path).toBe('users/u1')
    expect(fs.options).toEqual({ includeMetadataChanges: true })
  })

  it('takes no "none" from the cache alone: offline, a returning person waits rather than choosing a new pen name', () => {
    fs.next(snap(true))
    expect(heard).toEqual([])
  })

  it('takes the server’s "none", after the cache’s, so someone new goes on to choose one', () => {
    fs.next(snap(true))
    fs.next(snap(false))
    expect(heard).toEqual([null])
  })

  it('takes a profile wherever it comes from', () => {
    fs.next(snap(true, { penName: 'Ash' }))
    fs.next(snap(false, { penName: 'Ash' }))
    expect(heard).toEqual([
      { id: 'u1', penName: 'Ash' },
      { id: 'u1', penName: 'Ash' },
    ])
  })

  it('takes the server’s "none" once the profile is gone', () => {
    fs.next(snap(false, { penName: 'Ash' }))
    fs.next(snap(false))
    expect(heard).toEqual([{ id: 'u1', penName: 'Ash' }, null])
  })

  it('answers none when the listen is refused, as before', () => {
    fs.refuse(new Error('permission-denied'))
    expect(heard).toEqual([null])
  })
})
