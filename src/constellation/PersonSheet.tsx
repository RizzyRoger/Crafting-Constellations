import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Report } from '../components/Report'
import { Who } from '../components/Who'
import { howToBlock } from '../lib/blocks'
import { describeError } from '../lib/callables'
import { pairIdOf } from '../lib/pair'
import { acceptConnection, blockConnection, blockPerson, removeConnection, requestConnection } from '../lib/social'
import type { Connection, Group, Profile } from '../lib/types'
import { lastChoice, revealSheet, SHEET_FLOATS } from './sheetReveal'

interface PersonSheetProps {
  person: Profile
  me: string
  verified: boolean
  connection?: Connection
  groups: Group[]
  onClose: () => void
}

// What you can do with one person, depending on where the two of you stand
export const PersonSheet = ({ person, me, verified, connection, groups, onClose }: PersonSheetProps) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sheet = useRef<HTMLElement>(null)
  const pairId = pairIdOf(me, person.id)
  const isMe = person.id === me
  const location = useLocation()
  const [chosenAt, setChosenAt] = useState(location.key)
  const choice = lastChoice(chosenAt, location)
  if (choice !== chosenAt) setChosenAt(choice)

  // Narrower than the floating overlay, the sheet opens under the chart, out of sight. Bring it
  // into view and move focus to it, so choosing someone visibly does something. This runs when the
  // sheet opens (it's keyed by person) and again each time this person is chosen while it's open
  useEffect(() => {
    const reveal = revealSheet(window.matchMedia(SHEET_FLOATS).matches, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (!reveal || !sheet.current) return
    sheet.current.scrollIntoView(reveal)
    sheet.current.focus({ preventScroll: true })
  }, [choice])

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
  // A stranger who keeps pinging you can be blocked too, with no request between you first
  const blockBy = howToBlock(connection)
  const block = () => (blockBy === 'create' ? blockPerson(me, person.id) : blockConnection(pairId, me))

  return (
    <section ref={sheet} tabIndex={-1} className="person sheet" aria-label={`About ${person.penName}`}>
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
            (verified ? (
              <button type="button" className="act act--wash" disabled={busy} onClick={run(() => requestConnection(me, person.id))}>
                Reach out
              </button>
            ) : (
              <span className="hint">
                <Link to="/verify">Confirm your email</Link> to reach out.
              </span>
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
              {verified ? (
                <button type="button" className="act act--wash" disabled={busy} onClick={run(() => acceptConnection(pairId))}>
                  Accept
                </button>
              ) : (
                <span className="hint">
                  <Link to="/verify">Confirm your email</Link> to accept.
                </span>
              )}
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

          {blockBy && (
            <button type="button" className="link-btn" disabled={busy} onClick={run(block)}>
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
