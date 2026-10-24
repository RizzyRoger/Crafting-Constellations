// Firebase-free rules for how reports add up on a review-queue item, kept apart so they can be unit tested

// A Firestore Timestamp, as far as order goes
type Instant = { seconds: number; nanoseconds: number }

const isInstant = (value: unknown): value is Instant =>
  typeof (value as Instant | undefined)?.seconds === 'number' && typeof (value as Instant).nanoseconds === 'number'

const later = (a: Instant, b: Instant) => a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds)

// Whether a report filed then was before a moderator when they last decided
const decidedWith = (createdAt: unknown, decidedAt: unknown) => isInstant(decidedAt) && !(isInstant(createdAt) && later(createdAt, decidedAt))

// Distinct people it takes to hide writing until a moderator reads it (holds says who counts)
const AUTO_HOLD_REPORTERS = 3

export interface Queued {
  state?: unknown
  // When a moderator last decided on it (Approve or Remove), on the server's clock
  resolvedAt?: unknown
  reports?: { reporterUids?: string[]; reasons?: string[] }
  // Set when automod queued it
  automod?: { crisis?: unknown }
}

export interface Filed {
  reporterUid: string
  reason: string
  // On the server's clock too: the rules make it the time of the write
  createdAt?: unknown
}

export interface Round {
  reporterUids: string[]
  reasons: string[]
  // 2 puts it at the top of the queue: someone may be in danger
  priority: number
}

// The reports on the item since a moderator last decided, if any
const openRound = (queued: Queued | undefined) => (queued?.state === 'resolved' ? undefined : queued?.reports)

// The reports a queue item holds once this one counts, or null when it changes nothing.
// A moderator's decision closes a round. A report filed before it was decided with it (the
// local backend replays reports on restart, and the trigger retries), so it never reopens the
// item. The first report after it starts a new round, and someone who reported it before can
// bring it back to the queue (whether they can hide it again is up to holds).
// Each person counts once in a round, but a reason they add later is kept, so a later 'someone
// may be in danger' still puts it first. The same reason again is a replay, and changes nothing.
export const nextRound = (queued: Queued | undefined, report: Filed): Round | null => {
  if (decidedWith(report.createdAt, queued?.resolvedAt)) return null
  const current = openRound(queued)
  const reporters = current?.reporterUids ?? []
  const given = current?.reasons ?? []
  const counted = reporters.includes(report.reporterUid)
  if (counted && given.includes(report.reason)) return null
  const reasons = [...new Set([...given, report.reason])]
  return {
    reporterUids: counted ? reporters : [...reporters, report.reporterUid],
    reasons,
    // What the queue shows the crisis mark for: this round's reasons or automod's flag. A
    // self-harm report from a round a moderator has dealt with no longer puts it first.
    priority: reasons.includes('selfHarm') || queued?.automod?.crisis === true ? 2 : 1,
  }
}

// Whether a round hides the writing until a moderator reads it. It takes three people, and after
// a moderator's decision three people new to it: the moderator read it with the earlier reports.
// Who reported it before comes from `filed`, every report on it so far, and not from the queue
// item: deleting an account deletes its reports, so the item never keeps a uid that has gone.
// That is a read of every report on it, so it's only asked for when it could change the answer.
export const holds = async (round: Round, queued: Queued | undefined, filed: () => Promise<Pick<Filed, 'reporterUid' | 'createdAt'>[]>) => {
  if (round.reporterUids.length < AUTO_HOLD_REPORTERS) return false
  // Only someone joining the round can tip it: a reason added by someone in it is still one person
  if (round.reporterUids.length === (openRound(queued)?.reporterUids?.length ?? 0)) return false
  const decidedAt = queued?.resolvedAt
  if (!isInstant(decidedAt)) return true
  const reportedBefore = new Set((await filed()).filter((f) => decidedWith(f.createdAt, decidedAt)).map((f) => f.reporterUid))
  return round.reporterUids.filter((uid) => !reportedBefore.has(uid)).length >= AUTO_HOLD_REPORTERS
}

// Whether Firestore can name every id in a reported path. The rules only ask each to be free
// of '/', so a report can name '__x__', '..' or an id too long to exist, and reading that
// throws on every retry. Nothing is there to review, so the report is simply handled.
const MAX_ID_BYTES = 1500
export const nameable = (path: string) =>
  path.split('/').every((id) => id !== '' && id !== '.' && id !== '..' && !/^__.*__$/s.test(id) && Buffer.byteLength(id) <= MAX_ID_BYTES)
