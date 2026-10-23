/*
 * Removing a moderator end to end: the real functions on the emulators.
 * Run inside `firebase emulators:exec --only auth,firestore,functions,storage`
 * (as npm run test:e2e does), naming this file.
 *
 * Each person signs in on their own client, so the one removed keeps the token
 * they held before, as an open page would. Every test uses fresh ids.
 */
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { deleteApp, FirebaseError, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut, type Auth } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PROJECT_ID = 'demo-crafting-constellations'
const PASSWORD = 'e2e-password-only-for-emulator'

const admin = initializeAdminApp({ projectId: PROJECT_ID }, 'set-admin-admin')
const adminAuth = getAdminAuth(admin)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const claims = async (uid: string) => (await adminAuth.getUser(uid)).customClaims ?? {}

const failureOf = async (attempt: Promise<unknown>) => {
  const error = await attempt.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(FirebaseError)
  return error as FirebaseError & { details?: { problem?: string } }
}

let functionsAt: { host: string; port: number }
const clients: { app: FirebaseApp; auth: Auth }[] = []
let runs = 0

// Someone with their own signed-in client, and the calls they can make from it
const person = async (name: string, options: { admin?: boolean } = {}) => {
  const uid = `${name}-${++runs}`
  await adminAuth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true, password: PASSWORD })
  if (options.admin) await adminAuth.setCustomUserClaims(uid, { admin: true })
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, `set-admin-${uid}`)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  const functions = getFunctions(app, 'us-central1')
  connectFunctionsEmulator(functions, functionsAt.host, functionsAt.port)
  clients.push({ app, auth })
  const { user } = await signInWithEmailAndPassword(auth, `${uid}@example.test`, PASSWORD)
  return {
    uid,
    // What this client holds, never refreshed
    token: async () => (await user.getIdTokenResult()).token,
    heldClaims: async () => (await user.getIdTokenResult()).claims,
    setAdmin: httpsCallable<{ uid: string; admin: boolean }, { ok: true; was: boolean }>(functions, 'setAdmin'),
    banUser: httpsCallable<{ uid: string; reason: string }, { ok: true }>(functions, 'banUser'),
    approveContent: httpsCallable<{ queueId: string }, { ok: true }>(functions, 'approveContent'),
  }
}

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_EMULATOR_HUB) {
    throw new Error('Run inside the emulators (see the top of this file).')
  }
  const listing = (await (await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`)).json()) as Record<string, { host: string; port: number }>
  functionsAt = listing.functions
})

afterAll(async () => {
  await Promise.all(clients.map(({ auth }) => signOut(auth)))
  await Promise.all(clients.map(({ app }) => deleteApp(app)))
  await deleteAdminApp(admin)
})

describe('removing a moderator', () => {
  it('turns their calls away at once, though the token they hold still says admin', async () => {
    const removed = await person('removed-mod', { admin: true })
    const other = await person('other-mod', { admin: true })
    expect((await removed.heldClaims()).admin).toBe(true)

    await expect(other.setAdmin({ uid: removed.uid, admin: false })).resolves.toMatchObject({ data: { ok: true, was: true } })
    expect(await claims(removed.uid)).toMatchObject({ admin: false })
    // The premise: the page they have open still holds the token from before
    expect((await removed.heldClaims()).admin).toBe(true)

    // Not even to give the role back to themselves
    expect((await failureOf(removed.setAdmin({ uid: removed.uid, admin: true }))).code).toBe('functions/permission-denied')
    expect((await failureOf(removed.approveContent({ queueId: `nothing-${runs}` }))).code).toBe('functions/permission-denied')
    expect(await claims(removed.uid)).toMatchObject({ admin: false })

    // The one who removed them still can act
    expect((await failureOf(other.approveContent({ queueId: `nothing-${runs}` }))).code).toBe('functions/not-found')
  })

  it('ends their sessions, so no device of theirs gets a fresh token', async () => {
    const removed = await person('signed-out-mod', { admin: true })
    const other = await person('remover-mod', { admin: true })
    const held = await removed.token()
    // Revocation counts in whole seconds from the sign-in
    await sleep(1100)

    await other.setAdmin({ uid: removed.uid, admin: false })
    await expect(adminAuth.verifyIdToken(held, true)).rejects.toMatchObject({ code: 'auth/id-token-revoked' })
  })

  it('leaves someone who was never a moderator signed in', async () => {
    const someone = await person('not-a-mod')
    const mod = await person('tidy-mod', { admin: true })
    const held = await someone.token()
    await sleep(1100)

    // And the page can say so
    await expect(mod.setAdmin({ uid: someone.uid, admin: false })).resolves.toMatchObject({ data: { ok: true, was: false } })
    await expect(adminAuth.verifyIdToken(held, true)).resolves.toMatchObject({ uid: someone.uid })
  })

  it('says why a moderator cannot be banned', async () => {
    const target = await person('banned-mod', { admin: true })
    const mod = await person('banning-mod', { admin: true })

    const failure = await failureOf(mod.banUser({ uid: target.uid, reason: 'testing the refusal' }))
    expect(failure.code).toBe('functions/failed-precondition')
    expect(failure.details?.problem).toBe('admin')
    expect(await claims(target.uid)).not.toHaveProperty('banned')
  })
})
