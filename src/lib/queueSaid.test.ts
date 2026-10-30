import { describe, expect, it } from 'vitest'
import type { ModOutcome } from './callables'
import { outcomeNote } from './reviewOutcome'
import { queueSaid } from './queueSaid'
import type { QueueItem } from './types'

const KINDS: QueueItem['kind'][] = ['post', 'comment', 'groupMessage', 'dm', 'chatMessage', 'profile']
const OUTCOMES: ModOutcome[] = ['published', 'restored', 'undelivered', 'paused', 'kept', 'removed', 'withdrawn', 'gone', 'already-resolved']

describe('queueSaid', () => {
  // The entry leaves the queue whatever came of it, so a screen reader hears only this
  it('says something, naming the entry, for every outcome of every kind', () => {
    for (const kind of KINDS) {
      for (const outcome of OUTCOMES) {
        expect(queueSaid('Group post · Bramble', kind, 'approve', outcome)).toMatch(/^Group post · Bramble — \S/)
      }
    }
  })

  it('says what Approve or Remove did when it did what its button says', () => {
    expect(queueSaid('Group post · Bramble', 'post', 'approve', 'published')).toBe('Group post · Bramble — Approved and published.')
    expect(queueSaid('Private note · Bramble', 'dm', 'approve', 'published')).toBe('Private note · Bramble — Approved and delivered.')
    expect(queueSaid('Comment · Bramble', 'comment', 'approve', 'restored')).toBe('Comment · Bramble — Kept up. It’s showing again.')
    expect(queueSaid('Private chat note · Bramble', 'chatMessage', 'approve', 'kept')).toBe('Private chat note · Bramble — Kept up.')
    expect(queueSaid('Profile · Bramble', 'profile', 'approve', 'kept')).toBe('Profile · Bramble — Kept as it is.')
    expect(queueSaid('Group talk · Bramble', 'groupMessage', 'remove', 'removed')).toBe('Group talk · Bramble — Removed. They’ll find a note in Notifications.')
    expect(queueSaid('Profile · Bramble', 'profile', 'remove', 'removed')).toBe('Profile · Bramble — Profile reset. They’ll find a note in Notifications.')
  })

  it('says what outcomeNote says when it didn’t do what its button says', () => {
    for (const outcome of ['undelivered', 'paused', 'withdrawn', 'gone', 'already-resolved'] as const) {
      expect(queueSaid('Private note · Bramble', 'dm', 'approve', outcome)).toBe(`Private note · Bramble — ${outcomeNote(outcome, 'dm')}`)
      expect(queueSaid('Profile · Bramble', 'profile', 'remove', outcome)).toBe(`Profile · Bramble — ${outcomeNote(outcome, 'profile')}`)
    }
  })

  it('says what was pressed to an older backend that leaves the outcome out', () => {
    expect(queueSaid('Group post · Bramble', 'post', 'approve')).toBe('Group post · Bramble — Approved.')
    expect(queueSaid('Group post · Bramble', 'post', 'remove')).toBe('Group post · Bramble — Removed.')
    expect(queueSaid('Profile · Bramble', 'profile', 'remove')).toBe('Profile · Bramble — Profile reset.')
  })
})
