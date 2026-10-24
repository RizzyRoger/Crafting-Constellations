import { tidyPenName } from './moderation/index.js'

// Firebase-free rules for deleteAccount, kept apart so they can be unit tested

// Deleting needs a fresh sign-in: seconds since the ID token's auth_time
export const RECENT_SIGN_IN_SECONDS = 5 * 60

// `nowSeconds` is the server's time, not this machine's: the local backend's clock may be off
export const isRecentSignIn = (authTime: unknown, nowSeconds: number) =>
  typeof authTime === 'number' && nowSeconds - authTime <= RECENT_SIGN_IN_SECONDS

// Someone who never finished onboarding has no pen name, so they type this instead
export const NO_PROFILE_WORD = 'delete'

export const confirmMatches = (input: unknown, penNameLower: string | undefined) =>
  typeof input === 'string' && tidyPenName(input).toLowerCase() === (penNameLower ?? NO_PROFILE_WORD)

// Range over every stored path below `path` (for queries on contentPath)
export const underPath = (path: string): [string, string] => [`${path}/`, `${path}/`]

// dms/{pairId}/messages/{mid} → pairId; anything else → undefined
export const pairOfDmPath = (path: string) => {
  const [root, pairId, sub] = path.split('/')
  return root === 'dms' && sub === 'messages' ? pairId : undefined
}

// Whether a private thread's id (its two uids, sorted, joined by _) has them in it
export const isPairOf = (pairId: string, uid: string) => {
  const uids = pairId.split('_')
  return uids.length === 2 && uids.includes(uid)
}
