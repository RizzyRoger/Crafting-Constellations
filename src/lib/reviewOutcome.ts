import type { ModOutcome } from './callables'
import type { QueueItem } from './types'

// Said once Approve or Remove is done, when it didn't do what its button says. The entry
// leaves the queue either way, so without this the two look the same
const NOTES: Partial<Record<ModOutcome, (kind: QueueItem['kind']) => string>> = {
  undelivered: (kind) =>
    kind === 'chatMessage'
      ? 'Approved, but not delivered: the writer is no longer in the chat, so it stays held.'
      : 'Approved, but not delivered: they’re no longer connected, so it stays held.',
  withdrawn: () => 'The writer had already withdrawn this, so nothing changed.',
  gone: (kind) => (kind === 'profile' ? 'Their account is gone, so there was nothing to reset.' : 'This had already been taken down or deleted, so nothing changed.'),
  'already-resolved': () => 'Another moderator already dealt with this, so nothing changed.',
}

// Null for the usual results, and when an older backend doesn't say
export const outcomeNote = (outcome: ModOutcome | undefined, kind: QueueItem['kind']): string | null =>
  (outcome && NOTES[outcome]?.(kind)) || null
