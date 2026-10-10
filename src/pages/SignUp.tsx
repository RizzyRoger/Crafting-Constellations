import { createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, signInWithPopup } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { describeError } from '../lib/callables'
import { auth } from '../lib/firebase'
import { trackSignIn } from '../lib/telemetry'
import { AuthLayout } from './AuthLayout'

export const SignUp = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
      trackSignIn(credential, 'password')
      await sendEmailVerification(credential.user).catch(() => undefined)
      navigate('/onboarding')
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setError(null)
    try {
      trackSignIn(await signInWithPopup(auth, new GoogleAuthProvider()), 'google')
      navigate('/onboarding')
    } catch (e) {
      setError(describeError(e))
    }
  }

  return (
    <AuthLayout
      title="Make a pen name"
      lede="Your email stays private — only you and the sign-in system see it. Everyone else sees the pen name you choose next."
    >
      <form className="form" onSubmit={create}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password (8 or more characters)</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" className="act act--wash" disabled={busy}>
            {busy ? 'Creating…' : 'Continue'}
          </button>
        </div>
        <p className="or code">or</p>
        <div className="row">
          <button type="button" className="act" onClick={() => void google()}>
            Continue with Google
          </button>
        </div>
        <p className="code">
          Already here? <Link to="/signin">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
