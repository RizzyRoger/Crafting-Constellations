import { collection } from 'firebase/firestore'
import { useMemo } from 'react'
import { db } from './firebase'
import { useQueryData } from './live'
import type { Connection, Profile } from './types'

// The people among `uids` someone could ping: not me, not paused, by name
export const among = (people: readonly Profile[], uids: readonly string[], me: string): Profile[] => {
  const ids = new Set(uids)
  return people.filter((p) => ids.has(p.id) && p.id !== me && !p.banned).sort((a, b) => a.penName.localeCompare(b.penName))
}

// Everyone with a profile others can see, by id: banned people are hidden from everyone
export const visibleById = (people: readonly Profile[]): Map<string, Profile> =>
  new Map(people.filter((p) => !p.banned).map((p) => [p.id, p]))

// The ties to draw or list: everyone on them but me has a visible profile. A ban keeps the
// person's connections and friendships (an unban brings them back), so they'd otherwise show
// as a nameless dot that opens nothing, or a request from someone no one can see
export const withVisible = <T extends { uids: readonly string[] }>(
  ties: readonly T[],
  visible: ReadonlyMap<string, unknown>,
  me: string,
): T[] => ties.filter((tie) => tie.uids.every((id) => id === me || visible.has(id)))

// Requests waiting on me, from people I can see
export const waitingOn = (connections: readonly Connection[], visible: ReadonlyMap<string, unknown>, me: string): Connection[] =>
  withVisible(connections.filter((c) => c.status === 'pending' && c.recipient === me), visible, me)

// A group's members, for @mentions: they are the ones who can read its writing.
// Profiles and memberships are readable by anyone signed in (firestore.rules).
export const useGroupPeople = (groupId: string | null, me: string): Profile[] => {
  const members = useQueryData<{ id: string }>(groupId && `group-members|${groupId}`, () => collection(db, `groups/${groupId}/members`))
  const people = useQueryData<Profile>(groupId && 'people', () => collection(db, 'users'))
  return useMemo(() => among(people.data, members.data.map((m) => m.id), me), [people.data, members.data, me])
}
