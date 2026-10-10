import { describe, expect, it } from 'vitest'
import { commentRecipient, pickMentioned, requestedMentions, type Reader } from './notifyPolicy.js'

const reader = (uid: string, penName: string | undefined, patch: Partial<Reader> = {}): Reader => ({
  uid,
  penName,
  banned: false,
  canRead: true,
  blocked: false,
  ...patch,
})

describe('requestedMentions', () => {
  it('keeps unique uids, never the writer, at most ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => `u${i}`)
    expect(requestedMentions(['a', 'a', 'me', 'b'], 'me')).toEqual(['a', 'b'])
    expect(requestedMentions(many, 'me')).toHaveLength(10)
  })

  it('ignores anything that is not a list of short strings', () => {
    expect(requestedMentions('a', 'me')).toEqual([])
    expect(requestedMentions(undefined, 'me')).toEqual([])
    expect(requestedMentions([1, null, '', 'x'.repeat(129), 'ok'], 'me')).toEqual(['ok'])
  })
})

describe('pickMentioned', () => {
  const readers = new Map(
    [
      reader('fern', 'Fern'),
      reader('heron', 'Quiet Heron'),
      reader('left', 'Left Group', { canRead: false }),
      reader('blocked', 'Blocked One', { blocked: true }),
      reader('banned', 'Paused One', { banned: true }),
      reader('gone', undefined),
    ].map((r) => [r.uid, r]),
  )

  it('pings people who were picked and are named in the words', () => {
    expect(pickMentioned('@Fern and @quiet heron, thank you', ['fern', 'heron'], readers)).toEqual([
      { uid: 'fern', penName: 'Fern' },
      { uid: 'heron', penName: 'Quiet Heron' },
    ])
  })

  it('drops a pick whose name was deleted from the words', () => {
    expect(pickMentioned('thank you', ['fern'], readers)).toEqual([])
  })

  it('never pings someone who can’t read it, is blocked, is paused, or is gone', () => {
    const text = '@Left Group @Blocked One @Paused One @Someone'
    expect(pickMentioned(text, ['left', 'blocked', 'banned', 'gone', 'unknown'], readers)).toEqual([])
  })

  it('only pings people the writer picked, even if another name appears', () => {
    expect(pickMentioned('@Fern @Quiet Heron', ['fern'], readers)).toEqual([{ uid: 'fern', penName: 'Fern' }])
  })
})

describe('commentRecipient', () => {
  it('tells the post’s writer about a comment', () => {
    expect(commentRecipient(reader('poster', 'Poster'), 'commenter', [])).toBe('poster')
  })

  it('stays quiet on your own post, when already pinged, or when they can’t read it', () => {
    expect(commentRecipient(reader('poster', 'Poster'), 'poster', [])).toBeNull()
    expect(commentRecipient(reader('poster', 'Poster'), 'commenter', [{ uid: 'poster', penName: 'Poster' }])).toBeNull()
    expect(commentRecipient(reader('poster', 'Poster', { canRead: false }), 'commenter', [])).toBeNull()
    expect(commentRecipient(reader('poster', 'Poster', { blocked: true }), 'commenter', [])).toBeNull()
    expect(commentRecipient(reader('poster', undefined), 'commenter', [])).toBeNull()
    expect(commentRecipient(undefined, 'commenter', [])).toBeNull()
  })
})
