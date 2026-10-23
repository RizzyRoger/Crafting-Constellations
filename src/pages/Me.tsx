import { collection, query, where } from 'firebase/firestore'
import { Link, useLocation } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { useSignOut } from '../auth/useSignOut'
import { CheckIn } from '../components/CheckIn'
import { PageHead } from '../components/PageHead'
import { ProfileForm } from '../components/ProfileForm'
import { Who } from '../components/Who'
import { db } from '../lib/firebase'
import { isFirstClick } from '../lib/groupStanding'
import { useQueryData } from '../lib/live'
import { otherInPair } from '../lib/pair'
import { visibleById, waitingOn, withVisible } from '../lib/people'
import { hereOf } from '../lib/returnTo'
import { acceptConnection, blockConnection, removeConnection } from '../lib/social'
import { setCountVisits, TELEMETRY_AVAILABLE, useCountVisits } from '../lib/telemetry'
import type { Connection, Profile } from '../lib/types'

export const Me = () => {
  const { uid, profile, claims, user } = useMe()
  const signOut = useSignOut()
  const location = useLocation()
  const countVisits = useCountVisits()

  const connections = useQueryData<Connection>(`connections|${uid}`, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const byId = new Map(people.data.map((p) => [p.id, p]))
  const visible = visibleById(people.data)

  // Someone banned keeps their ties but drops out of these lists; the ones I blocked stay, so I can undo it
  const incoming = waitingOn(connections.data, visible, uid)
  const outgoing = withVisible(connections.data.filter((c) => c.status === 'pending' && c.requester === uid), visible, uid)
  const friends = withVisible(connections.data.filter((c) => c.status === 'accepted'), visible, uid)
  const blocked = connections.data.filter((c) => c.status === 'blocked' && c.blockedBy === uid)

  // Only a first click (or a key) acts. Each of these moves its row or drops it at once, and the
  // next row's button slides up under the second click of a double-click
  const onFirstClick = (work: () => Promise<unknown>) => (e: { detail: number }) => {
    if (isFirstClick(e.detail)) void work()
  }

  const personOf = (c: Connection) => {
    const p = byId.get(otherInPair(c.id, uid))
    return p ? <Who person={{ ...p, avatarSeed: p.avatarSeed || p.id }} /> : <span className="who__name">Someone</span>
  }

  return (
    <>
      <PageHead
        title="You"
        kicker="Alvaro’s Fresco Grey — PB29 PB15 PBk6"
        lede={
          <>
            Your pen name and your connections. Mentions, replies and notes for you are in <Link to="/notifications">Notifications</Link>.
          </>
        }
        seed={33}
      />

      <CheckIn />

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
                  <button type="button" className="act act--quiet act--wash" disabled={!claims.emailVerified} onClick={onFirstClick(() => acceptConnection(c.id))}>
                    Accept
                  </button>
                  <button type="button" className="link-btn" onClick={onFirstClick(() => removeConnection(c.id))}>
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
                  <button type="button" className="link-btn" onClick={onFirstClick(() => removeConnection(c.id))}>
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
                  <button type="button" className="link-btn" onClick={onFirstClick(() => removeConnection(c.id))}>
                    Disconnect
                  </button>
                  <button type="button" className="link-btn" onClick={onFirstClick(() => blockConnection(c.id, uid))}>
                    Block
                  </button>
                </span>
              </li>
            ))}
            {blocked.map((c) => (
              <li key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                {personOf(c)}
                <button type="button" className="link-btn" onClick={onFirstClick(() => removeConnection(c.id))}>
                  Unblock
                </button>
              </li>
            ))}
          </ul>
          {!claims.emailVerified && incoming.length > 0 && (
            <p className="hint">
              <Link to="/verify" state={{ from: hereOf(location) }}>Confirm your email</Link> to accept requests.
            </p>
          )}
        </section>
      )}

      <section className="section" aria-labelledby="profile">
        <div className="section__head">
          <h2 id="profile">Pen name</h2>
        </div>
        {/* Keyed on the person, not the pen name: its own rename would remount it and lose 'Saved.' and the crisis card */}
        <ProfileForm key={uid} uid={uid} current={profile} submitLabel="Save" />
      </section>

      <section className="section" aria-labelledby="account">
        <div className="section__head">
          <h2 id="account">Account</h2>
        </div>
        <p className="pencil note">
          Signed in as {user.email ?? 'a Google account'} — only you see this.{' '}
          {claims.emailVerified ? 'Email confirmed.' : <Link to="/verify" state={{ from: hereOf(location) }}>Confirm your email.</Link>}
        </p>
        {TELEMETRY_AVAILABLE && (
          <label className="code row" style={{ gap: 6 }}>
            <input type="checkbox" checked={countVisits === 'yes'} onChange={(e) => void setCountVisits(e.target.checked)} />
            Count my visits on this device
            <span className="meta">
              — page addresses and load times. An address can hold account, group, post and chat ids and a group’s name, never your
              name or anything you write
            </span>
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
