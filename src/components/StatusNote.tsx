import type { Content } from '../lib/types'

// What the author sees on their own writing before others can
export const StatusNote = ({ item }: { item: Pick<Content, 'status' | 'heldReason'> }) => {
  if (item.status === 'pending') return <span className="status-note">checking…</span>
  if (item.status === 'held') {
    return (
      <span className="status-note">
        {item.heldReason === 'crisis' ? 'held — a person will read this first' : 'waiting for a person to read this'}
      </span>
    )
  }
  return null
}
