import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'

export const NotFound = () => (
  <AuthLayout title="Nothing painted here" lede="This page doesn’t exist, or it was moved.">
    <Link to="/" className="act">
      Back to the front
    </Link>
  </AuthLayout>
)
