import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Quiet } from '../components/Quiet'
import { hereOf } from '../lib/returnTo'
import { useAuth } from './AuthProvider'

type Need = 'signedIn' | 'profile' | 'admin'

// Route guard: sends people to sign in or to choose a pen name first, and remembers
// the whole address (?tab, ?person) so they come back to it afterwards
export const Gate = ({ need, children }: { need: Need; children: ReactNode }) => {
  const { user, profile, claims, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Quiet>Opening the sheet…</Quiet>
  if (!user) return <Navigate to="/signin" replace state={{ from: hereOf(location) }} />
  if (need === 'signedIn') return <>{children}</>
  if (!profile) return <Navigate to="/onboarding" replace state={{ from: hereOf(location) }} />
  if (need === 'admin' && !claims.admin) return <Navigate to="/admin/claim" replace />
  return <>{children}</>
}
