import { checkPenName, PEN_NAME_HINTS, suggestPenName } from '@moderation'
import { useState, type FormEvent } from 'react'
import { describeError, problemOf, saveProfile } from '../lib/callables'
import { profileErrorOf, type ProfileError } from '../lib/profileError'
import { followStored, storedFields } from '../lib/profileFields'
import type { Profile } from '../lib/types'
import { Blot } from '../wash/Blot'
import { PIGMENT_NAMES, PIGMENTS, type Pigment } from '../wash/pigments'
import { Swatch } from '../wash/Swatch'
import { CrisisCard } from './CrisisCard'

interface ProfileFormProps {
  uid: string
  current?: Profile | null
  submitLabel: string
  // A save that lands calls onSaved: straight away, or after a crisis note once the person chooses to go on
  onSaved?: () => void
  // Lets the page wait for a save's answer: true as it goes out. One that fails sends false, unless
  // an earlier crisis card is still up
  onHold?: (held: boolean) => void
}

// Pen name, pigment, and a short note. The server re-checks everything.
export const ProfileForm = ({ uid, current, submitLabel, onSaved, onHold }: ProfileFormProps) => {
  const [penName, setPenName] = useState(current?.penName ?? suggestPenName())
  const [pigment, setPigment] = useState<Pigment>((current?.pigment as Pigment) ?? 'paynesBlue')
  const [note, setNote] = useState(current?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ProfileError | null>(null)
  const [crisis, setCrisis] = useState(false)
  const [saved, setSaved] = useState(false)

  // The stored name and note the fields last followed. The form stays mounted across saves to keep 'Saved.'
  // and the crisis card, so a change made elsewhere (a moderator's reset) is carried into the fields here
  const latest = storedFields(current)
  const [stored, setStored] = useState(latest)
  if (latest.penName !== stored.penName || latest.note !== stored.note) {
    const next = followStored({ penName, note }, stored, latest)
    setStored(latest)
    setPenName(next.penName)
    setNote(next.note)
  }

  const check = checkPenName(penName)
  const hint = check.ok ? null : PEN_NAME_HINTS[check.problem]
  // A name that holds crisis language is refused like any other, but the resources come with it
  const nameCrisis = !check.ok && check.problem === 'crisis'
  const noteError = error?.at === 'note' ? error.text : null
  const formError = error?.at === 'form' ? error.text : null

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!check.ok) return
    setBusy(true)
    setError(null)
    setSaved(false)
    onHold?.(true)
    try {
      const result = await saveProfile({ penName: check.value, pigment, note })
      setCrisis(result.crisis)
      setSaved(true)
      if (!result.crisis) onSaved?.()
    } catch (e) {
      onHold?.(crisis)
      setError(profileErrorOf(e instanceof Error ? e.message : '', problemOf(e), describeError(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={save} style={{ maxWidth: 560 }}>
      <div className="person__head">
        <Blot seed={current?.avatarSeed ?? uid} pigment={pigment} size={56} />
        <span className="person__name">{check.ok ? check.value : penName || '…'}</span>
      </div>

      <div className="field">
        <label htmlFor="pen-name">Pen name</label>
        <input id="pen-name" value={penName} maxLength={40} onChange={(e) => setPenName(e.target.value)} aria-describedby="pen-name-hint" />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span id="pen-name-hint" className="hint">
            {hint ?? 'This is the only name anyone here will see.'}
          </span>
          <button type="button" className="link-btn" onClick={() => setPenName(suggestPenName())}>
            Suggest another
          </button>
        </div>
      </div>

      <fieldset className="pigments">
        <legend>Your pigment (colours your wash blot)</legend>
        {PIGMENTS.map((p, i) => (
          <label key={p}>
            <input type="radio" name="pigment" value={p} checked={pigment === p} onChange={() => setPigment(p)} />
            <Swatch pigment={p} seed={300 + i} />
            <span className="code">{PIGMENT_NAMES[p]}</span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor="note">A short note about you (optional, 160 characters)</label>
        <textarea
          id="note"
          rows={2}
          maxLength={160}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Daughter, far from home. Here mostly at night."
          aria-describedby={noteError ? 'note-hint note-error' : 'note-hint'}
          aria-invalid={noteError ? true : undefined}
        />
        {/* Profiles are open to everyone signed in (firestore.rules users/{uid}), not just your groups */}
        <span id="note-hint" className="hint">
          Anyone signed in here can see this. Skip anything that could identify you.
        </span>
        {noteError && (
          <p id="note-error" className="error" role="alert">
            {noteError}
          </p>
        )}
      </div>

      {formError && (
        <p className="error" role="alert">
          {formError}
        </p>
      )}
      {/* Mounted from the start: screen readers often skip a polite region that arrives already holding its news */}
      <div className="stack live" aria-live="polite">
        {crisis ? (
          <>
            <p className="hint">Saved, except the note.</p>
            <CrisisCard audience="writer" />
          </>
        ) : nameCrisis ? (
          <CrisisCard audience="writer" />
        ) : (
          saved && !onSaved && <p className="hint">Saved.</p>
        )}
      </div>

      <div className="row">
        <button type="submit" className="act act--wash" disabled={busy || !check.ok}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {/* A crisis note doesn't move on by itself, so the resources stay until the person is ready */}
        {crisis && onSaved && (
          <button type="button" className="link-btn" onClick={onSaved}>
            Continue without the note
          </button>
        )}
      </div>
    </form>
  )
}
