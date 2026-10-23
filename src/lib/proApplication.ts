// A licence application, checked on the page before anything uploads.
// Uploads are write-once (storage.rules), so a refusal after an upload costs a slot for good.

export const SLOTS = ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']
export const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const MAX_BYTES = 10 * 1024 * 1024

// A slot is free only if it's neither on the application nor left in Storage
// by an attempt that never reached it
export const openSlots = (listed: readonly string[], stored: readonly string[] = []) =>
  SLOTS.filter((s) => !listed.includes(s) && !stored.includes(s))

interface Draft {
  legalName: string
  licenseRegion: string
  licenseNumber: string
  files: readonly { name: string; size: number; type: string }[]
  // Documents already on the application, which a resubmission keeps
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
