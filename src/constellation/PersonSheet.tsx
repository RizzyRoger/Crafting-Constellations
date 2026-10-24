import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Report } from '../components/Report'
import { Who } from '../components/Who'
import { howToBlock } from '../lib/blocks'
import { describeError } from '../lib/callables'
import { isFirstClick } from '../lib/groupStanding'
import { pairIdOf } from '../lib/pair'
import { hereOf } from '../lib/returnTo'
import { acceptConnection, blockConnection, blockPerson, removeConnection, requestConnection } from '../lib/social'
import { tieSaid, type TieChange } from '../lib/tieSaid'
import type { Connection, Group, Profile } from '../lib/types'
import { focusOnClose, lastChoice, openerOf, revealSheet } from './sheetReveal'

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
  // What the last change did, for screen readers: the row shows it to everyone else
  const [said, setSaid] = useState('')
  const sheet = useRef<HTMLElement>(null)
  const pairId = pairIdOf(me, person.id)
  const isMe = person.id === me
  const location = useLocation()
  const [chosenAt, setChosenAt] = useState(location.key)
  const choice = lastChoice(chosenAt, location)
  if (choice !== chosenAt) setChosenAt(choice)
  const opener = useRef<HTMLElement | SVGElement | null>(null)

  // Whether it opens under the chart or floats at the top of a chart scrolled past, the sheet can
  // be out of sight. Bring it into view and move focus to it, so choosing someone visibly does
  // something, and note what chose them to give focus back on closing. This runs when the sheet
  // opens (it's keyed by person) and again each time this person is chosen while it's open
  useEffect(() => {
    const here = sheet.current
    if (!here) return
    const active = document.activeElement
    opener.current = openerOf(opener.current, active instanceof HTMLElement || active instanceof SVGElement ? active : null, { body: document.body, sheet: here })
    here.scrollIntoView(revealSheet(window.matchMedia('(prefers-reduced-motion: reduce)').matches))
    here.focus({ preventScroll: true })
  }, [choice])

  // Closing takes the focused Close button away with the sheet, which would drop focus to the
  // top of the page. Move it first, letting it scroll into sight
  const close = () => {
    focusOnClose(opener.current, sheet.current?.parentElement ?? null)?.focus()
    onClose()
  }

  // Only a first click (or a key) acts: each change swaps the row's buttons at once, and Block or
  // Reach out slides under the second click of a double-click. The button pressed goes with the
  // change, so focus moves first, to the sheet
  const run = (change: TieChange, action: () => Promise<unknown>) => async (e: { detail: number }) => {
    if (!isFirstClick(e.detail)) return
    setBusy(true)
    setError(null)
    setSaid('')
    sheet.current?.focus({ preventScroll: true })
    try {
      await action()
      setSaid(tieSaid(change, person.penName))
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
        <button type="button" className="link-btn" onClick={close}>
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
              <button type="button" className="act act--wash" disabled={busy} onClick={run('request', () => requestConnection(me, person.id))}>
                Reach out
              </button>
            ) : (
              <span className="hint">
                <Link to="/verify" state={{ from: hereOf(location) }}>Confirm your email</Link> to reach out.
              </span>
            ))}

          {status === 'pending' && iAsked && (
            <>
              <span className="pencil">Request sent.</span>
              <button type="button" className="link-btn" disabled={busy} onClick={run('cancel', () => removeConnection(pairId))}>
                Cancel
              </button>
            </>
          )}

          {status === 'pending' && !iAsked && (
            <>
              {verified ? (
                <button type="button" className="act act--wash" disabled={busy} onClick={run('accept', () => acceptConnection(pairId))}>
                  Accept
                </button>
              ) : (
                <span className="hint">
                  <Link to="/verify" state={{ from: hereOf(location) }}>Confirm your email</Link> to accept.
                </span>
              )}
              <button type="button" className="act" disabled={busy} onClick={run('decline', () => removeConnection(pairId))}>
                Not now
              </button>
            </>
          )}

          {status === 'accepted' && (
            <>
              <Link to={`/messages/${pairId}`} className="act act--wash">
                Write privately
              </Link>
              <button type="button" className="link-btn" disabled={busy} onClick={run('disconnect', () => removeConnection(pairId))}>
                Disconnect
              </button>
            </>
          )}

          {blockedByMe && (
            <>
              <span className="pencil">You blocked this person.</span>
              <button type="button" className="link-btn" disabled={busy} onClick={run('unblock', () => removeConnection(pairId))}>
                Unblock
              </button>
            </>
          )}

          {blockBy && (
            <button type="button" className="link-btn" disabled={busy} onClick={run('block', block)}>
              Block
            </button>
          )}
        </div>
      )}

      {/* Mounted with the sheet, so screen readers announce what a change did when it lands */}
      <p className="visually-hidden" role="status">
        {said}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!isMe && <Report contentPath={`users/${person.id}`} me={me} />}
    </section>
  )
}
