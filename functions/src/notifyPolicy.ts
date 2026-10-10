import { hasMention, MAX_MENTIONS, type Mentioned } from './moderation/index.js'

// Firebase-free rules for who a newly published piece of writing pings,
// kept apart so they can be unit tested

// The uids a writer picked: strings, no repeats, never themself, at most MAX_MENTIONS
export const requestedMentions = (raw: unknown, authorUid: string): string[] =>
  Array.isArray(raw)
    ? [...new Set(raw.filter((uid): uid is string => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && uid !== authorUid))].slice(
        0,
        MAX_MENTIONS,
      )
    : []

// What the publishing transaction read about one person
export interface Reader {
  uid: string
  // undefined: no profile (never onboarded, or deleted their account)
  penName?: string
  banned: boolean
  // a member of the group, or still on the private chat
  canRead: boolean
  // either of the two blocked the other
  blocked: boolean
}

const reachable = (reader: Reader | undefined): reader is Reader & { penName: string } =>
  Boolean(reader?.penName) && !reader!.banned && reader!.canRead && !reader!.blocked

// Pinged: picked by the writer, named in the words, and still someone who can read it
export const pickMentioned = (text: string, requested: readonly string[], readers: ReadonlyMap<string, Reader>): Mentioned[] =>
  requested.flatMap((uid) => {
    const reader = readers.get(uid)
    return reachable(reader) && hasMention(text, reader.penName) ? [{ uid, penName: reader.penName }] : []
  })

// A post's writer hears about a comment, unless they wrote it, can't read it, or are already pinged in it
export const commentRecipient = (postAuthor: Reader | undefined, commenterUid: string, mentioned: readonly Mentioned[]) =>
  reachable(postAuthor) && postAuthor.uid !== commenterUid && !mentioned.some((m) => m.uid === postAuthor.uid) ? postAuthor.uid : null
