import type { AuthorSnapshot } from '../lib/types'
import { Blot } from '../wash/Blot'

interface WhoProps {
  person: Pick<AuthorSnapshot, 'penName' | 'avatarSeed' | 'pigment' | 'pro'> & { synthetic?: boolean }
  size?: number
  showBlot?: boolean
}

// The licensed mark is a circled pencil note
export const Licensed = () => (
  <span className="licensed circled" title="Licensed professional, checked by a moderator">
    licensed
  </span>
)

// Pen name with wash-blot avatar and, for a checked professional, the licensed mark
export const Who = ({ person, size = 24, showBlot = true }: WhoProps) => (
  <span className="who">
    {showBlot && <Blot seed={person.avatarSeed} pigment={person.pigment} size={size} />}
    <span className="who__name">{person.penName}</span>
    {person.pro && <Licensed />}
    {person.synthetic && <span className="sample-tag">sample</span>}
  </span>
)
