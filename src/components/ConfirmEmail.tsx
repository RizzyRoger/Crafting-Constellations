import { Link } from 'react-router-dom'

// Shown wherever writing is open in the UI but the rules still require a confirmed email.
export const ConfirmEmail = () => (
  <div className="banner">
    <p className="pencil note">Confirm your email before you write here. You can still read.</p>
    <Link to="/verify" className="act act--wash" style={{ justifySelf: 'start' }}>
      Confirm email
    </Link>
  </div>
)
