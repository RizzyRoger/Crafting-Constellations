import { sendEmailVerification } from 'firebase/auth'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { describeError } from '../lib/callables'
import { USING_EMULATORS } from '../lib/firebase'
import { afterVerify } from '../lib/returnTo'
import { AuthLayout } from './AuthLayout'

export const Verify = () => {
  const { user, claims, profile, refreshClaims } = useAuth()
  const [note, setNote] = useState<string | null>(null)
  // Back to the page that sent them here, where the composer is now open
  const next = afterVerify(profile !== null, useLocation().state)

  // Each press empties the note first, so the same words are announced again. A refusal (too
  // many sends, no connection) says why: they're signed in, so there's no address to hide
  const resend = async () => {
    if (!user) return
    setNote(null)
    try {
      await sendEmailVerification(user)
      setNote('Sent again. It can take a minute.')
    } catch (e) {
      setNote(describeError(e))
    }
  }

  const check = async () => {
    setNote(null)
    try {
      await refreshClaims()
      setNote(user?.emailVerified ? null : 'Not confirmed yet. Open the link in the email, then try again.')
    } catch (e) {
      setNote(describeError(e))
    }
  }

  if (claims.emailVerified) {
    return (
      <AuthLayout title="Email confirmed" lede="Private notes and reaching out are open to you now.">
        <Link to={next.to} state={next.state} className="act act--wash" style={{ justifySelf: 'start' }}>
          Continue
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Confirm your email"
      lede="We sent a link to your email. Confirming it lets you write privately and reach out to people. Groups are open to you already."
    >
      <div className="stack">
        {USING_EMULATORS && <p className="meta">Local emulator: the link is in the Auth emulator log (terminal running the emulators).</p>}
        {/* Mounted from the start, so screen readers announce the note when it lands */}
        <p className="hint live" role="status">
          {note}
        </p>
        <div className="row">
          <button type="button" className="act act--wash" onClick={() => void check()}>
            I’ve confirmed it
          </button>
          <button type="button" className="act" onClick={() => void resend()}>
            Send it again
          </button>
        </div>
        <Link to={next.to} state={next.state} className="code">
          Later
        </Link>
      </div>
    </AuthLayout>
  )
}
