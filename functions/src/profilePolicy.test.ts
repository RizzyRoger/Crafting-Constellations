import { describe, expect, it } from 'vitest'
import { mayRelease } from './profilePolicy.js'

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
