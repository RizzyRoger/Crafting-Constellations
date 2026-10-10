import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Report } from '../components/Report'
import { Who } from '../components/Who'
import { describeError } from '../lib/callables'
import { pairIdOf } from '../lib/pair'
import { acceptConnection, blockConnection, removeConnection, requestConnection } from '../lib/social'
import type { Connection, Group, Profile } from '../lib/types'

interface PersonSheetProps {
  person: Profile
  me: string
  verified: boolean
  connection?: Connection
  groups: Group[]
  onClose: () => void
  canReachOut?: boolean
}

// What you can do with one person, depending on where the two of you stand
export const PersonSheet = ({ person, me, verified, connection, groups, onClose, canReachOut = true }: PersonSheetProps) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pairId = pairIdOf(me, person.id)
  const isMe = person.id === me

  const run = (action: () => Promise<unknown>) => async () => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const status = connection?.status
  const iAsked = connection?.requester === me
  const blockedByMe = status === 'blocked' && connection?.blockedBy === me

  return (
    <section className="person sheet" aria-label={`About ${person.penName}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Who person={{ ...person, avatarSeed: person.avatarSeed || person.id }} size={44} />
        <button type="button" className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {person.note && <p className="pencil note">{person.note}</p>}

      {groups.length > 0 && (
        <p className="code">
          In:{' '}
          {groups.map((g, i) => (
            <span key={g.id}>
              {i > 0 && ', '}
              <Link to={`/groups/${g.id}`}>{g.name}</Link>
            </span>
          ))}
        </p>
      )}

      {isMe ? (
        <Link to="/me" className="act act--quiet" style={{ justifySelf: 'start' }}>
          This is you — edit
        </Link>
      ) : status === 'blocked' && !blockedByMe ? (
        <p className="meta">Not available.</p>
      ) : (
        <div className="row">
          {!connection &&
            (canReachOut ? (
              verified ? (
                <button type="button" className="act act--wash" disabled={busy} onClick={run(() => requestConnection(me, person.id))}>
                  Reach out
                </button>
              ) : (
                <span className="hint">
                  <Link to="/verify">Confirm your email</Link> to reach out.
                </span>
              )
            ) : (
              <p className="meta">A friend’s friend. They can connect with you first.</p>
            ))}

          {status === 'pending' && iAsked && (
            <>
              <span className="pencil">Request sent.</span>
              <button type="button" className="link-btn" disabled={busy} onClick={run(() => removeConnection(pairId))}>
                Cancel
              </button>
            </>
          )}

          {status === 'pending' && !iAsked && (
            <>
              <button type="button" className="act act--wash" disabled={busy || !verified} onClick={run(() => acceptConnection(pairId))}>
                Accept
              </button>
              <button type="button" className="act" disabled={busy} onClick={run(() => removeConnection(pairId))}>
                Not now
              </button>
            </>
          )}

          {status === 'accepted' && (
            <>
              <Link to={`/messages/${pairId}`} className="act act--wash">
                Write privately
              </Link>
              <button type="button" className="link-btn" disabled={busy} onClick={run(() => removeConnection(pairId))}>
                Disconnect
              </button>
            </>
          )}

          {blockedByMe && (
            <>
              <span className="pencil">You blocked this person.</span>
              <button type="button" className="link-btn" disabled={busy} onClick={run(() => removeConnection(pairId))}>
                Unblock
              </button>
            </>
          )}

          {connection && status !== 'blocked' && (
            <button type="button" className="link-btn" disabled={busy} onClick={run(() => blockConnection(pairId, me))}>
              Block
            </button>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {!isMe && <Report contentPath={`users/${person.id}`} me={me} />}
    </section>
  )
}
