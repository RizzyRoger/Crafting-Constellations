import { Link, useLocation } from 'react-router-dom'
import { hereOf } from '../lib/returnTo'

// Shown wherever writing is open in the UI but the rules still require a confirmed email.
// Remembers this page, so confirming comes back to it (see Verify)
export const ConfirmEmail = () => {
  const location = useLocation()
  return (
    <div className="banner">
      <p className="pencil note">Confirm your email before you write here. You can still read.</p>
      <Link to="/verify" state={{ from: hereOf(location) }} className="act act--wash" style={{ justifySelf: 'start' }}>
        Confirm email
      </Link>
    </div>
  )
}
