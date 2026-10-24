import { describe, expect, it } from 'vitest'
import type { Profile } from '../lib/types'
import { egoCircle } from './egoLayout'
import { andList, describeDot, listing } from './inWords'

const profile = (id: string, penName: string): Profile => ({ id, penName, avatarSeed: id, pigment: 'fresco', pro: false, banned: false })
const tie = (a: string, b: string) => ({ id: `${a}-${b}`, uids: [a, b] as [string, string] })

// Me, a friend (Quiet Heron), her friend (Slow River), someone who asked me (Grey Wren),
// someone I asked (Late Harbor), a pair of strangers (Soft Fern and Low Moth), and Pale Willow, who
// is in no group. Dusk Kettle is blocked, and still friends with Low Moth
const people = new Map(
  [
    profile('me', 'Even Tide'),
    profile('heron', 'Quiet Heron'),
    profile('river', 'Slow River'),
    profile('wren', 'Grey Wren'),
    profile('harbor', 'Late Harbor'),
    profile('fern', 'Soft Fern'),
    profile('moth', 'Low Moth'),
    profile('willow', 'Pale Willow'),
    profile('kettle', 'Dusk Kettle'),
  ].map((p) => [p.id, p]),
)
const friendships = [tie('me', 'heron'), tie('heron', 'river'), tie('fern', 'moth'), tie('kettle', 'moth')]
const pending = [tie('wren', 'me'), tie('me', 'harbor')]
const input = {
  me: 'me',
  people,
  groups: [{ id: 'g1' }],
  memberships: ['me', 'heron', 'river', 'wren', 'harbor', 'fern', 'moth', 'kettle'].map((uid) => ({ groupId: 'g1', uid })),
  friendships,
  pending,
  waiting: ['wren'],
  blocked: ['kettle'],
}

describe('the List view', () => {
  const list = listing(input)

  it('says who your friends are, and which requests wait on you or on them', () => {
    expect(list.friends).toEqual(['heron'])
    expect(list.waiting).toEqual(['wren'])
    expect(list.sent).toEqual(['harbor'])
  })

  it('names a friend’s friend and who they come through', () => {
    expect(list.further).toEqual([{ uid: 'river', through: ['heron'] }])
  })

  it('names people in no group, and you too when you’ve joined none', () => {
    expect(list.loose).toEqual(['willow'])
    expect(listing({ ...input, memberships: [] }).loose).toEqual(['me', 'kettle', 'wren', 'harbor', 'moth', 'willow', 'heron', 'river', 'fern'])
  })

  it('says who is friends with whom, as the Groups chart’s lines do, you first in each', () => {
    expect(list.ties).toEqual([
      { uid: 'kettle', friends: ['moth'] },
      { uid: 'moth', friends: ['kettle', 'fern'] },
      { uid: 'heron', friends: ['me', 'river'] },
      { uid: 'river', friends: ['heron'] },
      { uid: 'fern', friends: ['moth'] },
    ])
  })

  it('leaves a blocked person out of the people around you', () => {
    const blockedFriend = listing({ ...input, friendships: [...friendships, tie('me', 'kettle')] })
    expect(blockedFriend.friends).toEqual(['heron'])
    expect(blockedFriend.further.map((f) => f.uid)).toEqual(['river'])
  })

  it('counts a group you can’t see as no group', () => {
    expect(listing({ ...input, groups: [] }).loose).toContain('heron')
  })
})

describe('a dot on the Friends chart', () => {
  const circle = egoCircle({ me: 'me', friendships, pending, blocked: ['kettle'] })
  const name = (uid: string) => (uid === 'me' ? 'you' : (people.get(uid)?.penName ?? 'someone'))
  const say = (uid: string) => describeDot(uid, 'me', circle, new Set(['wren']), name)

  it('says whether it’s a friend, a request either way, or a friend’s friend', () => {
    expect(say('me')).toBe('you')
    expect(say('heron')).toBe('Quiet Heron, friend')
    expect(say('wren')).toBe('Grey Wren, asks to connect with you')
    expect(say('harbor')).toBe('Late Harbor, you asked to connect')
    expect(say('river')).toBe('Slow River, friend of Quiet Heron')
  })

  it('names every friend a friend’s friend is tied to', () => {
    const two = egoCircle({ me: 'me', friendships: [tie('me', 'heron'), tie('me', 'fern'), tie('heron', 'river'), tie('river', 'fern')], pending: [] })
    expect(describeDot('river', 'me', two, new Set(), name)).toBe('Slow River, friend of Quiet Heron and Soft Fern')
  })
})

describe('a list of names', () => {
  it('joins with commas and a last “and”', () => {
    expect(andList([])).toBe('')
    expect(andList(['A'])).toBe('A')
    expect(andList(['A', 'B'])).toBe('A and B')
    expect(andList(['A', 'B', 'C'])).toBe('A, B and C')
  })
})
