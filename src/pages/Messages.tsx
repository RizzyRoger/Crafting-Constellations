import { collection, query, where, type Timestamp } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { PageHead } from '../components/PageHead'
import { Who } from '../components/Who'
import { db } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import { otherInPair } from '../lib/pair'
import { ago } from '../lib/time'
import type { Connection, Profile } from '../lib/types'
import { HEAD_DESCENDING } from '../wash/strokes'

interface Thread {
  id: string
  uids: string[]
  lastMessageAt: Timestamp | null
  lastAuthorUid: string
}

// Private notes: threads with people you've connected with
export const Messages = () => {
  const { uid, claims } = useMe()
  const verified = claims.emailVerified

  const connections = useQueryData<Connection>(`connections|${uid}`, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )
  const threads = useQueryData<Thread>(verified ? `threads|${uid}` : null, () =>
    query(collection(db, 'dms'), where('uids', 'array-contains', uid)),
  )
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const byId = new Map(people.data.map((p) => [p.id, p]))

  const accepted = connections.data.filter((c) => c.status === 'accepted')
  const threadIds = new Set(threads.data.map((t) => t.id))
  const sorted = [...threads.data].sort((a, b) => (b.lastMessageAt?.toMillis() ?? 0) - (a.lastMessageAt?.toMillis() ?? 0))
  const quiet = accepted.filter((c) => !threadIds.has(c.id))

  return (
    <>
      <PageHead
        title="Private notes"
        kicker="Fresco Grey — PB29 PB15 PBk6"
        lede="One-to-one, with people you’ve connected with. Messages are checked like everything else, and a moderator only sees one if it’s flagged or reported."
        strokes={HEAD_DESCENDING}
        seed={77}
      />

      {!verified ? (
        <div className="banner">
          <p className="pencil note">Private notes open once your email is confirmed. It keeps everyone here a bit safer.</p>
          <Link to="/verify" className="act act--wash" style={{ justifySelf: 'start' }}>
            Confirm email
          </Link>
        </div>
      ) : (
        <>
          <section className="section" aria-labelledby="threads">
            <div className="section__head">
              <h2 id="threads">Conversations</h2>
            </div>
            {sorted.length === 0 ? (
              <p className="empty">No conversations yet.</p>
            ) : (
              <ul className="ruled-list">
                {sorted.map((t) => {
                  const other = byId.get(otherInPair(t.id, uid))
                  return (
                    <li key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <Link to={`/messages/${t.id}`} style={{ textDecoration: 'none' }}>
                        {other ? <Who person={{ ...other, avatarSeed: other.avatarSeed || other.id }} /> : 'Someone'}
                      </Link>
                      <span className="meta">
                        {t.lastAuthorUid === uid ? 'you wrote ' : ''}
                        {ago(t.lastMessageAt)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {quiet.length > 0 && (
            <section className="section" aria-labelledby="connected">
              <div className="section__head">
                <h2 id="connected">Connected, not yet written</h2>
              </div>
              <ul className="ruled-list">
                {quiet.map((c) => {
                  const other = byId.get(otherInPair(c.id, uid))
                  return (
                    <li key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                      {other ? <Who person={{ ...other, avatarSeed: other.avatarSeed || other.id }} /> : <span>Someone</span>}
                      <Link to={`/messages/${c.id}`} className="act act--quiet">
                        Write
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {accepted.length === 0 && (
            <p className="pencil note">
              To write privately, reach out to someone from your <Link to="/constellation">constellation</Link>. Once they accept, you can write here.
            </p>
          )}
        </>
      )}
    </>
  )
}
