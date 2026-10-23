import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useId, useState, type CSSProperties } from 'react'
import { describeError } from '../lib/callables'
import { db } from '../lib/firebase'

const REASONS = [
  ['harassment', 'Unkind or harassing'],
  ['hate', 'Hateful'],
  ['selfHarm', 'Someone may be in danger'],
  ['spam', 'Spam or selling'],
  ['personalInfo', 'Shares private details'],
  ['impersonation', 'Pretending to be someone'],
  ['other', 'Something else'],
] as const

// A quiet report link that opens a two-field form in place
export const Report = ({ contentPath, me }: { contentPath: string; me: string }) => {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>('harassment')
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  if (!open && state !== 'sent') {
    return (
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        Report
      </button>
    )
  }

  const send = async () => {
    setState('sending')
    setError(null)
    try {
      await addDoc(collection(db, 'reports'), {
        reporterUid: me,
        contentPath,
        reason,
        ...(details.trim() ? { details: details.trim().slice(0, 500) } : {}),
        createdAt: serverTimestamp(),
      })
      setState('sent')
    } catch (e) {
      setError(describeError(e))
      setState('idle')
    }
  }

  return (
    <>
      {state !== 'sent' && (
        <div className="stack" style={{ '--gap': '10px', maxWidth: 420 } as CSSProperties}>
          <div className="field">
            <label htmlFor={`${id}-reason`}>What’s wrong</label>
            <select id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-details`}>Anything else (optional)</label>
            <input id={`${id}-details`} value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} />
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {/* A report on its way can't be called back, and closing the form here would take the
              status region with it, so the thanks or the error would land unannounced */}
          <div className="row">
            <button type="button" className="act act--quiet" onClick={send} disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" className="link-btn" onClick={() => setOpen(false)} disabled={state === 'sending'}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Mounted with the form, before the thanks lands in it: talk and private notes aren't
          live, and a polite region that arrives already holding its words is often never read */}
      <span className="meta live" role="status">
        {state === 'sent' && 'Thanks — a person will look at this.'}
      </span>
    </>
  )
}
