import type { ModOutcome } from './callables'
import { outcomeNote } from './reviewOutcome'
import type { QueueItem } from './types'

// What was pressed on a queue entry: Approve (or Keep it up), or Remove (or Reset profile)
export type QueueDecision = 'approve' | 'remove'

type Kind = QueueItem['kind']

const isNote = (kind: Kind) => kind === 'dm' || kind === 'chatMessage'

// Approve or Remove did what its button says. A sighted moderator sees the entry leave the
// queue; a screen reader hears nothing of that, so it's said too
const DONE: Partial<Record<ModOutcome, (kind: Kind) => string>> = {
  published: (kind) => (isNote(kind) ? 'Approved and delivered.' : 'Approved and published.'),
  restored: () => 'Kept up. It’s showing again.',
  kept: (kind) => (kind === 'profile' ? 'Kept as it is.' : 'Kept up.'),
  removed: (kind) => (kind === 'profile' ? 'Profile reset.' : 'Removed.') + ' They’ll find a note in Notifications.',
}

// An older backend doesn't say what came of it, so it's said as the button pressed
const PRESSED: Record<QueueDecision, (kind: Kind) => string> = {
  approve: () => 'Approved.',
  remove: (kind) => (kind === 'profile' ? 'Profile reset.' : 'Removed.'),
}

// Said once a queue decision lands, whatever came of it, naming the entry: it leaves the queue
// either way. What didn't do what its button says is said as outcomeNote has it
export const queueSaid = (who: string, kind: Kind, pressed: QueueDecision, outcome?: ModOutcome) =>
  `${who} — ${outcomeNote(outcome, kind) ?? (outcome && DONE[outcome]?.(kind)) ?? PRESSED[pressed](kind)}`
