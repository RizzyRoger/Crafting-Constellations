import { describe, expect, it } from 'vitest'
import { approvalOf, crisisOnPublish, leftAsIs, licenceOpen, MAX_NOTE, moderatorNote, outcomeOf, removalOf } from './adminPolicy.js'

describe('approvalOf', () => {
  const at = { seconds: 1, nanoseconds: 0 }

  it('publishes writing automod held before it ever went out', () => {
    expect(approvalOf({ kind: 'post', authorUid: 'w' })).toBe('publish')
    expect(approvalOf({ kind: 'comment', authorUid: 'w' })).toBe('publish')
    expect(approvalOf({ kind: 'groupMessage', authorUid: 'w' })).toBe('publish')
  })

  it('restores writing reports hid after it was published, so nobody is pinged twice', () => {
    expect(approvalOf({ kind: 'comment', authorUid: 'w', publishedAt: at })).toBe('restore')
    // Its readers already had it, so a writer who has since left the chat changes nothing
    expect(approvalOf({ kind: 'chatMessage', authorUid: 'w', publishedAt: at, chatUids: ['x', 'y'] })).toBe('restore')
  })

  it('delivers a private note only while the two are still connected', () => {
    expect(approvalOf({ kind: 'dm', authorUid: 'w', connectionStatus: 'accepted' })).toBe('publish')
    expect(approvalOf({ kind: 'dm', authorUid: 'w', connectionStatus: 'blocked' })).toBe('undeliverable')
    expect(approvalOf({ kind: 'dm', authorUid: 'w', connectionStatus: 'pending' })).toBe('undeliverable')
    expect(approvalOf({ kind: 'dm', authorUid: 'w' })).toBe('undeliverable')
  })

  it('delivers a chat note only while its writer is still in the chat', () => {
    expect(approvalOf({ kind: 'chatMessage', authorUid: 'w', chatUids: ['w', 'x', 'y'] })).toBe('publish')
    expect(approvalOf({ kind: 'chatMessage', authorUid: 'w', chatUids: ['x', 'y'] })).toBe('undeliverable')
    expect(approvalOf({ kind: 'chatMessage', authorUid: 'w' })).toBe('undeliverable')
    expect(approvalOf({ kind: 'chatMessage', authorUid: 'w', chatUids: 'w' })).toBe('undeliverable')
  })

  it('keeps held writing from a banned writer held, wherever it was written', () => {
    expect(approvalOf({ kind: 'dm', authorUid: 'w', connectionStatus: 'accepted', authorBanned: true })).toBe('paused')
    expect(approvalOf({ kind: 'post', authorUid: 'w', authorBanned: true })).toBe('paused')
    expect(approvalOf({ kind: 'comment', authorUid: 'w', authorBanned: true })).toBe('paused')
    expect(approvalOf({ kind: 'groupMessage', authorUid: 'w', authorBanned: true })).toBe('paused')
    // A ban takes them off the chat too, and the ban is the reason to give
    expect(approvalOf({ kind: 'chatMessage', authorUid: 'w', chatUids: ['x'], authorBanned: true })).toBe('paused')
    expect(approvalOf({ kind: 'post', authorUid: 'w', authorBanned: false })).toBe('publish')
  })

  it('restores writing of a banned writer that went out before, as a ban leaves the rest of it up', () => {
    expect(approvalOf({ kind: 'comment', authorUid: 'w', publishedAt: at, authorBanned: true })).toBe('restore')
  })

  it('never delivers a note its writer was told would not arrive, though the two connect again', () => {
    expect(approvalOf({ kind: 'dm', authorUid: 'w', connectionStatus: 'accepted', undelivered: true })).toBe('undeliverable')
    expect(approvalOf({ kind: 'dm', authorUid: 'w', connectionStatus: 'accepted', undelivered: false })).toBe('publish')
  })
})

describe('crisisOnPublish', () => {
  it('marks crisis language in a private note or chat, so both people get resources', () => {
    expect(crisisOnPublish({ kind: 'dm', heldReason: 'crisis' })).toBe(true)
    expect(crisisOnPublish({ kind: 'chatMessage', heldReason: 'crisis' })).toBe(true)
    expect(crisisOnPublish({ kind: 'dm', automodCrisis: true })).toBe(true)
  })

  it('never marks group writing, whose crisis holds are for the writer alone', () => {
    for (const kind of ['post', 'comment', 'groupMessage']) {
      expect(crisisOnPublish({ kind, heldReason: 'crisis', automodCrisis: true })).toBe(false)
    }
  })

  it('leaves a note held for anything else unmarked', () => {
    expect(crisisOnPublish({ kind: 'dm', heldReason: 'review', automodCrisis: false })).toBe(false)
    expect(crisisOnPublish({ kind: 'chatMessage' })).toBe(false)
  })
})

describe('removalOf', () => {
  it('takes down writing that is up, held or waiting', () => {
    expect(removalOf('published')).toBe('remove')
    expect(removalOf('held')).toBe('remove')
    expect(removalOf('pending')).toBe('remove')
  })

  it('leaves writing its writer withdrew as theirs to have taken down', () => {
    expect(removalOf('withdrawn')).toBe('withdrawn')
  })

  it('has nothing to take down once it is removed or deleted', () => {
    expect(removalOf('removed')).toBe('gone')
    expect(removalOf(undefined)).toBe('gone')
  })
})

describe('outcomeOf', () => {
  it('tells the moderator what Approve did with held writing', () => {
    expect(outcomeOf('publish')).toBe('published')
    expect(outcomeOf('restore')).toBe('restored')
    expect(outcomeOf('undeliverable')).toBe('undelivered')
    expect(outcomeOf('paused')).toBe('paused')
  })

  it('tells the moderator what Remove did, and when there was nothing to take down', () => {
    expect(outcomeOf('remove')).toBe('removed')
    expect(outcomeOf('withdrawn')).toBe('withdrawn')
    expect(outcomeOf('gone')).toBe('gone')
  })
})

describe('leftAsIs', () => {
  it('keeps up writing that is already up', () => {
    expect(leftAsIs('published')).toBe('kept')
  })

  it('says why approving writing that is already down changed nothing', () => {
    expect(leftAsIs('withdrawn')).toBe('withdrawn')
    expect(leftAsIs('removed')).toBe('gone')
    expect(leftAsIs(undefined)).toBe('gone')
  })
})

describe('licenceOpen', () => {
  it('approves or turns down only an application still waiting for a decision', () => {
    for (const decision of ['approve', 'deny']) {
      expect(licenceOpen(decision, 'submitted', false)).toBe(true)
      // A seeded pro who applied is still waiting too
      expect(licenceOpen(decision, 'submitted', true)).toBe(true)
    }
  })

  it('leaves an application another moderator (or an earlier press) already decided', () => {
    for (const decision of ['approve', 'deny']) {
      for (const status of ['approved', 'denied', 'revoked', undefined]) expect(licenceOpen(decision, status, false), `${decision} ${status}`).toBe(false)
    }
  })

  it('takes a mark away only while it is there, whatever the application says', () => {
    expect(licenceOpen('revoke', 'approved', true)).toBe(true)
    // Seeded and hand-set pros never applied
    expect(licenceOpen('revoke', undefined, true)).toBe(true)
    expect(licenceOpen('revoke', 'revoked', false)).toBe(false)
    expect(licenceOpen('revoke', 'approved', false)).toBe(false)
    expect(licenceOpen('revoke', undefined, undefined)).toBe(false)
  })
})

describe('moderatorNote', () => {
  it('keeps the words, without the spaces around them', () => {
    expect(moderatorNote('  Please keep phone numbers out of posts. ')).toBe('Please keep phone numbers out of posts.')
  })

  it('is empty when there is no note', () => {
    expect(moderatorNote('   ')).toBe('')
    expect(moderatorNote(undefined)).toBe('')
    expect(moderatorNote(42)).toBe('')
  })

  it('stops at the longest note a notice carries', () => {
    expect(moderatorNote('x'.repeat(MAX_NOTE + 20))).toHaveLength(MAX_NOTE)
  })
})
