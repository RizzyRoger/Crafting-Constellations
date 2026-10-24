import type { Content } from '../lib/types'

type Noted = Pick<Content, 'status' | 'heldReason' | 'undelivered'>

// Writing held for good says so, rather than that it still waits for a person
const heldNote = ({ heldReason, undelivered }: Noted) =>
  undelivered
    ? 'not delivered — it won’t reach them'
    : heldReason === 'crisis'
      ? 'held — a person will read this first'
      : 'waiting for a person to read this'

// What the author sees on their own writing before others can
export const StatusNote = ({ item }: { item: Noted }) => {
  if (item.status === 'pending') return <span className="status-note">checking…</span>
  if (item.status === 'held') return <span className="status-note">{heldNote(item)}</span>
  return null
}
