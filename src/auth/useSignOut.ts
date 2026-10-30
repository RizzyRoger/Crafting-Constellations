import { signOut } from 'firebase/auth'
import { useNavigate, type NavigateFunction, type NavigateOptions } from 'react-router-dom'
import { auth } from '../lib/firebase'

// Leave this page first, so the next person to sign in on this device doesn't
// land on the previous person's last page. The router renders a navigation as a
// transition, which can wait behind another update (a snapshot) until Auth's
// change lands, and Gate then sends them to sign in from this page.
// flushSync puts the new page up before signOut starts
export const leaveThenSignOut = async (navigate: NavigateFunction, to: string, options?: NavigateOptions) => {
  navigate(to, { ...options, replace: true, flushSync: true })
  await signOut(auth)
}

export const useSignOut = () => {
  const navigate = useNavigate()
  return () => leaveThenSignOut(navigate, '/')
}
