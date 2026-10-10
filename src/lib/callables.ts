import { FirebaseError } from 'firebase/app'
import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

const call = <In, Out = { ok: true }>(name: string) => {
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
export const createChat = call<{ name: string; uids: string[] }, { ok: true; id: string }>('createChat')

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
    'auth/invalid-email': 'That doesn’t look like an email address.',
    'auth/email-already-in-use': 'There’s already an account with that email. Try signing in.',
    'auth/weak-password': 'Use at least 8 characters.',
    'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'permission-denied': 'You can’t do that here.',
    'functions/permission-denied': 'You can’t do that here.',
    'functions/unauthenticated': 'Sign in first.',
    'functions/already-exists': 'Someone already uses that pen name.',
    'unavailable': 'No connection right now. It will retry.',
  }
  return map[error.code] ?? 'Something went wrong. Try again in a moment.'
}
