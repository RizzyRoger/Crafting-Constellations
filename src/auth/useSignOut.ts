import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'

// Leave for the front page first, so the next person to sign in on this
// device doesn't land on the previous person's last page
export const useSignOut = () => {
  const navigate = useNavigate()
  return async () => {
    navigate('/', { replace: true })
    await signOut(auth)
  }
}
