import { MAX_MENTIONS, mentionedIn, type Mentioned } from './moderation/index.js'

// Firebase-free rules for who a newly published piece of writing pings,
// kept apart so they can be unit tested

// Letters, digits, _ and -, and not one of Firestore's reserved __ids__. Each pick
// becomes part of a document path, and anything else (a '/') would make the
// publishing transaction throw on every retry.
const UID = /^(?!__.*__$)[\w-]{1,128}$/

// The uids a writer picked: uid-shaped strings, no repeats, never themself, at most MAX_MENTIONS
export const requestedMentions = (raw: unknown, authorUid: string): string[] =>
  Array.isArray(raw)
    ? [...new Set(raw.filter((uid): uid is string => typeof uid === 'string' && UID.test(uid) && uid !== authorUid))].slice(0, MAX_MENTIONS)
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

// Pinged: picked by the writer, still someone who can read it, and named in the
// words as they will be drawn (the longer of two overlapping names wins)
export const pickMentioned = (text: string, requested: readonly string[], readers: ReadonlyMap<string, Reader>): Mentioned[] => {
  const picked = requested.flatMap((uid) => {
    const reader = readers.get(uid)
    return reachable(reader) ? [{ uid, penName: reader.penName }] : []
  })
  const named = mentionedIn(text, picked)
  return picked.filter((p) => named.has(p.uid))
}

// A post's writer hears about a comment, unless they wrote it, can't read it, or are already pinged in it
export const commentRecipient = (postAuthor: Reader | undefined, commenterUid: string, mentioned: readonly Mentioned[]) =>
  reachable(postAuthor) && postAuthor.uid !== commenterUid && !mentioned.some((m) => m.uid === postAuthor.uid) ? postAuthor.uid : null

// Acceptances the local backend may have missed while it was off, still recent enough to be news.
// Announcing one twice is impossible (the notice id names the acceptance), so this only bounds
// how far back a restart looks: older ones would be surprising, not helpful.
export const MISSED_ACCEPT_MS = 3 * 24 * 60 * 60 * 1000

export const acceptedWhileAway = (status: unknown, acceptedAtMs: number | undefined, nowMs: number) =>
  status === 'accepted' && acceptedAtMs !== undefined && acceptedAtMs <= nowMs && nowMs - acceptedAtMs <= MISSED_ACCEPT_MS
