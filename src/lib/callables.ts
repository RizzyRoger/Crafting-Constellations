import { FirebaseError } from 'firebase/app'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions, LOCAL_BACKEND } from './firebase'

// How long the site waits for the local backend (which refuses anything older)
const CALL_TIMEOUT_MS = 25_000

interface CallDoc {
  state: 'new' | 'running' | 'done' | 'failed' | 'expired'
  result?: unknown
  error?: { status: string; message: string; details?: unknown }
}

// Shaped like the errors httpsCallable throws, so describeError / problemOf work unchanged
const callError = (status: string, message: string, details?: unknown) =>
  Object.assign(new FirebaseError(`functions/${status}`, message), details === undefined ? {} : { details })

// Without Cloud Functions: write the request to calls/{id}; our own machine answers in the same doc
const viaLocalBackend =
  <In, Out>(name: string) =>
  async (input: In): Promise<Out> => {
    const user = auth.currentUser
    if (!user) throw callError('unauthenticated', 'Sign in first.')
    // Rules check this against the token, so the backend can trust it (deleteAccount needs a fresh sign-in)
    const authTime = Number((await user.getIdTokenResult()).claims.auth_time)
    const ref = doc(collection(db, 'calls'))
    await setDoc(ref, { uid: user.uid, name, data: input ?? {}, authTime, state: 'new', createdAt: serverTimestamp() })
    try {
      return await new Promise<Out>((resolve, reject) => {
        let unsubscribe = () => {}
        const timer = setTimeout(() => {
          unsubscribe()
          reject(callError('deadline-exceeded', 'No answer from the server.'))
        }, CALL_TIMEOUT_MS)
        const settle = () => {
          clearTimeout(timer)
          unsubscribe()
        }
        unsubscribe = onSnapshot(
          ref,
          (snap) => {
            const call = snap.data() as CallDoc | undefined
            if (!call || call.state === 'new' || call.state === 'running') return
            settle()
            if (call.state === 'done') resolve(call.result as Out)
            else if (call.state === 'expired') reject(callError('deadline-exceeded', 'No answer from the server.'))
            else reject(callError(call.error?.status ?? 'internal', call.error?.message ?? 'internal', call.error?.details))
          },
          (error) => {
            settle()
            reject(error)
          },
        )
      })
    } finally {
      void deleteDoc(ref).catch(() => undefined)
    }
  }

const call = <In, Out = { ok: true }>(name: string) => {
  if (LOCAL_BACKEND) return viaLocalBackend<In, Out>(name)
  const fn = httpsCallable<In, Out>(functions, name)
  return async (input: In) => (await fn(input)).data
}

export const saveProfile = call<{ penName?: string; note?: string; pigment?: string }, { ok: true; crisis: boolean; penName: string }>('saveProfile')
export const approveContent = call<{ queueId: string }>('approveContent')
export const removeContent = call<{ queueId: string; note?: string }>('removeContent')
export const banUser = call<{ uid: string; reason: string; hideContent?: boolean }>('banUser')
export const unbanUser = call<{ uid: string }>('unbanUser')
export const reviewProfessional = call<{ uid: string; decision: 'approve' | 'deny' | 'revoke'; note?: string }>('reviewProfessional')
export const setAdmin = call<{ uid: string; admin: boolean }>('setAdmin')
export const bootstrapAdmin = call<Record<string, never>>('bootstrapAdmin')
export const createGroup = call<{ name: string; constellationId: string; description?: string }, { ok: true; id: string }>('createGroup')
export const deleteAccount = call<{ confirm: string }>('deleteAccount')

// Callable errors carry { problem } in details for field-level hints
export const problemOf = (error: unknown): string | undefined => {
  if (error instanceof FirebaseError) {
    const details = (error as FirebaseError & { details?: { problem?: string } }).details
    return details?.problem
  }
  return undefined
}

// Plain-language message for anything that went wrong
export const describeError = (error: unknown): string => {
  if (!(error instanceof FirebaseError)) return 'Something went wrong. Try again in a moment.'
  const map: Record<string, string> = {
    'auth/invalid-credential': 'That email and password don’t match.',
    // Same words as above: without email enumeration protection (e.g. the emulator) these come instead
    'auth/wrong-password': 'That email and password don’t match.',
    'auth/user-not-found': 'That email and password don’t match.',
    'auth/invalid-email': 'That doesn’t look like an email address.',
    'auth/email-already-in-use': 'There’s already an account with that email. Try signing in.',
    'auth/weak-password': 'Use at least 8 characters.',
    'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
    'auth/requires-recent-login': 'For your safety, confirm it’s you again first.',
    'auth/user-mismatch': 'That’s a different account from the one signed in here.',
    'auth/missing-password': 'Write your password first.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'permission-denied': 'You can’t do that here.',
    'functions/permission-denied': 'You can’t do that here.',
    'functions/unauthenticated': 'Sign in first.',
    'functions/already-exists': 'Someone already uses that pen name.',
    'unavailable': 'No connection right now. It will retry.',
    'functions/deadline-exceeded': 'The server didn’t answer. Try again in a moment.',
  }
  return map[error.code] ?? 'Something went wrong. Try again in a moment.'
}
