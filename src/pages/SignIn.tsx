import { GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { describeError } from '../lib/callables'
import { auth } from '../lib/firebase'
import { AuthLayout } from './AuthLayout'

export const SignIn = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const next = (location.state as { from?: string } | null)?.from ?? '/constellation'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      navigate(next, { replace: true })
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setError(null)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
      navigate(next, { replace: true })
    } catch (e) {
      setError(describeError(e))
    }
  }

  const reset = async () => {
    if (!email.trim()) {
      setError('Write your email above first.')
      return
    }
    await sendPasswordResetEmail(auth, email.trim()).catch(() => undefined)
    setNote('If that email has an account, a reset link is on its way.')
  }

  return (
    <AuthLayout title="Sign in" lede="Welcome back.">
      <form className="form" onSubmit={signIn}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="error">{error}</p>}
        {note && <p className="hint">{note}</p>}
        <div className="row">
          <button type="submit" className="act act--wash" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" className="link-btn" onClick={() => void reset()}>
            Forgot password
          </button>
        </div>
        <p className="or code">or</p>
        <div className="row">
          <button type="button" className="act" onClick={() => void google()}>
            Continue with Google
          </button>
        </div>
        <p className="code">
          New here? <Link to="/signup">Make a pen name</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
