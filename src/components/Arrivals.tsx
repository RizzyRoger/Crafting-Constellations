import { useEffect, useRef, useState } from 'react'
import { arrivalNote, nextArrivals, type Arrival, type Seen } from '../lib/arrivals'

// The one live part of a conversation: says what someone else just wrote, never the history.
// `opening` until the server has answered: the cache can open it with only part of its history
export const Arrivals = ({ items, opening, me }: { items: readonly Arrival[]; opening: boolean; me: string }) => {
  const seen = useRef<Seen>(null)
  const [note, setNote] = useState<{ key: number; text: string } | null>(null)

  useEffect(() => {
    const next = nextArrivals(seen.current, items, opening, me)
    seen.current = next.seen
    const text = arrivalNote(next, me)
    // A new node each time, so the same words twice ("ok", "ok") are still heard. Another
    // conversation opening in the same place drops the last one's words
    if (text) setNote((last) => ({ key: (last?.key ?? 0) + 1, text }))
    else if (opening) setNote(null)
  }, [items, opening, me])

  return (
    <p className="visually-hidden" aria-live="polite">
      {note && <span key={note.key}>{note.text}</span>}
    </p>
  )
}
