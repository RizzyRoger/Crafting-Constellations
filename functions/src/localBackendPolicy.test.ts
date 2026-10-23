import { beforeEach, describe, expect, it, vi } from 'vitest'
import { earliestFirst, listParam, namesAnyone, statusBefore } from './localBackendPolicy.js'
import { MISSED_ACCEPT_MS } from './notifyPolicy.js'

describe('statusBefore', () => {
  const now = 1_000_000_000_000

  it('is the status the backend saw, whenever it saw one', () => {
    expect(statusBefore('pending', 'accepted', now - 1000, now)).toBe('pending')
    // The same acceptance delivered again: no second notice
    expect(statusBefore('accepted', 'accepted', now - 1000, now)).toBe('accepted')
  })

  it('counts a recent acceptance it never saw asked as pending', () => {
    expect(statusBefore(undefined, 'accepted', now - 60_000, now)).toBe('pending')
    expect(statusBefore(undefined, 'accepted', now, now)).toBe('pending')
  })

  it('leaves new requests, old acceptances and undated ones be', () => {
    expect(statusBefore(undefined, 'pending', now - 60_000, now)).toBeUndefined()
    expect(statusBefore(undefined, 'accepted', now - MISSED_ACCEPT_MS - 1, now)).toBeUndefined()
    expect(statusBefore(undefined, 'accepted', undefined, now)).toBeUndefined()
    expect(statusBefore(undefined, undefined, undefined, now)).toBeUndefined()
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
