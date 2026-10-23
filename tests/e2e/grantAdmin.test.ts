/*
 * The grant-admin script (scripts/grant-admin.ts) against the Auth emulator.
 * Run inside `firebase emulators:exec --only auth` (or with everything, as
 * npm run test:e2e does), naming this file.
 *
 * Each person signs in on their own client, so they hold a token from before
 * the script runs, as an open page would. Every test uses fresh ids.
 */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut, type Auth } from 'firebase/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PROJECT_ID = 'demo-crafting-constellations'
const PASSWORD = 'e2e-password-only-for-emulator'
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

const admin = initializeAdminApp({ projectId: PROJECT_ID }, 'grant-admin-admin')
const adminAuth = getAdminAuth(admin)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const claims = async (uid: string) => (await adminAuth.getUser(uid)).customClaims ?? {}

// As `npm run grant-admin -- …` runs it, on the emulator the tests were given
const grantAdmin = async (...args: string[]) =>
  (await promisify(execFile)(`${ROOT}node_modules/.bin/tsx`, ['scripts/grant-admin.ts', ...args], { cwd: ROOT, env: process.env })).stdout

const clients: { app: FirebaseApp; auth: Auth }[] = []
let runs = 0

// Someone signed in on their own client, and the token it holds
const person = async (name: string, options: { admin?: boolean } = {}) => {
  const uid = `${name}-${++runs}`
  await adminAuth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true, password: PASSWORD })
  if (options.admin) await adminAuth.setCustomUserClaims(uid, { admin: true, pro: true })
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, `grant-admin-${uid}`)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  clients.push({ app, auth })
  const { user } = await signInWithEmailAndPassword(auth, `${uid}@example.test`, PASSWORD)
  const held = await user.getIdToken()
  // Revocation counts in whole seconds from the sign-in
  await sleep(1100)
  return { uid, held }
}

beforeAll(() => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run inside the emulators (see the top of this file).')
})

afterAll(async () => {
  await Promise.all(clients.map(({ auth }) => signOut(auth)))
  await Promise.all(clients.map(({ app }) => deleteApp(app)))
  await deleteAdminApp(admin)
})

describe('grant-admin --remove', () => {
  it('ends a removed moderator’s sessions, as Remove moderator on Review does', async () => {
    const mod = await person('cli-removed-mod', { admin: true })

    const said = await grantAdmin('--uid', mod.uid, '--remove')
    // Other claims stay: the role alone goes
    expect(await claims(mod.uid)).toEqual({ admin: false, pro: true })
    await expect(adminAuth.verifyIdToken(mod.held, true)).rejects.toMatchObject({ code: 'auth/id-token-revoked' })
    expect(said).toContain('signed them out everywhere')
  })

  it('leaves someone who was never a moderator signed in', async () => {
    const someone = await person('cli-not-a-mod')

    const said = await grantAdmin('--uid', someone.uid, '--remove')
    await expect(adminAuth.verifyIdToken(someone.held, true)).resolves.toMatchObject({ uid: someone.uid })
    expect(said).toContain('was not an admin')
  })
})

describe('grant-admin', () => {
  it('gives the role and leaves their sessions open', async () => {
    const someone = await person('cli-new-mod')

    await grantAdmin('--email', `${someone.uid}@example.test`)
    expect(await claims(someone.uid)).toMatchObject({ admin: true })
    await expect(adminAuth.verifyIdToken(someone.held, true)).resolves.toMatchObject({ uid: someone.uid })
  })
})
