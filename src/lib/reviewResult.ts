import type { ModOutcome } from './callables'

export type Licence = 'approve' | 'deny' | 'revoke'

// Said once a licence decision lands. The row leaves its list either way (one holds waiting
// applications, the other licensed people), so the words name who it was about
const LICENCE: Record<Licence, string> = {
  approve: 'Licence approved. They’ll find a note in Notifications.',
  deny: 'Application denied. They’ll find a note in Notifications.',
  revoke: 'Licensed mark revoked, on what they already wrote too.',
}

// Decided first, by another moderator or an earlier press, says so. An older backend doesn't say
export const licenceSaid = (who: string, decision: Licence, outcome?: ModOutcome) =>
  `${who} — ${outcome === 'already-resolved' ? 'Already decided, so nothing changed.' : LICENCE[decision]}`

// Said once a ban or its lifting lands: the row only swaps its buttons, which nobody hears
export const banSaid = (banned: boolean, hid: boolean) =>
  banned ? `Banned. They’re signed out everywhere and can’t sign in.${hid ? ' Their writing is hidden.' : ''}` : 'Ban lifted. They can sign in again.'

// The focused button went with what it was part of, so the browser left focus on the page itself.
// Only then is it brought somewhere: never taken from where the moderator has gone since
export const focusLost = (page: { activeElement: Element | null; body: Element | null }) => !page.activeElement || page.activeElement === page.body
