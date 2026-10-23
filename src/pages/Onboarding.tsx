import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ProfileForm } from '../components/ProfileForm'
import { returnTo } from '../lib/returnTo'
import { AuthLayout } from './AuthLayout'

export const Onboarding = () => {
  const { user, profile } = useAuth()
  // A pen name sends the person on, but not while this page's own save is out: a crisis note still
  // creates the profile, and its resources stay until they choose to go on. Otherwise the save's answer
  // and the profile can land in either order; they move on once both have.
  const [held, setHeld] = useState(false)
  // On to the page they were opening (a shared group, say), else their constellation
  const next = returnTo(useLocation().state)

  if (!user) return null
  if (profile && !held) return <Navigate to={next} replace />

  return (
    <AuthLayout
      title="Choose a pen name"
      lede="People here only ever see this name and your wash blot. You can change both later."
    >
      <ProfileForm uid={user.uid} submitLabel="Open my constellation" onHold={setHeld} onSaved={() => setHeld(false)} />
      <p className="code">
        A licensed mental health professional? Choose a pen name first, then apply from “Professionals”.
      </p>
      <p className="code">
        Not for you? <Link to="/delete-account">Delete this sign-in</Link>
      </p>
    </AuthLayout>
  )
}
