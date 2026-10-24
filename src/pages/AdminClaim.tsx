import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { claimModerator } from '../auth/moderator'
import { PageHead } from '../components/PageHead'
import { bootstrapAdmin, describeError } from '../lib/callables'

// Where Review sends anyone whose token doesn't say moderator. Someone another moderator made one
// gets in with a fresh token; the first moderator needs a verified email on the ADMIN_EMAILS list
export const AdminClaim = () => {
  const { claims, refreshClaims } = useMe()
  const [error, setError] = useState<string | null>(null)

  // The token here can predate "Make moderator" by up to an hour; a fresh one opens Review
  useEffect(() => {
    refreshClaims().catch(() => undefined)
  }, [refreshClaims])

  if (claims.admin) return <Navigate to="/admin" replace />

  const claim = async () => {
    setError(null)
    try {
      await claimModerator({ refresh: refreshClaims, bootstrap: () => bootstrapAdmin({}) })
    } catch (e) {
      setError(describeError(e))
    }
  }

  return (
    <>
      <PageHead title="Review" kicker="Moderators only" lede="This sheet is for the people who review flagged writing and licence applications." seed={11} />
      <div className="stack" style={{ maxWidth: 520 }}>
        <p className="pencil note">If your confirmed email is on the moderator list, you can open it here.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="button" className="act" onClick={() => void claim()}>
            I’m on the moderator list
          </button>
        </div>
      </div>
    </>
  )
}
