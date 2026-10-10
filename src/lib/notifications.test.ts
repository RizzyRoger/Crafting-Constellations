import { describe, expect, it } from 'vitest'
import { linkFor, placeOf, verbFor } from './notifications'

describe('placeOf', () => {
  it('reads where writing lives from its path', () => {
    expect(placeOf('groups/g/posts/p')).toEqual({ kind: 'post', groupId: 'g', postId: 'p' })
    expect(placeOf('groups/g/posts/p/comments/c')).toEqual({ kind: 'comment', groupId: 'g', postId: 'p' })
    expect(placeOf('groups/g/messages/m')).toEqual({ kind: 'groupMessage', groupId: 'g' })
    expect(placeOf('chats/c/messages/m')).toEqual({ kind: 'chatMessage', chatId: 'c' })
  })

  it('knows nothing of private notes, profiles or nonsense', () => {
    expect(placeOf('dms/a_b/messages/m')).toBeNull()
    expect(placeOf('users/u')).toBeNull()
    expect(placeOf(undefined)).toBeNull()
  })
})

describe('linkFor', () => {
  it('opens the post for posts and comments, the talk or chat for messages', () => {
    expect(linkFor({ type: 'mention', contentPath: 'groups/g/posts/p' }, 'me')).toBe('/groups/g/posts/p')
    expect(linkFor({ type: 'comment', contentPath: 'groups/g/posts/p/comments/c' }, 'me')).toBe('/groups/g/posts/p')
    expect(linkFor({ type: 'mention', contentPath: 'groups/g/messages/m' }, 'me')).toBe('/groups/g')
    expect(linkFor({ type: 'mention', contentPath: 'chats/c/messages/m' }, 'me')).toBe('/chats/c')
  })

  it('opens your private notes with someone who accepted', () => {
    expect(linkFor({ type: 'accepted', actorUid: 'b' }, 'a')).toBe('/messages/a_b')
    expect(linkFor({ type: 'accepted', actorUid: 'a' }, 'b')).toBe('/messages/a_b')
  })

  it('has nothing to open for notes from moderators', () => {
    expect(linkFor({ type: 'held', contentPath: 'groups/g/posts/p' }, 'me')).toBeNull()
    expect(linkFor({ type: 'proApproved' }, 'me')).toBeNull()
  })
})

describe('verbFor', () => {
  it('says what happened and where', () => {
    expect(verbFor({ type: 'mention', contentPath: 'groups/g/posts/p' }, 'Caregivers')).toBe('mentioned you in a post in Caregivers')
    expect(verbFor({ type: 'mention', contentPath: 'groups/g/posts/p/comments/c' }, 'Caregivers')).toBe('mentioned you in a comment in Caregivers')
    expect(verbFor({ type: 'mention', contentPath: 'groups/g/messages/m' }, 'Caregivers')).toBe('mentioned you in Caregivers')
    expect(verbFor({ type: 'comment', contentPath: 'groups/g/posts/p/comments/c' }, 'Caregivers')).toBe('commented on your post in Caregivers')
  })

  it('falls back when the place has no name to hand', () => {
    expect(verbFor({ type: 'mention', contentPath: 'chats/c/messages/m' })).toBe('mentioned you in a private chat')
    expect(verbFor({ type: 'mention', contentPath: 'groups/g/messages/m' })).toBe('mentioned you in a group')
  })
})
