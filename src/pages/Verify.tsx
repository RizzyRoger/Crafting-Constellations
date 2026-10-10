import { sendEmailVerification } from 'firebase/auth'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { USING_EMULATORS } from '../lib/firebase'
import { AuthLayout } from './AuthLayout'

export const Verify = () => {
  const { user, claims, profile, refreshClaims } = useAuth()
  const [note, setNote] = useState<string | null>(null)

  const resend = async () => {
    if (!user) return
    await sendEmailVerification(user).catch(() => undefined)
    setNote('Sent again. It can take a minute.')
  }

  const check = async () => {
    await refreshClaims()
    setNote(user?.emailVerified ? null : 'Not confirmed yet. Open the link in the email, then try again.')
  }

  const next = profile ? '/constellation' : '/onboarding'

  if (claims.emailVerified) {
    return (
      <AuthLayout title="Email confirmed" lede="Private notes and reaching out are open to you now.">
        <Link to={next} className="act act--wash" style={{ justifySelf: 'start' }}>
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
        {note && <p className="hint">{note}</p>}
        <div className="row">
          <button type="button" className="act act--wash" onClick={() => void check()}>
            I’ve confirmed it
          </button>
          <button type="button" className="act" onClick={() => void resend()}>
            Send it again
          </button>
        </div>
        <Link to={next} className="code">
          Later
        </Link>
      </div>
    </AuthLayout>
  )
}
