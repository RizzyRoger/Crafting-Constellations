import { describe, expect, it } from 'vitest'
import { mayRelease, reportedName, resetNames, type NameRecord } from './profilePolicy.js'

describe('mayRelease', () => {
  it('frees the person’s own claim', () => {
    expect(mayRelease({ uid: 'u1' }, 'u1')).toBe(true)
  })

  it('keeps a name a moderator retired', () => {
    expect(mayRelease({ retired: true }, 'u1')).toBe(false)
    expect(mayRelease({ uid: 'u1', retired: true }, 'u1')).toBe(false)
  })

  it('keeps a claim someone else holds', () => {
    expect(mayRelease({ uid: 'u2' }, 'u1')).toBe(false)
  })

  it('has nothing to free when there is no claim', () => {
    expect(mayRelease(undefined, 'u1')).toBe(false)
    expect(mayRelease({}, 'u1')).toBe(false)
  })
})

describe('reportedName', () => {
  it('is the name the moderator was shown, kept as saveProfile keeps it', () => {
    expect(reportedName('Bad  Name', 'plain fern')).toBe('bad name')
    expect(reportedName('O’Neil', 'plain fern')).toBe("o'neil")
  })

  it('falls back to the name they go by now when the queue item kept none', () => {
    expect(reportedName(undefined, 'bad name')).toBe('bad name')
    expect(reportedName('  ', 'bad name')).toBe('bad name')
    expect(reportedName(undefined, undefined)).toBeUndefined()
  })
})

describe('resetNames', () => {
  const records = (entries: Record<string, NameRecord | undefined>) => new Map(Object.entries(entries))

  it('retires the name they still go by when it is the one reported', () => {
    expect(resetNames('u1', 'bad name', 'bad name', records({ 'bad name': { uid: 'u1' } }))).toEqual({ retire: 'bad name', free: undefined })
  })

  it('retires the reported name they renamed away from, and frees the one nobody judged', () => {
    expect(resetNames('u1', 'bad name', 'plain fern', records({ 'bad name': undefined, 'plain fern': { uid: 'u1' } }))).toEqual({
      retire: 'bad name',
      free: 'plain fern',
    })
  })

  it('leaves the reported name with someone who has taken it since', () => {
    expect(resetNames('u1', 'bad name', 'plain fern', records({ 'bad name': { uid: 'u2' }, 'plain fern': { uid: 'u1' } }))).toEqual({
      retire: undefined,
      free: 'plain fern',
    })
  })

  it('frees only a current name that is still their own', () => {
    expect(resetNames('u1', 'bad name', 'plain fern', records({ 'plain fern': { uid: 'u2' } })).free).toBeUndefined()
    expect(resetNames('u1', 'bad name', 'plain fern', records({ 'plain fern': { retired: true } })).free).toBeUndefined()
  })

  it('has nothing to do for a profile with no name', () => {
    expect(resetNames('u1', undefined, undefined, records({}))).toEqual({ retire: undefined, free: undefined })
  })
})
