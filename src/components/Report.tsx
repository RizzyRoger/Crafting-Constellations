import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { describeError } from '../lib/callables'
import { db } from '../lib/firebase'
import { focusForNow } from '../lib/focusForNow'

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
  const reportButton = useRef<HTMLButtonElement>(null)
  const reasonField = useRef<HTMLSelectElement>(null)
  const sendButton = useRef<HTMLButtonElement>(null)
  const thanks = useRef<HTMLSpanElement>(null)
  // Opening, Cancel and a sent report each swap out the button pressed, and sending disables it,
  // which drops focus out of the page. Focus goes on to what takes its place, once that's there
  const next = useRef<RefObject<HTMLElement | null>>(null)
  useEffect(() => {
    const to = next.current?.current
    next.current = null
    if (!to) return
    if (to === thanks.current) focusForNow(to)
    else to.focus()
  }, [open, state])

  if (!open && state !== 'sent') {
    return (
      <button
        ref={reportButton}
        type="button"
        className="link-btn"
        onClick={() => {
          next.current = reasonField
          setOpen(true)
        }}
      >
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
      next.current = thanks
      setState('sent')
    } catch (e) {
      next.current = sendButton
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
            <select ref={reasonField} id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)}>
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
            <button ref={sendButton} type="button" className="act act--quiet" onClick={send} disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                next.current = reportButton
                setOpen(false)
              }}
              disabled={state === 'sending'}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Mounted with the form, before the thanks lands in it: talk and private notes aren't
          live, and a polite region that arrives already holding its words is often never read */}
      <span ref={thanks} className="meta live" role="status">
        {state === 'sent' && 'Thanks — a person will look at this.'}
      </span>
    </>
  )
}
