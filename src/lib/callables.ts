import { FirebaseError } from 'firebase/app'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable, type HttpsCallableOptions } from 'firebase/functions'
import { auth, db, functions, LOCAL_BACKEND } from './firebase'

// How long the site waits for the local backend to pick a call up (it refuses anything older)
const PICKUP_TIMEOUT_MS = 25_000
// The longest the server lets a call run: deleteAccount's timeoutSeconds in functions/src/account.ts
const LONGEST_RUN_MS = 300_000

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
        const giveUp = () => {
          unsubscribe()
          reject(callError('deadline-exceeded', 'No answer from the server.'))
        }
        let timer = setTimeout(giveUp, PICKUP_TIMEOUT_MS)
        const settle = () => {
          clearTimeout(timer)
          unsubscribe()
        }
        unsubscribe = onSnapshot(
          ref,
          (snap) => {
            const call = snap.data() as CallDoc | undefined
            if (!call || call.state === 'new') return
            if (call.state === 'running') {
              // Picked up: the backend answers when it's done, or as interrupted if it's stopped
              // first, so wait for its answer. Only a crash leaves us waiting the whole time.
              clearTimeout(timer)
              timer = setTimeout(giveUp, LONGEST_RUN_MS)
              return
            }
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

const call = <In, Out = { ok: true }>(name: string, options?: HttpsCallableOptions) => {
  if (LOCAL_BACKEND) return viaLocalBackend<In, Out>(name)
  const fn = httpsCallable<In, Out>(functions, name, options)
  return async (input: In) => (await fn(input)).data
}

export const saveProfile = call<{ penName?: string; note?: string; pigment?: string }, { ok: true; crisis: boolean; penName: string }>('saveProfile')
// What came of Approve or Remove (Outcome in functions/src/adminPolicy.ts). An older backend leaves it out
export type ModOutcome = 'published' | 'restored' | 'undelivered' | 'paused' | 'kept' | 'removed' | 'withdrawn' | 'gone' | 'already-resolved'
export const approveContent = call<{ queueId: string }, { ok: true; outcome?: ModOutcome }>('approveContent')
export const removeContent = call<{ queueId: string; note?: string }, { ok: true; outcome?: ModOutcome }>('removeContent')
export const banUser = call<{ uid: string; reason: string; hideContent?: boolean }>('banUser')
export const unbanUser = call<{ uid: string }>('unbanUser')
export const reviewProfessional = call<{ uid: string; decision: 'approve' | 'deny' | 'revoke'; note?: string }>('reviewProfessional')
// was: whether they had the role before. An older backend leaves it out
export const setAdmin = call<{ uid: string; admin: boolean }, { ok: true; was?: boolean }>('setAdmin')
export const bootstrapAdmin = call<Record<string, never>>('bootstrapAdmin')
export const createGroup = call<{ name: string; constellationId: string; description?: string }, { ok: true; id: string }>('createGroup')
export const createChat = call<{ name: string; uids: string[] }, { ok: true; id: string }>('createChat')
// The SDK waits 70s by default (60s server limit plus 10s); deleteAccount may run 300s
export const deleteAccount = call<{ confirm: string }>('deleteAccount', { timeout: LONGEST_RUN_MS + 10_000 })

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
    // Google on an email that already signs in with a password (the only other way in): Auth refuses it every time
    'auth/account-exists-with-different-credential': 'There’s already an account with that email. Sign in with your email and password.',
    'auth/weak-password': 'Use at least 8 characters.',
    'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
    'auth/requires-recent-login': 'For your safety, confirm it’s you again first.',
    'auth/user-mismatch': 'That’s a different account from the one signed in here.',
    // Banned: Auth refuses the sign-in itself, so "try again" would never work
    'auth/user-disabled': 'A moderator has paused this account, so it can’t sign in.',
    'auth/missing-password': 'Write your password first.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'permission-denied': 'You can’t do that here.',
    'functions/permission-denied': 'You can’t do that here.',
    'functions/unauthenticated': 'Sign in first.',
    'functions/already-exists': 'Someone already uses that pen name.',
    // Already handled or removed (a queue item, an application): trying again won't bring it back
    'functions/not-found': 'That isn’t there any more.',
    'unavailable': 'No connection right now. It will retry.',
    'functions/deadline-exceeded': 'The server didn’t answer. Try again in a moment.',
    // The local backend was stopped partway through (a restart): some of it may have been done
    'functions/unavailable': 'The server stopped before it finished. Check whether it went through, then try again.',
    // Licence documents, opened by a moderator or uploaded by their owner
    'storage/object-not-found': 'That document isn’t there.',
    'storage/unauthorized': 'You can’t do that here.',
    'storage/unauthenticated': 'Sign in first.',
    // What a blocked request ends as once Storage stops retrying: no connection, or no CORS on the bucket
    'storage/retry-limit-exceeded': 'The file didn’t get through. Check your connection and try again.',
    // A refusal Storage has no name for, so waiting a moment may not help
    'storage/unknown': 'Something went wrong with that file. Try again later.',
  }
  return map[error.code] ?? 'Something went wrong. Try again in a moment.'
}

// Forgot password says why only for answers that are the same whether or not the email has an
// account: the request never left, the address is malformed, too many tries. Anything else (no
// such account, a paused one, a send that failed once the account was found) returns null, for
// the same note as a sent link, so the page never tells anyone which emails have accounts
const RESET_REFUSALS = new Set(['auth/network-request-failed', 'auth/invalid-email', 'auth/too-many-requests'])
export const resetRefusal = (error: unknown): string | null =>
  error instanceof FirebaseError && RESET_REFUSALS.has(error.code) ? describeError(error) : null
