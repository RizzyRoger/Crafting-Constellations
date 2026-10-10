import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { PageHead } from '../components/PageHead'
import { bootstrapAdmin, describeError } from '../lib/callables'

// For the first admin: works only for verified emails on the ADMIN_EMAILS list
export const AdminClaim = () => {
  const { claims, refreshClaims } = useMe()
  const [error, setError] = useState<string | null>(null)

  if (claims.admin) return <Navigate to="/admin" replace />

  const claim = async () => {
    setError(null)
    try {
      await bootstrapAdmin({})
      await refreshClaims()
    } catch (e) {
      setError(describeError(e))
    }
  }

  return (
    <>
      <PageHead title="Review" kicker="Moderators only" lede="This sheet is for the people who review flagged writing and licence applications." seed={11} />
      <div className="stack" style={{ maxWidth: 520 }}>
        <p className="pencil note">If your confirmed email is on the moderator list, you can open it here.</p>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="act" onClick={() => void claim()}>
            I’m on the moderator list
          </button>
        </div>
      </div>
    </>
  )
}
