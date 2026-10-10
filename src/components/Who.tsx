import type { AuthorSnapshot } from '../lib/types'
import { Blot } from '../wash/Blot'

interface WhoProps {
  person: Pick<AuthorSnapshot, 'penName' | 'avatarSeed' | 'pigment' | 'pro'> & { synthetic?: boolean }
  size?: number
  showBlot?: boolean
}

// Pen name with wash-blot avatar; the licensed mark is a circled pencil note
export const Who = ({ person, size = 24, showBlot = true }: WhoProps) => (
  <span className="who">
    {showBlot && <Blot seed={person.avatarSeed} pigment={person.pigment} size={size} />}
    <span className="who__name">{person.penName}</span>
    {person.pro && (
      <span className="licensed circled" title="Licensed professional, checked by a moderator">
        licensed
      </span>
    )}
    {person.synthetic && <span className="sample-tag">sample</span>}
  </span>
)
