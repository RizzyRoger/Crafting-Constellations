import { onIdTokenChanged, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { auth, db } from '../lib/firebase'
import type { Profile } from '../lib/types'
import { leaveThenSignOut } from './useSignOut'

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
  // A moderator paused the account while it was open here, so it was signed out
  paused: boolean
  // Sign-in calls this once it has said so (see pausedNote)
  forgetPause: () => void
  // Fetches a fresh token and gives its claims
  refreshClaims: () => Promise<Claims>
}

const NO_CLAIMS: Claims = { admin: false, pro: false, banned: false, emailVerified: false }

// How often a moderator's role is looked at again when they come back to the tab
const ROLE_RECHECK_MS = 60_000

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

// Whose token currentClaims has fetched fresh. Once per person per page: a fresh token is a token
// change, which calls it again, so one that still says not (the email was un-confirmed since)
// would otherwise ask again without end
let forcedFor: string | null = null

// The SDK reloads the person as the page opens, so it can know the email was confirmed elsewhere
// while the token it saved, which rules read too, still says not. Fetch a fresh token then; a page
// opened in an already-focused tab gets no focus event to re-check on
export const currentClaims = async (user: User): Promise<Claims> => {
  const held = await readClaims(user)
  if (held.emailVerified || !user.emailVerified || forcedFor === user.uid) return held
  forcedFor = user.uid
  return readClaims(user, true).catch(() => held)
}

// A fresh token's claims, or null when the person signed in here changed while it was fetched.
// Someone who signs out during the round trip must not leave their role on the page after them
export const freshClaims = async (user: User): Promise<Claims | null> => {
  const fresh = await readClaims(user, true)
  return auth.currentUser === user ? fresh : null
}

// Someone's profile as it's heard: theirs, or null once the server says there's none. Offline, or
// with Firestore slow to answer (it stops waiting after 10s), the first answer comes from a cache
// that's empty on a fresh page. Taken as "no pen name yet", that sent a returning person to choose
// one, and saving there replaced theirs. So a "none" from the cache alone isn't an answer
export const listenToProfile = (uid: string, answer: (profile: Profile | null) => void) =>
  onSnapshot(
    doc(db, 'users', uid),
    // Metadata too, only to hear the server's "none" after the cache's
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.exists()) answer({ id: snap.id, ...snap.data() } as Profile)
      else if (!snap.metadata.fromCache) answer(null)
    },
    () => answer(null),
  )

// Someone paused while the account was open here leaves for sign-in like any sign-out (see
// useSignOut). Not from inside the effect that saw the pause: React is still committing there, so
// flushSync can't put the page up at once (it warns in dev). It goes as soon as the effect ends
export const leavePaused = (navigate: NavigateFunction) => queueMicrotask(() => void leaveThenSignOut(navigate, '/signin'))

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [claims, setClaims] = useState<Claims>(NO_CLAIMS)
  // Which uid the loaded profile belongs to, so a new sign-in never sees a stale "no profile"
  const [loaded, setLoaded] = useState<{ uid: string | null; profile: Profile | null }>({ uid: null, profile: null })
  const [authReady, setAuthReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const navigate = useNavigate()
  const profile = user && loaded.uid === user.uid ? loaded.profile : null

  useEffect(
    () =>
      onIdTokenChanged(auth, async (next) => {
        if (next) setPaused(false)
        setUser(next)
        setClaims(next ? await currentClaims(next) : NO_CLAIMS)
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
    return listenToProfile(uid, (profile) => setLoaded({ uid, profile }))
  }, [user])

  const refreshClaims = useCallback(async () => {
    const current = auth.currentUser
    if (!current) return NO_CLAIMS
    await current.reload()
    const fresh = await freshClaims(current)
    if (!fresh) return NO_CLAIMS
    setClaims(fresh)
    return fresh
  }, [])

  const forgetPause = useCallback(() => setPaused(false), [])

  // The confirmation link opens in another tab, so the token here still says
  // unverified. Re-check when the person comes back, until it lands.
  useEffect(() => {
    if (!user || claims.emailVerified) return
    const recheck = () => {
      const current = auth.currentUser
      if (!current || document.visibilityState !== 'visible') return
      current
        .reload()
        .then(async () => {
          if (!current.emailVerified) return
          const fresh = await freshClaims(current)
          if (fresh) setClaims(fresh)
        })
        .catch(() => undefined)
    }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [user, claims.emailVerified])

  // Another moderator can remove the role while the token here still says admin, for up to an
  // hour. Look again as the role shows up (a page opening) and when they come back to the tab.
  // Removal also ended their sessions, so Auth refuses the check and the SDK signs them out
  useEffect(() => {
    if (!claims.admin) return
    let checked = 0
    const recheck = () => {
      if (document.visibilityState !== 'visible' || Date.now() - checked < ROLE_RECHECK_MS) return
      checked = Date.now()
      refreshClaims().catch(() => undefined)
    }
    recheck()
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [claims.admin, refreshClaims])

  // Functions change pro / banned on the profile; pull a fresh token when they drift
  useEffect(() => {
    if (!profile || !user) return
    if (profile.banned) {
      // Say why on sign-in
      setPaused(true)
      leavePaused(navigate)
      return
    }
    if (profile.pro !== claims.pro) void refreshClaims()
  }, [profile, user, claims.pro, refreshClaims, navigate])

  const value = useMemo<AuthState>(
    () => ({ user, claims, profile, loading: !authReady || (user !== null && loaded.uid !== user.uid), paused, forgetPause, refreshClaims }),
    [user, claims, profile, authReady, loaded.uid, paused, forgetPause, refreshClaims],
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
