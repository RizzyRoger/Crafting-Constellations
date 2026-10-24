import { otherInPair, pairIdOf } from './pair'

// A private thread's address is mine to open only when it is exactly the id I'd share with one
// other person. 'me_me', 'me_', '_me', the reversed order or a '/' would otherwise build a
// document path Firestore can't take (users/, users/a/b), and that throws instead of saying no
export const isPairFor = (pairId: string, me: string) => {
  const other = otherInPair(pairId, me)
  return other !== '' && !other.includes('/') && pairIdOf(me, other) === pairId
}
