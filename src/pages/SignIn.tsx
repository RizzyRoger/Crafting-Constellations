import { FirebaseError } from 'firebase/app'
import { GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePausedNote } from '../auth/pausedNote'
import { describeError } from '../lib/callables'
import { auth } from '../lib/firebase'
import { returnTo } from '../lib/returnTo'
import { trackSignIn } from '../lib/telemetry'
import { AuthLayout } from './AuthLayout'

export const SignIn = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const next = returnTo(location.state)
  const paused = usePausedNote()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // Signed out mid-visit by a pause: say why in the words a refused sign-in gets
  const shown = error ?? (paused ? describeError(new FirebaseError('auth/user-disabled', 'Paused by a moderator')) : null)

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      trackSignIn(await signInWithEmailAndPassword(auth, email.trim(), password), 'password')
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
      trackSignIn(await signInWithPopup(auth, new GoogleAuthProvider()), 'google')
      navigate(next, { replace: true })
    } catch (e) {
      setError(describeError(e))
    }
  }

  const reset = async () => {
    // Emptied first, so a second press is announced again
    setNote(null)
    if (!email.trim()) {
      setError('Write your email above first.')
      return
    }
    // An older error would sit beside the note that a link is on its way
    setError(null)
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
        {shown && (
          <p className="error" role="alert">
            {shown}
          </p>
        )}
        {/* Mounted from the start, so screen readers announce the note when it lands */}
        <p className="hint live" role="status">
          {note}
        </p>
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
          New here? <Link to="/signup" state={location.state}>Make a pen name</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
