import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { StarChart } from '../components/StarChart'

export const Landing = () => {
  const { user, profile } = useAuth()
  const left = (useLocation().state as { left?: boolean } | null)?.left === true

  return (
    <div className="landing">
      <div className="landing__auth">
        {user && profile ? (
          <Link to="/constellation" className="wire-btn">
            Open
          </Link>
        ) : (
          <>
            <Link to="/signup" className="wire-btn">
              Sign up
            </Link>
            <Link to="/signin" className="wire-btn">
              Log in
            </Link>
          </>
        )}
      </div>

      {left && (
        <p className="landing__left pencil note" role="status">
          Your account and your writing have been removed.
        </p>
      )}

      <h1 className="landing__title">
        Crafting
        <br />
        Constellations
      </h1>
      <StarChart />
    </div>
  )
}
