import { describe, expect, it } from 'vitest'
import { outcomeNote } from './reviewOutcome'

describe('outcomeNote', () => {
  it('says nothing when Approve or Remove did what its button says', () => {
    expect(outcomeNote('published', 'post')).toBeNull()
    expect(outcomeNote('restored', 'comment')).toBeNull()
    expect(outcomeNote('kept', 'dm')).toBeNull()
    expect(outcomeNote('kept', 'profile')).toBeNull()
    expect(outcomeNote('removed', 'groupMessage')).toBeNull()
    expect(outcomeNote('removed', 'profile')).toBeNull()
  })

  it('says nothing to an older backend that leaves the outcome out', () => {
    expect(outcomeNote(undefined, 'dm')).toBeNull()
  })

  it('says an approved private note was never delivered, and why', () => {
    expect(outcomeNote('undelivered', 'dm')).toBe('Approved, but not delivered: they’re no longer connected, so it stays held.')
    expect(outcomeNote('undelivered', 'chatMessage')).toBe('Approved, but not delivered: the writer is no longer in the chat, so it stays held.')
  })

  it('says when the writer had already withdrawn it', () => {
    expect(outcomeNote('withdrawn', 'post')).toBe('The writer had already withdrawn this, so nothing changed.')
  })

  it('says when there was nothing left to approve, remove or reset', () => {
    expect(outcomeNote('gone', 'comment')).toBe('This had already been taken down or deleted, so nothing changed.')
    expect(outcomeNote('gone', 'profile')).toBe('Their account is gone, so there was nothing to reset.')
  })

  it('says when another moderator got there first', () => {
    expect(outcomeNote('already-resolved', 'post')).toBe('Another moderator already dealt with this, so nothing changed.')
    expect(outcomeNote('already-resolved', 'profile')).toBe('Another moderator already dealt with this, so nothing changed.')
  })
})
