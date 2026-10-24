// A Firestore Timestamp, as far as order goes
type Instant = { seconds: number; nanoseconds: number }

const isInstant = (value: unknown): value is Instant =>
  typeof (value as Instant | null | undefined)?.seconds === 'number' && typeof (value as Instant).nanoseconds === 'number'

const later = (a: Instant, b: Instant) => a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds)

// Filed since a moderator last decided, as the server counts a round (decidedWith in
// functions/src/reportPolicy.ts): one with no time only while nobody has decided
const sinceDecision = (createdAt: unknown, resolvedAt: unknown) => !isInstant(resolvedAt) || (isInstant(createdAt) && later(createdAt, resolvedAt))

const millis = (at: unknown) => (isInstant(at) ? at.seconds * 1000 + at.nanoseconds / 1e6 : Infinity)

// A queue item and its reports as far as this goes (QueueItem, FiledReport), so firebase-admin's
// documents do as well as the page's
export interface Entry {
  authorUid: string
  reports?: { reporterUids?: string[] }
  resolvedAt?: unknown
}

export interface Filed {
  id: string
  reporterUid: string
  reason: string
  details?: string
  createdAt?: unknown
}

// Whether the Review page reads the reports on an entry. Only people's reports carry words, and
// what they wrote never goes to the person they reported, even when that's a moderator
export const readsReports = (item: Entry, me: string) => Boolean(item.reports) && item.authorUid !== me

// What reporters wrote under 'Anything else', oldest first, and never who wrote it. Only from the
// people the open round counts: the server turns away the writer and anyone who couldn't see it,
// and the last decision was made with the reports before it
export const reportDetails = (item: Entry, filed: Filed[], me: string) => {
  if (!readsReports(item, me)) return []
  const counted = new Set(item.reports?.reporterUids ?? [])
  return filed
    .filter((report) => counted.has(report.reporterUid) && sinceDecision(report.createdAt, item.resolvedAt))
    .sort((a, b) => millis(a.createdAt) - millis(b.createdAt))
    .flatMap(({ id, reason, details }) => (details?.trim() ? [{ id, reason, details: details.trim() }] : []))
}
