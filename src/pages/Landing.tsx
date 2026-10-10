import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { StarChart } from '../components/StarChart'

export const Landing = () => {
  const { user, profile } = useAuth()

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

      <h1 className="landing__title">
        Crafting
        <br />
        Constellations
      </h1>
      <StarChart />
    </div>
  )
}
