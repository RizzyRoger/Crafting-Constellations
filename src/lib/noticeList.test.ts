import { describe, expect, it } from 'vitest'
import { BATCH_LIMIT, inBatches, withUnseen } from './noticeList'

const notice = (id: string, ms: number | null) => ({ id, createdAt: ms === null ? null : { toMillis: () => ms } })

const ids = (list: { id: string }[]) => list.map((n) => n.id)

describe('withUnseen', () => {
  it('adds unseen notices older than the newest page after it, newest first', () => {
    const latest = [notice('a', 50), notice('b', 40)]
    const unseen = [notice('b', 40), notice('old2', 10), notice('old1', 20)]
    expect(ids(withUnseen(latest, unseen, 50))).toEqual(['a', 'b', 'old1', 'old2'])
  })

  it('lists a notice in both only once', () => {
    const latest = [notice('a', 50), notice('b', 40)]
    expect(ids(withUnseen(latest, latest, 50))).toEqual(['a', 'b'])
  })

  it('keeps the newest of the older unseen ones when there are more than `extra`', () => {
    const latest = [notice('a', 100)]
    const unseen = Array.from({ length: 5 }, (_, i) => notice(`u${i}`, 50 - i))
    expect(ids(withUnseen(latest, unseen, 2))).toEqual(['a', 'u0', 'u1'])
  })

  it('puts one that just came in first, before the newest page has caught up with it', () => {
    const latest = [notice('a', 50)]
    expect(ids(withUnseen(latest, [notice('fresh', 60)], 50))).toEqual(['fresh', 'a'])
  })

  it('puts one with no time yet first', () => {
    expect(ids(withUnseen([notice('a', 50)], [notice('pending', null)], 50))).toEqual(['pending', 'a'])
  })
})

describe('inBatches', () => {
  it('splits into runs of at most one batch', () => {
    const items = Array.from({ length: 1200 }, (_, i) => i)
    const runs = inBatches(items)
    expect(runs.map((run) => run.length)).toEqual([BATCH_LIMIT, BATCH_LIMIT, 200])
    expect(runs.flat()).toEqual(items)
  })

  it('makes no runs from nothing', () => {
    expect(inBatches([])).toEqual([])
  })

  it('keeps a short list in one run', () => {
    expect(inBatches(['a', 'b'], 500)).toEqual([['a', 'b']])
  })
})
