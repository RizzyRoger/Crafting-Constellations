import { describe, expect, it } from 'vitest'
import { confirmMatches, isPairOf, isRecentSignIn, pairOfDmPath, RECENT_SIGN_IN_SECONDS, underPath } from './accountPolicy.js'

describe('isRecentSignIn', () => {
  const now = 1_800_000_000

  it('accepts a sign-in within the window', () => {
    expect(isRecentSignIn(now - 10, now)).toBe(true)
    expect(isRecentSignIn(now - RECENT_SIGN_IN_SECONDS, now)).toBe(true)
  })

  it('refuses an older sign-in, or a missing auth_time', () => {
    expect(isRecentSignIn(now - RECENT_SIGN_IN_SECONDS - 1, now)).toBe(false)
    expect(isRecentSignIn(undefined, now)).toBe(false)
    expect(isRecentSignIn('1800000000', now)).toBe(false)
  })
})

describe('confirmMatches', () => {
  it('matches the pen name regardless of case and spacing', () => {
    expect(confirmMatches('Quiet Heron', 'quiet heron')).toBe(true)
    expect(confirmMatches('  quiet   HERON ', 'quiet heron')).toBe(true)
  })

  it('matches a curly apostrophe against the plain one', () => {
    expect(confirmMatches('O’Neil', "o'neil")).toBe(true)
  })

  it('refuses a different name, an empty answer, or a non-string', () => {
    expect(confirmMatches('Quiet Hero', 'quiet heron')).toBe(false)
    expect(confirmMatches('', 'quiet heron')).toBe(false)
    expect(confirmMatches(undefined, 'quiet heron')).toBe(false)
  })

  it('asks for the word "delete" when there is no profile yet', () => {
    expect(confirmMatches('Delete', undefined)).toBe(true)
    expect(confirmMatches('quiet heron', undefined)).toBe(false)
  })

  it('does not accept "delete" in place of a pen name', () => {
    expect(confirmMatches('delete', 'quiet heron')).toBe(false)
  })
})

describe('underPath', () => {
  const [start, end] = underPath('groups/g1/posts/p1')

  it('covers comments under the post', () => {
    const comment = 'groups/g1/posts/p1/comments/c9'
    expect(comment >= start && comment < end).toBe(true)
  })

  it('excludes the post itself and its siblings', () => {
    for (const path of ['groups/g1/posts/p1', 'groups/g1/posts/p10/comments/c1', 'groups/g1/posts/p2']) {
      expect(path >= start && path < end).toBe(false)
    }
  })
})

describe('pairOfDmPath', () => {
  it('finds the pair of a private line', () => {
    expect(pairOfDmPath('dms/alice_bob/messages/m1')).toBe('alice_bob')
  })

  it('ignores group talk', () => {
    expect(pairOfDmPath('groups/g1/messages/m1')).toBeUndefined()
  })
})

describe('isPairOf', () => {
  it('finds either person in a private thread', () => {
    expect(isPairOf('alice_bob', 'alice')).toBe(true)
    expect(isPairOf('alice_bob', 'bob')).toBe(true)
  })

  it('needs the whole uid, and a thread of two', () => {
    expect(isPairOf('alice_bob', 'al')).toBe(false)
    expect(isPairOf('alice_bob', 'alice_bob')).toBe(false)
    expect(isPairOf('alice', 'alice')).toBe(false)
    expect(isPairOf('alice_bob_carol', 'alice')).toBe(false)
  })
})
