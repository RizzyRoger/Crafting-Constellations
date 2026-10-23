/*
 * reviewProfessional end to end: the real function on the emulators.
 * Run inside `firebase emulators:exec --only auth,firestore,functions,storage`
 * (as npm run test:e2e does), naming this file.
 *
 * Every test seeds its own people under fresh ids instead of wiping the emulator.
 */
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp, FirebaseError, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PROJECT_ID = 'demo-crafting-constellations'
const PASSWORD = 'e2e-password-only-for-emulator'

const admin = initializeAdminApp({ projectId: PROJECT_ID }, 'review-pro-admin')
const db = getAdminFirestore(admin)
const adminAuth = getAdminAuth(admin)

const client = initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, 'review-pro-client')
const auth = getAuth(client)
const functions = getFunctions(client, 'us-central1')
const reviewProfessional = httpsCallable<{ uid: string; decision: 'approve' | 'deny' | 'revoke'; note?: string }, { ok: true }>(
  functions,
  'reviewProfessional',
)

const exists = async (path: string) => (await db.doc(path).get()).exists
const field = async (path: string, name: string) => (await db.doc(path).get()).get(name)
const claims = async (uid: string) => (await adminAuth.getUser(uid)).customClaims ?? {}

const codeOf = async (attempt: Promise<unknown>) => {
  const error = await attempt.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(FirebaseError)
  return (error as FirebaseError).code
}

let runs = 0

const person = async (uid: string, options: { claims?: Record<string, unknown>; profile?: Record<string, unknown> | false } = {}) => {
  await adminAuth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true, password: PASSWORD })
  if (options.claims) await adminAuth.setCustomUserClaims(uid, options.claims)
  if (options.profile !== false) {
    await db.doc(`users/${uid}`).set({ penName: uid, penNameLower: uid, avatarSeed: uid, pigment: 'graphite', pro: false, banned: false, ...options.profile })
  }
}

// A moderator, signed in, and a fresh run number for everyone else's ids
const asModerator = async () => {
  const n = ++runs
  const mod = `review-mod-${n}`
  await person(mod, { claims: { admin: true } })
  await signOut(auth)
  await signInWithEmailAndPassword(auth, `${mod}@example.test`, PASSWORD)
  return n
}

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_EMULATOR_HUB) {
    throw new Error('Run inside the emulators (see the top of this file).')
  }
  const listing = (await (await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`)).json()) as Record<string, { host: string; port: number }>
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  connectFunctionsEmulator(functions, listing.functions.host, listing.functions.port)
})

afterAll(async () => {
  await signOut(auth)
  await deleteApp(client)
  await deleteAdminApp(admin)
})

describe('reviewProfessional', () => {
  it('takes the mark from a pro who never applied (like the seeded ones)', async () => {
    const n = await asModerator()
    const pro = `seeded-pro-${n}`
    await person(pro, { claims: { pro: true }, profile: { pro: true, proSince: new Date() } })

    await expect(reviewProfessional({ uid: pro, decision: 'revoke' })).resolves.toMatchObject({ data: { ok: true } })
    expect(await field(`users/${pro}`, 'pro')).toBe(false)
    expect(await claims(pro)).toMatchObject({ pro: false })
    expect(await exists(`proApplications/${pro}`)).toBe(false)
  })

  it('still marks the application revoked when there is one', async () => {
    const n = await asModerator()
    const pro = `applied-pro-${n}`
    await person(pro, { claims: { pro: true }, profile: { pro: true } })
    await db.doc(`proApplications/${pro}`).set({ uid: pro, status: 'approved', legalName: 'Test Person', files: ['doc-1'] })

    await expect(reviewProfessional({ uid: pro, decision: 'revoke' })).resolves.toMatchObject({ data: { ok: true } })
    expect(await field(`proApplications/${pro}`, 'status')).toBe('revoked')
    expect(await field(`users/${pro}`, 'pro')).toBe(false)
    expect(await claims(pro)).toMatchObject({ pro: false })
  })

  it('still needs an application to approve or deny, and changes nothing without one', async () => {
    const n = await asModerator()
    const someone = `no-application-${n}`
    await person(someone)

    expect(await codeOf(reviewProfessional({ uid: someone, decision: 'approve' }))).toBe('functions/not-found')
    expect(await codeOf(reviewProfessional({ uid: someone, decision: 'deny' }))).toBe('functions/not-found')
    expect(await field(`users/${someone}`, 'pro')).toBe(false)
    expect(await claims(someone)).not.toHaveProperty('pro')
    expect(await exists(`proApplications/${someone}`)).toBe(false)
  })

  it('never makes a profile for someone who has none', async () => {
    const n = await asModerator()
    const someone = `no-profile-${n}`
    await person(someone, { profile: false })

    expect(await codeOf(reviewProfessional({ uid: someone, decision: 'revoke' }))).toBe('functions/not-found')
    expect(await exists(`users/${someone}`)).toBe(false)
    expect(await claims(someone)).not.toHaveProperty('pro')
  })
})
