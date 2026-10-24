import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { earliestFirst, firebaseConfigFor, listParam, namesAnyone, statusBefore, underWay, userOrNone } from './localBackendPolicy.js'
import { MISSED_ACCEPT_MS } from './notifyPolicy.js'

describe('statusBefore', () => {
  const now = 1_000_000_000_000

  const seen = (status: string, updatedAtMs?: number) => ({ status, updatedAtMs })

  it('is the status the backend saw asked, or the acceptance it saw', () => {
    expect(statusBefore(seen('pending', now - 60_000), 'accepted', now - 1000, now)).toBe('pending')
    // The same acceptance delivered again: no second notice
    expect(statusBefore(seen('accepted', now - 1000), 'accepted', now - 1000, now)).toBe('accepted')
    expect(statusBefore(seen('accepted'), 'accepted', undefined, now)).toBe('accepted')
    expect(statusBefore(seen('accepted', now - 1000), 'blocked', now, now)).toBe('accepted')
    expect(statusBefore(seen('pending', now - 1000), 'pending', now - 1000, now)).toBe('pending')
  })

  it('counts a recent acceptance it never saw asked as pending', () => {
    expect(statusBefore(undefined, 'accepted', now - 60_000, now)).toBe('pending')
    expect(statusBefore(undefined, 'accepted', now, now)).toBe('pending')
  })

  it('counts a recent acceptance other than the one it saw as pending: the two parted and were asked and accepted again', () => {
    expect(statusBefore(seen('accepted', now - 10 * 60_000), 'accepted', now - 1000, now)).toBe('pending')
    // Unblocked, asked and accepted again
    expect(statusBefore(seen('blocked', now - 10 * 60_000), 'accepted', now - 1000, now)).toBe('pending')
  })

  it('leaves new requests, old acceptances and undated ones be', () => {
    expect(statusBefore(undefined, 'pending', now - 60_000, now)).toBeUndefined()
    expect(statusBefore(undefined, 'accepted', now - MISSED_ACCEPT_MS - 1, now)).toBeUndefined()
    expect(statusBefore(undefined, 'accepted', undefined, now)).toBeUndefined()
    expect(statusBefore(undefined, undefined, undefined, now)).toBeUndefined()
    expect(statusBefore(seen('accepted', now - MISSED_ACCEPT_MS - 60_000), 'accepted', now - MISSED_ACCEPT_MS - 1, now)).toBe('accepted')
    expect(statusBefore(seen('accepted', now - 60_000), 'accepted', undefined, now)).toBe('accepted')
  })
})

describe('listParam', () => {
  it('reads an unset list as its default, empty, the way the Firebase CLI does', () => {
    expect(JSON.parse(listParam(undefined))).toEqual([])
  })

  it('turns a comma-separated .env line into JSON', () => {
    expect(JSON.parse(listParam(' a@example.test, B@example.test ,'))).toEqual(['a@example.test', 'B@example.test'])
    expect(JSON.parse(listParam(''))).toEqual([])
  })

  it('passes JSON through', () => {
    expect(listParam('["a@example.test"]')).toBe('["a@example.test"]')
  })
})

describe('namesAnyone', () => {
  it('is true once the list has an email', () => {
    expect(namesAnyone(listParam('a@example.test'))).toBe(true)
    expect(namesAnyone('["a@example.test"]')).toBe(true)
  })

  it('is false for an unset list, and for the empty line functions/.env.example holds', () => {
    expect(namesAnyone(listParam(undefined))).toBe(false)
    expect(namesAnyone(listParam(''))).toBe(false)
    expect(namesAnyone(listParam(' , '))).toBe(false)
  })

  it('is false for lists the params loader reads as empty, or that match no email', () => {
    expect(namesAnyone('[]')).toBe(false)
    expect(namesAnyone('["  "]')).toBe(false)
    expect(namesAnyone('["a@example.test", 1]')).toBe(false)
    expect(namesAnyone('[a@example.test')).toBe(false)
  })
})

describe('earliestFirst', () => {
  // Work that takes `ms`, noting when it starts and ends
  const steps: string[] = []
  const step = (name: string, ms = 0, fail = false) => async () => {
    steps.push(`start ${name}`)
    await new Promise((resolve) => setTimeout(resolve, ms))
    steps.push(`end ${name}`)
    if (fail) throw new Error(name)
  }
  const ran = (count: number) => vi.waitFor(() => expect(steps).toHaveLength(count * 2))
  beforeEach(() => {
    steps.length = 0
  })

  it('runs work handed over together earliest first, never two at once', async () => {
    const inTurn = earliestFirst()
    // Handed over newest first, as a snapshot lists ids; the earliest is the slowest
    inTurn('a', 3, step('a3', 0))
    inTurn('a', 2, step('a2', 10))
    inTurn('a', 1, step('a1', 30))
    await ran(3)
    expect(steps).toEqual(['start a1', 'end a1', 'start a2', 'end a2', 'start a3', 'end a3'])
  })

  it('takes the earliest of what waits once the running work ends', async () => {
    const inTurn = earliestFirst()
    inTurn('a', 5, step('a5', 30))
    // A burst split across snapshots: the rest arrives while a5 runs
    await new Promise((resolve) => setTimeout(resolve, 5))
    inTurn('a', 9, step('a9'))
    inTurn('a', 1, step('a1'))
    await ran(3)
    expect(steps).toEqual(['start a5', 'end a5', 'start a1', 'end a1', 'start a9', 'end a9'])
  })

  it('runs different keys side by side', async () => {
    const inTurn = earliestFirst()
    inTurn('a', 1, step('a1', 20))
    inTurn('b', 2, step('b2', 0))
    await ran(2)
    expect(steps).toEqual(['start a1', 'start b2', 'end b2', 'end a1'])
  })

  it('carries on after a failure, and after going quiet', async () => {
    const inTurn = earliestFirst()
    inTurn('a', 1, step('a1', 0, true))
    inTurn('a', 2, step('a2'))
    await ran(2)
    inTurn('a', 3, step('a3'))
    await ran(3)
    expect(steps).toEqual(['start a1', 'end a1', 'start a2', 'end a2', 'start a3', 'end a3'])
  })
})

describe('userOrNone', () => {
  const failure = (code?: string) => Object.assign(new Error('lookup failed'), code === undefined ? {} : { code })

  it('is the account Auth found', async () => {
    await expect(userOrNone(Promise.resolve({ uid: 'u1' }))).resolves.toEqual({ uid: 'u1' })
  })

  it('is none for an account Auth has no record of, so the caller is asked to sign in', async () => {
    await expect(userOrNone(Promise.reject(failure('auth/user-not-found')))).resolves.toBeNull()
  })

  it('passes on any other failure, so a signed-in caller isn’t told to sign in when Auth can’t answer', async () => {
    for (const error of [failure('auth/internal-error'), failure('app/network-error'), failure('app/invalid-credential'), failure()]) {
      await expect(userOrNone(Promise.reject(error))).rejects.toBe(error)
    }
  })
})

describe('firebaseConfigFor', () => {
  const project = 'demo-project'
  // What firebase emulators:exec hands every script it runs
  const fromEmulatorsExec = JSON.stringify({ projectId: project, storageBucket: `${project}.appspot.com`, databaseURL: `https://${project}.firebaseio.com` })
  const emulators = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }

  it('names just the project when none is given, with no Storage bucket, as on the NUC', () => {
    expect(JSON.parse(firebaseConfigFor(project, {}))).toEqual({ projectId: project })
    expect(JSON.parse(firebaseConfigFor(project, emulators))).toEqual({ projectId: project })
  })

  it('drops the bucket emulators:exec names when no Storage emulator runs, so nothing reaches the real Cloud Storage', () => {
    expect(JSON.parse(firebaseConfigFor(project, { ...emulators, FIREBASE_CONFIG: fromEmulatorsExec }))).toEqual({ projectId: project })
  })

  it('keeps a config beside the Storage emulator, and one set for the real project', () => {
    expect(firebaseConfigFor(project, { ...emulators, FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199', FIREBASE_CONFIG: fromEmulatorsExec })).toBe(fromEmulatorsExec)
    expect(firebaseConfigFor(project, { FIREBASE_CONFIG: fromEmulatorsExec })).toBe(fromEmulatorsExec)
  })
})

describe('underWay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const after = (ms: number, fail = false) => new Promise<void>((resolve, reject) => setTimeout(() => (fail ? reject(new Error('failed')) : resolve()), ms))
  // What settle leaves once it resolves; undefined while it waits
  const settled = (work: ReturnType<typeof underWay<string>>, ms: number) => {
    const seen: { left?: string[] } = {}
    void work.settle(ms).then((left) => (seen.left = left))
    return seen
  }

  it('waits for work under way to end, failed or not', async () => {
    const work = underWay<string>()
    work.add('a', after(1_000))
    work.add('b', after(2_000, true))
    const seen = settled(work, 60_000)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(seen.left).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(seen.left).toEqual([])
  })

  it('stops waiting after a while, and names what is still going', async () => {
    const work = underWay<string>()
    work.add('quick', after(1_000))
    work.add('slow', after(120_000))
    const seen = settled(work, 60_000)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(seen.left).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(seen.left).toEqual(['slow'])
  })

  it('has nothing to wait for once its work has ended', async () => {
    const work = underWay<string>()
    work.add('a', after(10))
    await vi.advanceTimersByTimeAsync(10)
    const seen = settled(work, 60_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(seen.left).toEqual([])
  })
})
