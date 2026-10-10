import { collection, doc, limit, orderBy, query, updateDoc, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { useSignOut } from '../auth/useSignOut'
import { CrisisCard } from '../components/CrisisCard'
import { PageHead } from '../components/PageHead'
import { ProfileForm } from '../components/ProfileForm'
import { Who } from '../components/Who'
import { db } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import { otherInPair } from '../lib/pair'
import { acceptConnection, blockConnection, removeConnection } from '../lib/social'
import { setCountVisits, TELEMETRY_AVAILABLE, useCountVisits } from '../lib/telemetry'
import { ago } from '../lib/time'
import type { Connection, Notice, Profile } from '../lib/types'

const NOTICE_TEXT: Record<Notice['type'], string> = {
  crisis: 'Something you wrote sounded heavy. The resources below are always here.',
  held: 'Something you wrote is waiting for a person to read it.',
  removed: 'A moderator removed something you wrote, because it didn’t fit the group’s guidelines.',
  proApproved: 'Your licence was checked. The circled “licensed” mark now appears next to your pen name.',
  proDenied: 'Your professional application wasn’t approved this time.',
}

export const Me = () => {
  const { uid, profile, claims, user } = useMe()
  const signOut = useSignOut()
  const countVisits = useCountVisits()

  const notices = useQueryData<Notice>(`notices|${uid}`, () =>
    query(collection(db, `users/${uid}/notices`), orderBy('createdAt', 'desc'), limit(20)),
  )
  const connections = useQueryData<Connection>(`connections|${uid}`, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const byId = new Map(people.data.map((p) => [p.id, p]))

  const incoming = connections.data.filter((c) => c.status === 'pending' && c.recipient === uid)
  const outgoing = connections.data.filter((c) => c.status === 'pending' && c.requester === uid)
  const friends = connections.data.filter((c) => c.status === 'accepted')
  const blocked = connections.data.filter((c) => c.status === 'blocked' && c.blockedBy === uid)
  const unseen = notices.data.filter((n) => !n.seen)

  const personOf = (c: Connection) => {
    const p = byId.get(otherInPair(c.id, uid))
    return p ? <Who person={{ ...p, avatarSeed: p.avatarSeed || p.id }} /> : <span className="who__name">Someone</span>
  }

  return (
    <>
      <PageHead title="You" kicker="Alvaro’s Fresco Grey — PB29 PB15 PBk6" lede="Your pen name, your connections, and anything we needed to tell you." seed={33} />

      {notices.data.length > 0 && (
        <section className="section" aria-labelledby="notices">
          <div className="section__head">
            <h2 id="notices">Notes for you</h2>
            {unseen.length > 0 && (
              <button
                type="button"
                className="link-btn"
                onClick={() => unseen.forEach((n) => void updateDoc(doc(db, `users/${uid}/notices/${n.id}`), { seen: true }))}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="ruled-list">
            {notices.data.map((n) => (
              <li key={n.id} className="stack" style={{ gap: 8, opacity: n.seen ? 0.75 : 1 }}>
                <p className="pencil note">{NOTICE_TEXT[n.type]}</p>
                {n.note && <p className="meta">Note from the moderator: {n.note}</p>}
                <span className="meta">{ago(n.createdAt)}</span>
                {n.type === 'crisis' && !n.seen && <CrisisCard audience="writer" />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(incoming.length > 0 || outgoing.length > 0 || friends.length > 0 || blocked.length > 0) && (
        <section className="section" aria-labelledby="people">
          <div className="section__head">
            <h2 id="people">Your people</h2>
            <Link to="/constellation" className="code">
              Find people
            </Link>
          </div>
          <ul className="ruled-list">
            {incoming.map((c) => (
              <li key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                {personOf(c)}
                <span className="row">
                  <span className="meta">wants to connect</span>
                  <button type="button" className="act act--quiet act--wash" disabled={!claims.emailVerified} onClick={() => void acceptConnection(c.id)}>
                    Accept
                  </button>
                  <button type="button" className="link-btn" onClick={() => void removeConnection(c.id)}>
                    Not now
                  </button>
                </span>
              </li>
            ))}
            {outgoing.map((c) => (
              <li key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                {personOf(c)}
                <span className="row">
                  <span className="meta">request sent</span>
                  <button type="button" className="link-btn" onClick={() => void removeConnection(c.id)}>
                    Cancel
                  </button>
                </span>
              </li>
            ))}
            {friends.map((c) => (
              <li key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                {personOf(c)}
                <span className="row">
                  <Link to={`/messages/${c.id}`} className="link-btn">
                    Write
                  </Link>
                  <button type="button" className="link-btn" onClick={() => void removeConnection(c.id)}>
                    Disconnect
                  </button>
                  <button type="button" className="link-btn" onClick={() => void blockConnection(c.id, uid)}>
                    Block
                  </button>
                </span>
              </li>
            ))}
            {blocked.map((c) => (
              <li key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                {personOf(c)}
                <button type="button" className="link-btn" onClick={() => void removeConnection(c.id)}>
                  Unblock
                </button>
              </li>
            ))}
          </ul>
          {!claims.emailVerified && incoming.length > 0 && (
            <p className="hint">
              <Link to="/verify">Confirm your email</Link> to accept requests.
            </p>
          )}
        </section>
      )}

      <section className="section" aria-labelledby="profile">
        <div className="section__head">
          <h2 id="profile">Pen name</h2>
        </div>
        <ProfileForm key={profile.penName} uid={uid} current={profile} submitLabel="Save" />
      </section>

      <section className="section" aria-labelledby="account">
        <div className="section__head">
          <h2 id="account">Account</h2>
        </div>
        <p className="pencil note">
          Signed in as {user.email ?? 'a Google account'} — only you see this.{' '}
          {claims.emailVerified ? 'Email confirmed.' : <Link to="/verify">Confirm your email.</Link>}
        </p>
        {TELEMETRY_AVAILABLE && (
          <label className="code row" style={{ gap: 6 }}>
            <input type="checkbox" checked={countVisits === 'yes'} onChange={(e) => void setCountVisits(e.target.checked)} />
            Count my visits on this device
            <span className="meta">— which pages open and how fast they load, never your name or your writing</span>
          </label>
        )}
        <div className="row">
          <button type="button" className="act" onClick={() => void signOut()}>
            Sign out
          </button>
          <Link to="/delete-account" className="link-btn">
            Delete my account…
          </Link>
        </div>
      </section>
    </>
  )
}
