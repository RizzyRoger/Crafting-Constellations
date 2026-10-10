import { checkPenName, PEN_NAME_HINTS, suggestPenName, type PenNameProblem } from '@moderation'
import { useState, type FormEvent } from 'react'
import { describeError, problemOf, saveProfile } from '../lib/callables'
import type { Profile } from '../lib/types'
import { Blot } from '../wash/Blot'
import { PIGMENT_NAMES, PIGMENTS, type Pigment } from '../wash/pigments'
import { Swatch } from '../wash/Swatch'
import { CrisisCard } from './CrisisCard'

interface ProfileFormProps {
  uid: string
  current?: Profile | null
  submitLabel: string
  onSaved?: () => void
}

// Pen name, pigment, and a short note. The server re-checks everything.
export const ProfileForm = ({ uid, current, submitLabel, onSaved }: ProfileFormProps) => {
  const [penName, setPenName] = useState(current?.penName ?? suggestPenName())
  const [pigment, setPigment] = useState<Pigment>((current?.pigment as Pigment) ?? 'paynesBlue')
  const [note, setNote] = useState(current?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [crisis, setCrisis] = useState(false)
  const [saved, setSaved] = useState(false)

  const check = checkPenName(penName)
  const hint = check.ok ? null : PEN_NAME_HINTS[check.problem]

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!check.ok) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const result = await saveProfile({ penName: check.value, pigment, note })
      setCrisis(result.crisis)
      setSaved(true)
      if (!result.crisis) onSaved?.()
    } catch (e) {
      const problem = problemOf(e)
      setError(problem === 'taken' ? 'Someone already uses that pen name.' : problem && problem in PEN_NAME_HINTS ? PEN_NAME_HINTS[problem as PenNameProblem] : describeError(e))
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
        <textarea id="note" rows={2} maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Daughter, far from home. Here mostly at night." />
        <span className="hint">Shown to people in your groups. Skip anything that could identify you.</span>
      </div>

      {error && <p className="error">{error}</p>}
      {saved && !crisis && !onSaved && <p className="hint">Saved.</p>}
      {crisis && <CrisisCard audience="writer" />}

      <div className="row">
        <button type="submit" className="act act--wash" disabled={busy || !check.ok}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
