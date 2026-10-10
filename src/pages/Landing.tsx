import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Plate } from '../components/Plate'
import type { Pigment } from '../wash/pigments'
import { HERO } from '../wash/strokes'
import { Swatch } from '../wash/Swatch'
import { Wash } from '../wash/Wash'

const RAIL: { pigment: Pigment; name: string; note: string }[] = [
  { pigment: 'graphite', name: 'Constellation', note: 'see the groups and people near you' },
  { pigment: 'paynesBlue', name: 'Groups', note: 'talk, post, read at your own pace' },
  { pigment: 'fresco', name: 'Private notes', note: 'write to someone you’ve connected with' },
  { pigment: 'caliente', name: 'Licensed professionals', note: 'their advice carries a circled “licensed”' },
]

// Board 01, as the front door
export const Landing = () => {
  const { user, profile } = useAuth()

  return (
    <div className="landing">
      <Wash strokes={HERO} seed={29} className="landing__wash" />

      <div className="landing__side">
        <Plate as="h1" />

        <p className="pencil landing__lede">
          A quiet place for families living alongside an illness — to talk with people who understand, and with licensed professionals.
        </p>

        <ul className="landing__rail" aria-label="What is here">
          {RAIL.map((row, i) => (
            <li key={row.name} className="swatch-row">
              <Swatch pigment={row.pigment} seed={101 + i * 7} density={1 - i * 0.12} />
              <span>
                <span className="pencil landing__name">{row.name}</span>
                <span className="code">{row.note}</span>
              </span>
            </li>
          ))}
        </ul>

        <dl className="landing__system pencil">
          <dt>Names</dt>
          <dd>pen names only, never your real one</dd>
          <dt>Safety</dt>
          <dd>writing is checked before others see it</dd>
          <dt>Pace</dt>
          <dd>no feed, no streaks, no counts to chase</dd>
        </dl>

        <div className="row">
          {user && profile ? (
            <Link to="/constellation" className="act act--wash">
              Open your constellation
            </Link>
          ) : (
            <>
              <Link to="/signup" className="act act--wash">
                Make a pen name
              </Link>
              <Link to="/signin" className="act">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
