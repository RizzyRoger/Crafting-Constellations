// Firebase-free rules for what a moderator's Approve and Remove do,
// kept apart so they can be unit tested

// What held writing becomes when a moderator approves it:
// - publish:       it never went out (automod held it first), so it goes out now and pings people
// - restore:       it went out once and reports hid it, so it comes back quietly: its notices
//                  and its place in the conversation were given the first time
// - undeliverable: a private note whose two people are no longer connected, or a chat note
//                  whose writer has left the chat; it stays held, so it never reaches them
export type Approval = 'publish' | 'restore' | 'undeliverable'

export interface Held {
  kind: string
  authorUid: string
  // Set when it was first published: report holds keep it, automod holds never had it
  publishedAt?: unknown
  // connections/{pairId}.status for a private note; undefined once they disconnected
  connectionStatus?: unknown
  // chats/{chatId}.uids for a chat note; undefined if the chat is gone
  chatUids?: unknown
}

export const approvalOf = ({ kind, authorUid, publishedAt, connectionStatus, chatUids }: Held): Approval => {
  if (publishedAt) return 'restore'
  if (kind === 'dm' && connectionStatus !== 'accepted') return 'undeliverable'
  if (kind === 'chatMessage' && !(Array.isArray(chatUids) && chatUids.includes(authorUid))) return 'undeliverable'
  return 'publish'
}

// What Remove does to queued writing, by its status now:
// - remove:    up, held or waiting, so it comes down and its writer is told
// - withdrawn: its writer already took it down, so that stands and nobody is told
// - gone:      already removed, or deleted with the writer's account
export type Removal = 'remove' | 'withdrawn' | 'gone'

const REMOVABLE: ReadonlySet<unknown> = new Set(['published', 'held', 'pending'])

export const removalOf = (status: unknown): Removal => (status === 'withdrawn' ? 'withdrawn' : REMOVABLE.has(status) ? 'remove' : 'gone')

// What came of an Approve or Remove, as the moderator's page is told. The entry leaves the
// queue whatever came of it, so this is the only way they know the button didn't do what it says:
// - published, restored, undelivered: Approve's publish, restore and undeliverable
// - kept:             already up (or a profile), so Approve leaves it as it is
// - removed:          taken down, or the profile reset, and its writer told
// - withdrawn:        its writer had already taken it down, so nothing changed
// - gone:             already removed, or deleted with the writer's account, so nothing changed
// - already-resolved: another moderator (or an earlier press) decided it first, so nothing changed
export type Outcome = 'published' | 'restored' | 'undelivered' | 'kept' | 'removed' | 'withdrawn' | 'gone' | 'already-resolved'

const OUTCOMES: Record<Approval | Removal, Outcome> = {
  publish: 'published',
  restore: 'restored',
  undeliverable: 'undelivered',
  remove: 'removed',
  withdrawn: 'withdrawn',
  gone: 'gone',
}

export const outcomeOf = (decision: Approval | Removal): Outcome => OUTCOMES[decision]

// What Approve does to queued writing that is no longer held or waiting: nothing. It stays
// up, or stays down
export const leftAsIs = (status: unknown): Outcome => (status === 'published' ? 'kept' : status === 'withdrawn' ? 'withdrawn' : 'gone')

// The moderator's note to the writer, as their notice shows it ('' for none)
export const MAX_NOTE = 500

export const moderatorNote = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, MAX_NOTE) : '')
