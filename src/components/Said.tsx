import { useState } from 'react'

export interface Saying {
  key: number
  text: string
  // Where it was done
  place: string
}

// A new node each time, so the same words twice ('Withdrawn.', 'Withdrawn.') are still heard
export const nextSaying = (last: Saying | null, text: string, place: string): Saying => ({ key: (last?.key ?? 0) + 1, text, place })

// What a page says of something done in it whose own place has gone, such as withdrawn writing,
// which drops out of the list and takes anything said inside it along. Another place opening in
// the same page (a new address, no remount) starts with nothing said, and words that land late
// for the last one aren't said here
export const useSaid = (place: string) => {
  const [said, setSaid] = useState<Saying | null>(null)
  if (said && said.place !== place) setSaid(null)
  const say = (text: string) => setSaid((last) => nextSaying(last, text, place))
  return [said?.place === place ? said : null, say] as const
}

// Mounted from the start, outside the list, so it's heard when the words land: a polite region
// that arrives already holding its words is often never read
export const Said = ({ said }: { said: Saying | null }) => (
  <p className="visually-hidden" role="status">
    {said && <span key={said.key}>{said.text}</span>}
  </p>
)
