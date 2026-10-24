// A licence application, checked on the page before anything uploads.
// Once there's an application, uploads are write-once (storage.rules), so a refusal after one costs a slot.

export const SLOTS = ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']
export const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const MAX_BYTES = 10 * 1024 * 1024

// A slot is free only if it's neither on the application nor left in Storage
// by an attempt that never reached it
export const openSlots = (listed: readonly string[], stored: readonly string[] = []) =>
  SLOTS.filter((s) => !listed.includes(s) && !stored.includes(s))

type Decided = { status: string; files?: readonly string[]; reviewedAt?: { seconds: number; nanoseconds: number } | null } | null

// A turned-down or revoked applicant's new documents go in a folder named for that decision:
// five fresh slots no moderator has seen (storage.rules). Null when there's no such decision
export const reapplyRound = (app: Decided): string | null => {
  if ((app?.status !== 'denied' && app?.status !== 'revoked') || !app.reviewedAt) return null
  // Whole milliseconds, as the rule's toMillis() gives them; the SDK's toMillis() keeps a fraction
  // whenever the time has microseconds
  const { seconds, nanoseconds } = app.reviewedAt
  return String(seconds * 1000 + Math.floor(nanoseconds / 1_000_000))
}

// How many new documents the form takes: five before there's an application (a failed first try
// can be redone) and on a reapplication; otherwise the slots not used yet
export const documentRoom = (app: Decided) => (!app || reapplyRound(app) ? SLOTS.length : openSlots(app.files ?? []).length)

// An application lists five documents at most, new and earlier together
const fits = (listed: number, count: number) => listed + count <= SLOTS.length

// The unused slots to look for in Storage before placing new documents: none before there's an
// application (any slot can be written again then), and none when the documents can't go there
export const slotsToCheck = (app: Decided, count: number): string[] => {
  if (!app || !count) return []
  const listed = app.files ?? []
  const unused = openSlots(listed)
  return count <= unused.length && fits(listed.length, count) ? unused : []
}

// Where new documents go and what the application lists. Free slots, the names every application
// takes, go first while they hold them all and everything fits; otherwise a reapplication's round
// takes them, added to the ones sent before while all fit and in their place when they don't
export const placeDocuments = (d: { listed: readonly string[]; free: readonly string[]; count: number; round: string | null }) => {
  if (!d.round || (d.count <= d.free.length && fits(d.listed.length, d.count))) {
    const names = d.free.slice(0, d.count)
    return { names, files: [...d.listed, ...names] }
  }
  const names = SLOTS.slice(0, d.count).map((s) => `${d.round}/${s}`)
  return { names, files: fits(d.listed.length, d.count) ? [...d.listed, ...names] : names }
}

// Next to the picker: what's chosen, and what becomes of the documents sent before
export const documentsHint = (listed: number, chosen: readonly string[]): string | null => {
  if (!chosen.length) return listed ? 'The documents you sent before stay with your application.' : null
  if (!listed) return chosen.join(', ')
  return `${chosen.join(', ')} — ${fits(listed, chosen.length) ? 'added to' : 'sent instead of'} the documents you sent before.`
}

interface Draft {
  legalName: string
  licenseRegion: string
  licenseNumber: string
  files: readonly { name: string; size: number; type: string }[]
  // Documents already on the application, which a resubmission can send again
  listed: readonly string[]
  // Slots free for new documents
  open: number
}

// The same checks as appFieldsValid (firestore.rules) and the upload rule, on trimmed values;
// null when the application can go
export const applicationProblem = (d: Draft): string | null => {
  if (d.legalName.trim().length < 2) return 'Write your legal name (at least 2 characters).'
  if (d.licenseRegion.trim().length < 2) return 'Write where you’re licensed (at least 2 characters).'
  if (d.licenseNumber.trim().length < 2) return 'Write your licence number (at least 2 characters).'
  if (d.files.length === 0 && d.listed.length === 0) return 'Add at least one document.'
  if (d.files.length > d.open) return d.open ? `You can add ${d.open} more document(s).` : 'There’s no room for more documents.'
  const wrongType = d.files.find((f) => !DOC_TYPES.includes(f.type))
  if (wrongType) return `${wrongType.name} isn’t a PDF, PNG, JPEG or WebP file.`
  const empty = d.files.find((f) => f.size === 0)
  if (empty) return `${empty.name} is empty.`
  const tooBig = d.files.find((f) => f.size > MAX_BYTES)
  if (tooBig) return `${tooBig.name} is over 10 MB.`
  return null
}

// Shown above the form after a moderator turned an application down or took the mark back
export const reapplyNote = (app: { status: string; reviewNote?: string } | null): string | null => {
  if (app?.status !== 'denied' && app?.status !== 'revoked') return null
  const what = app.status === 'denied' ? 'Your last application wasn’t approved.' : 'A moderator removed your licensed mark.'
  return `${what}${app.reviewNote ? ` Note: ${app.reviewNote}` : ''} You can apply again.`
}
