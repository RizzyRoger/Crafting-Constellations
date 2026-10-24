import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'

// Leave for the front page first, so the next person to sign in on this
// device doesn't land on the previous person's last page. The router renders a
// navigation as a transition, which can wait behind another update (a snapshot)
// until Auth's change lands, and Gate then sends them to sign in from this page.
// flushSync puts the front page up before signOut starts
export const useSignOut = () => {
  const navigate = useNavigate()
  return async () => {
    navigate('/', { replace: true, flushSync: true })
    await signOut(auth)
  }
}
