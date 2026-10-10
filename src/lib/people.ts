import { collection } from 'firebase/firestore'
import { useMemo } from 'react'
import { db } from './firebase'
import { useQueryData } from './live'
import type { Profile } from './types'

// The people among `uids` someone could ping: not me, not paused, by name
export const among = (people: readonly Profile[], uids: readonly string[], me: string): Profile[] => {
  const ids = new Set(uids)
  return people.filter((p) => ids.has(p.id) && p.id !== me && !p.banned).sort((a, b) => a.penName.localeCompare(b.penName))
}

// A group's members, for @mentions: they are the ones who can read its writing.
// Profiles and memberships are readable by anyone signed in (firestore.rules).
export const useGroupPeople = (groupId: string | null, me: string): Profile[] => {
  const members = useQueryData<{ id: string }>(groupId && `group-members|${groupId}`, () => collection(db, `groups/${groupId}/members`))
  const people = useQueryData<Profile>(groupId && 'people', () => collection(db, 'users'))
  return useMemo(() => among(people.data, members.data.map((m) => m.id), me), [people.data, members.data, me])
}
