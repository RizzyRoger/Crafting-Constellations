// Where I stand with a group, which picks what its header offers. Kept apart so it can be unit tested.

export type Standing = 'member' | 'joining' | 'leaving' | 'outside'

// Member-only listeners open only once the server has the membership, and
// close before it goes, so rules never see a reader they'd reject
export const standingIn = (membership: { data: unknown; pending: boolean }, leaving: boolean): Standing => {
  // Nothing to press while leaving: Join would sit under the second click of a double-click on Leave
  if (leaving) return 'leaving'
  if (!membership.data) return 'outside'
  return membership.pending ? 'joining' : 'member'
}

// A click's detail counts the clicks in a row: 0 from a key, 1 for a single click, 2 or more for the
// rest of a double-click. Join takes only a first click: once a quick leave is through, the second
// click of a double-click on Leave lands on it
export const isFirstClick = (detail: number) => detail <= 1
