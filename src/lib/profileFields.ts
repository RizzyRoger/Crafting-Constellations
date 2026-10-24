import type { Profile } from './types'

export interface ProfileFields {
  penName: string
  note: string
}

export const storedFields = (profile?: Profile | null): ProfileFields => ({ penName: profile?.penName ?? '', note: profile?.note ?? '' })

// Moves the form onto a newer stored profile. A field the person hasn't touched takes the new value (a
// moderator's reset, say), so Save can't quietly send the old one back. A field they've edited stays as written.
export const followStored = (fields: ProfileFields, before: ProfileFields, after: ProfileFields): ProfileFields => ({
  penName: fields.penName === before.penName ? after.penName : fields.penName,
  note: fields.note === before.note ? after.note : fields.note,
})
