import { collection, collectionGroup, query, where } from 'firebase/firestore'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useSignOut } from '../auth/useSignOut'
import { db } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import type { Connection, Group, Membership, Notice } from '../lib/types'
import { Blot } from '../wash/Blot'
import type { Pigment } from '../wash/pigments'
import { Swatch } from '../wash/Swatch'
import { Plate } from './Plate'

interface IndexEntry {
  to: string
  label: string
  pigment: Pigment
  density: number
  count?: number
}

// The annotation rail: pigment-index navigation, your groups, quiet notes
const Rail = () => {
  const { user, profile, claims } = useAuth()
  const signOut = useSignOut()
  const uid = user?.uid ?? null

  const memberships = useQueryData<Membership & { id: string; path: string }>(uid && `rail-members|${uid}`, () =>
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
  )
  const groups = useQueryData<Group>(uid && 'rail-groups', () => collection(db, 'groups'))
  const notices = useQueryData<Notice>(uid && `rail-notices|${uid}`, () =>
    query(collection(db, `users/${uid}/notices`), where('seen', '==', false)),
  )
  const connections = useQueryData<Connection>(uid && `rail-conn|${uid}`, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )

  const myGroupIds = new Set(memberships.data.map((m) => m.path.split('/')[1]))
  const myGroups = groups.data.filter((g) => myGroupIds.has(g.id))
  const incoming = connections.data.filter((c) => c.status === 'pending' && c.recipient === uid).length

  const entries: IndexEntry[] = [
    { to: '/constellation', label: 'Constellation', pigment: 'paynesBlue', density: 1 },
    { to: '/messages', label: 'Private notes', pigment: 'graphite', density: 0.9 },
    { to: '/me', label: 'You', pigment: 'fresco', density: 0.78, count: notices.data.length + incoming },
    { to: '/professional', label: 'Professionals', pigment: 'caliente', density: 0.62 },
    ...(claims.admin ? [{ to: '/admin', label: 'Review', pigment: 'warm', density: 0.55 } satisfies IndexEntry] : []),
  ]

  return (
    <aside className="rail" aria-label="Index">
      <Plate link />

      {profile && (
        <div className="rail__me">
          <Blot seed={profile.avatarSeed} pigment={profile.pigment} size={30} />
          <span className="who__name">{profile.penName}</span>
        </div>
      )}

      {!claims.emailVerified && (
        <div className="banner">
          <span className="pencil">Confirm your email to write privately.</span>
          <Link to="/verify" className="code">
            Confirm email
          </Link>
        </div>
      )}

      <nav aria-label="Pigment index">
        <ul className="index">
          {entries.map((entry) => (
            <li key={entry.to}>
              <NavLink to={entry.to}>
                <Swatch pigment={entry.pigment} density={entry.density} seed={entry.label.length * 31} />
                <span className="pencil">
                  {entry.label}
                  {entry.count ? <span className="count code">({entry.count})</span> : null}
                </span>
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => void signOut()}>
              <span />
              <span className="code">Sign out</span>
            </button>
          </li>
        </ul>
      </nav>

      {myGroups.length > 0 && (
        <nav aria-label="Your groups" className="stack" style={{ gap: 6 }}>
          <span className="code">Your groups</span>
          {myGroups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="pencil" style={{ fontSize: 16 }}>
              {g.name}
            </Link>
          ))}
        </nav>
      )}

      <p className="rail__notes pencil">
        Pen names only.
        <br />
        Writing is checked before others see it.
        <br />
        No feed. No streaks.
      </p>
    </aside>
  )
}

export const Shell = ({ children }: { children: ReactNode }) => (
  <div className="shell">
    <main className="shell__main" id="main">
      {children}
    </main>
    <Rail />
  </div>
)
