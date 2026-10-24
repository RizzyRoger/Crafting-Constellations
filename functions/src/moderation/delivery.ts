import type { ModerationResult } from './moderate.js'

// Held writing in a DM or private chat still goes out when crisis language is
// all that was flagged, so the people in it see resources with it. With
// anything else flagged too, it waits for a person.
// Shared: the server delivers by it (content.ts), and the composer's "may
// wait" note reads it, so the note says what will happen.
export const crisisOnly = (verdict: Pick<ModerationResult, 'crisis' | 'categories'>) =>
  verdict.crisis && verdict.categories.every((c) => c === 'selfHarm')
