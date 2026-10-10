import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ProfileForm } from '../components/ProfileForm'
import { AuthLayout } from './AuthLayout'

export const Onboarding = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  if (!user) return null
  if (profile) return <Navigate to="/constellation" replace />

  return (
    <AuthLayout
      title="Choose a pen name"
      lede="People here only ever see this name and your wash blot. You can change both later."
    >
      <ProfileForm uid={user.uid} submitLabel="Open my constellation" onSaved={() => navigate('/constellation')} />
      <p className="code">
        A licensed mental health professional? Choose a pen name first, then apply from “Professionals”.
      </p>
      <p className="code">
        Not for you? <Link to="/delete-account">Delete this sign-in</Link>
      </p>
    </AuthLayout>
  )
}
