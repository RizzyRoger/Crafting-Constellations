import type { Membership, Profile } from '../lib/types'
import { egoCircle, type EgoCircle, type EgoTie } from './egoLayout'

// The charts in words: what the List view lists and what each dot on the Friends chart
// is called, for screen readers and small screens. Who is where comes from egoCircle,
// the same as the chart, so the two can't drift apart

// 'A', 'A and B', 'A, B and C'
export const andList = (names: readonly string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

// A dot's name and where it sits: the chart says this by ring and line
export const describeDot = (uid: string, me: string, circle: EgoCircle, waiting: ReadonlySet<string>, name: (uid: string) => string) => {
  if (uid === me) return 'you'
  if (circle.friends.has(uid)) return `${name(uid)}, friend`
  if (circle.pending.has(uid)) return `${name(uid)}, ${waiting.has(uid) ? 'asks to connect with you' : 'you asked to connect'}`
  const through = circle.through.get(uid)
  return through ? `${name(uid)}, friend of ${andList(through.map(name))}` : name(uid)
}

export interface ListingInput {
  me: string
  people: ReadonlyMap<string, Profile>
  groups: readonly { id: string }[]
  memberships: readonly Membership[]
  friendships: EgoTie[]
  pending: EgoTie[]
  // People whose request is waiting on me
  waiting: readonly string[]
  blocked: string[]
}

export interface Listing {
  waiting: string[]
  sent: string[]
  friends: string[]
  // A friend's friend, and the friends of yours they're tied to
  further: { uid: string; through: string[] }[]
  // In no group, so drawn under the Groups chart rather than in a circle
  loose: string[]
  // The Groups chart's lines: everyone else with a friend, and their friends (you first)
  ties: { uid: string; friends: string[] }[]
}

export const listing = ({ me, people, groups, memberships, friendships, pending, waiting, blocked }: ListingInput): Listing => {
  const circle = egoCircle({ me, friendships, pending, blocked })
  const asked = new Set(waiting)
  const sortKey = (uid: string) => (uid === me ? '' : (people.get(uid)?.penName ?? ''))
  const sorted = (uids: Iterable<string>) =>
    [...new Set(uids)].filter((uid) => uid === me || people.has(uid)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const groupIds = new Set(groups.map((g) => g.id))
  const inGroups = new Set(memberships.filter((m) => groupIds.has(m.groupId)).map((m) => m.uid))
  const friendsOf = (uid: string) => friendships.flatMap(({ uids: [a, b] }) => (a === uid ? [b] : b === uid ? [a] : []))

  return {
    waiting: sorted([...circle.pending].filter((uid) => asked.has(uid))),
    sent: sorted([...circle.pending].filter((uid) => !asked.has(uid))),
    friends: sorted(circle.friends),
    further: sorted(circle.through.keys()).map((uid) => ({ uid, through: sorted(circle.through.get(uid) ?? []) })),
    loose: sorted([...people.keys()].filter((uid) => !inGroups.has(uid))),
    ties: sorted(friendships.flatMap((tie) => tie.uids))
      .filter((uid) => uid !== me)
      .map((uid) => ({ uid, friends: sorted(friendsOf(uid)) })),
  }
}
