import { tidyPenName } from '@moderation'
import { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { leaveThenSignOut } from '../auth/useSignOut'
import { deleteAccount, describeError, problemOf } from '../lib/callables'
import { track } from '../lib/telemetry'
import { AuthLayout } from './AuthLayout'

// Must match NO_PROFILE_WORD in functions/src/accountPolicy.ts
const NO_PROFILE_WORD = 'delete'

const PROBLEMS: Record<string, string> = {
  admin: 'Moderators can’t delete their own account. Ask another moderator to remove your moderator role first.',
  'recent-login': 'For your safety, confirm it’s you again, then try once more.',
  confirm: 'That doesn’t match. Type it exactly as shown above the box.',
  paused: 'This account is paused, so it can’t be deleted from here.',
}

export const DeleteAccount = () => {
  const { user, profile, claims } = useAuth()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  // Password accounts confirm with their password; Google accounts in Google's window
  const usesPassword = user.providerData.some((p) => p.providerId === 'password')
  // Read live: if a first try got partway, the profile is already gone and the word changes
  const word = profile?.penName ?? NO_PROFILE_WORD
  const matches = tidyPenName(confirm).toLowerCase() === word.toLowerCase()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await (usesPassword
        ? reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', password))
        : reauthenticateWithPopup(user, new GoogleAuthProvider()))
      await deleteAccount({ confirm })
      track('delete_account', {})
      // The front page goes up before signOut, as signing out from anywhere does
      await leaveThenSignOut(navigate, '/', { state: { left: true } })
    } catch (e) {
      const problem = problemOf(e)
      setError((problem && PROBLEMS[problem]) || describeError(e))
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Delete my account" lede="This can’t be undone.">
      <div className="stack" style={{ gap: 10 }}>
        <p className="pencil note">Deleting removes, for everyone:</p>
        <ul className="ruled-list ruled-list--tight hint">
          <li>your pen name and profile</li>
          <li>your posts, with the replies and likes under them</li>
          <li>your comments, group messages and likes</li>
          <li>your private notes — both sides of every conversation</li>
          <li>your connections, and any licence documents</li>
        </ul>
        <p className="code">Moderators keep a record that an account was deleted, with no name and no writing.</p>
      </div>

      {claims.admin ? (
        <p className="hint">{PROBLEMS.admin}</p>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="confirm">
              Type <strong>{word}</strong> to confirm
            </label>
            <input id="confirm" autoComplete="off" spellCheck={false} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {usesPassword && (
            <div className="field">
              <label htmlFor="password">Your password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" className="act" disabled={busy || !matches}>
              {busy ? 'Deleting…' : usesPassword ? 'Delete everything' : 'Confirm with Google and delete'}
            </button>
            <Link to={profile ? '/me' : '/onboarding'} className="link-btn">
              Keep my account
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
