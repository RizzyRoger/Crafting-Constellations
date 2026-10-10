import { onIdTokenChanged, signOut, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { auth, db } from '../lib/firebase'
import type { Profile } from '../lib/types'

export interface Claims {
  admin: boolean
  pro: boolean
  banned: boolean
  emailVerified: boolean
}

interface AuthState {
  user: User | null
  claims: Claims
  profile: Profile | null
  // true until we know who is signed in and whether they have a profile
  loading: boolean
  refreshClaims: () => Promise<void>
}

const NO_CLAIMS: Claims = { admin: false, pro: false, banned: false, emailVerified: false }

const AuthContext = createContext<AuthState | null>(null)

const readClaims = async (user: User, force = false): Promise<Claims> => {
  const { claims } = await user.getIdTokenResult(force)
  return {
    admin: claims.admin === true,
    pro: claims.pro === true,
    banned: claims.banned === true,
    emailVerified: claims.email_verified === true,
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [claims, setClaims] = useState<Claims>(NO_CLAIMS)
  // Which uid the loaded profile belongs to, so a new sign-in never sees a stale "no profile"
  const [loaded, setLoaded] = useState<{ uid: string | null; profile: Profile | null }>({ uid: null, profile: null })
  const [authReady, setAuthReady] = useState(false)
  const profile = user && loaded.uid === user.uid ? loaded.profile : null

  useEffect(
    () =>
      onIdTokenChanged(auth, async (next) => {
        setUser(next)
        setClaims(next ? await readClaims(next) : NO_CLAIMS)
        setAuthReady(true)
      }),
    [],
  )

  // Live profile; never read displayName/photoURL from Auth (real names from Google)
  useEffect(() => {
    if (!user) {
      setLoaded({ uid: null, profile: null })
      return
    }
    const uid = user.uid
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => setLoaded({ uid, profile: snap.exists() ? ({ id: snap.id, ...snap.data() } as Profile) : null }),
      () => setLoaded({ uid, profile: null }),
    )
  }, [user])

  const refreshClaims = useCallback(async () => {
    if (!auth.currentUser) return
    await auth.currentUser.reload()
    setClaims(await readClaims(auth.currentUser, true))
  }, [])

  // Functions change pro / banned on the profile; pull a fresh token when they drift
  useEffect(() => {
    if (!profile || !user) return
    if (profile.banned) {
      void signOut(auth)
      return
    }
    if (profile.pro !== claims.pro) void refreshClaims()
  }, [profile, user, claims.pro, refreshClaims])

  const value = useMemo<AuthState>(
    () => ({ user, claims, profile, loading: !authReady || (user !== null && loaded.uid !== user.uid), refreshClaims }),
    [user, claims, profile, authReady, loaded.uid, refreshClaims],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

// For pages behind <Gate need="profile">, where both are guaranteed
export const useMe = () => {
  const { user, profile, claims, refreshClaims } = useAuth()
  if (!user || !profile) throw new Error('useMe needs a signed-in user with a profile')
  return { user, profile, claims, refreshClaims, uid: user.uid }
}
