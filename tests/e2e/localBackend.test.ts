/*
 * The local backend (functions/src/local-backend.ts) end to end, on the Auth and
 * Firestore emulators with no Functions emulator: the backend alone answers calls
 * and does the triggers' work, as it would on the NUC. Calls go through the real
 * rules. Run with `npm run test:local-backend` (stop `npm run emulators` first).
 */
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  terminate,
  type DocumentData,
} from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PROJECT_ID = 'demo-crafting-constellations'
const PASSWORD = 'e2e-password-only-for-emulator'

const admin = initializeAdminApp({ projectId: PROJECT_ID }, 'local-backend-admin')
const adminDb = getAdminFirestore(admin)
const adminAuth = getAdminAuth(admin)

const client = initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, 'local-backend-client')
const auth = getAuth(client)
const db = getFirestore(client)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const eventually = async (check: () => Promise<boolean>, what: string) => {
  for (let i = 0; i < 60; i++) {
    if (await check()) return
    await sleep(500)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const field = async (path: string, name: string) => (await adminDb.doc(path).get()).get(name)

// What the site does in src/lib/callables.ts: write the call, wait for the answer
const callViaQueue = async (name: string, data: Record<string, unknown>) => {
  const user = auth.currentUser
  if (!user) throw new Error('sign in first')
  const authTime = Number((await user.getIdTokenResult()).claims.auth_time)
  const ref = doc(collection(db, 'calls'))
  await setDoc(ref, { uid: user.uid, name, data, authTime, state: 'new', createdAt: serverTimestamp() })
  return new Promise<DocumentData>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer to ${name}`)), 20000)
    const stop = onSnapshot(
      ref,
      (snap) => {
        const call = snap.data()
        if (!call || call.state === 'new' || call.state === 'running') return
        clearTimeout(timer)
        stop()
        resolve(call)
      },
      reject,
    )
  })
}

let runs = 0
const person = async (penName?: string, email?: string) => {
  const uid = `person-${++runs}`
  await adminAuth.createUser({ uid, email: email ?? `${uid}@example.test`, emailVerified: true, password: PASSWORD })
  if (penName) await adminDb.doc(`users/${uid}`).set({ penName, penNameLower: penName.toLowerCase(), avatarSeed: uid, pigment: 'graphite', pro: false, banned: false })
  await signOut(auth)
  await signInWithEmailAndPassword(auth, email ?? `${uid}@example.test`, PASSWORD)
  return uid
}

let backend: { stop: () => void }

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Run with npm run test:local-backend (inside the emulators).')
  }
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  connectFirestoreEmulator(db, host, Number(port))
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  const { startLocalBackend } = await import('../../functions/lib/local-backend.js')
  backend = await startLocalBackend()
})

afterAll(async () => {
  backend?.stop()
  await signOut(auth)
  await terminate(db)
  await deleteApp(client)
  await deleteAdminApp(admin)
})

describe('local backend', () => {
  it('saves a pen name asked for through the queue', async () => {
    const uid = await person()
    const call = await callViaQueue('saveProfile', { penName: `Quiet Heron ${runs}`, pigment: 'fresco' })
    expect(call).toMatchObject({ state: 'done', result: { ok: true, penName: `Quiet Heron ${runs}` } })
    expect(await field(`users/${uid}`, 'penName')).toBe(`Quiet Heron ${runs}`)
    expect(await field(`penNames/quiet heron ${runs}`, 'uid')).toBe(uid)
  })

  it('passes a callable’s error and its details back, like httpsCallable', async () => {
    await person()
    const call = await callViaQueue('saveProfile', { penName: 'x' })
    expect(call).toMatchObject({ state: 'failed', error: { status: 'invalid-argument', details: { problem: 'length' } } })
  })

  it('refuses admin calls from someone who isn’t one, and lets a listed, verified email become one', async () => {
    await person('Plain Reader')
    expect(await callViaQueue('createGroup', { name: 'Late tea', constellationId: 'c1' })).toMatchObject({
      state: 'failed',
      error: { status: 'permission-denied' },
    })
    // functions/.env.local lists admin@example.test for the emulator
    await adminAuth.getUserByEmail('admin@example.test').then((u) => adminAuth.deleteUser(u.uid), () => undefined)
    const moderator = await person('Night Keeper', 'admin@example.test')
    expect(await callViaQueue('bootstrapAdmin', {})).toMatchObject({ state: 'done' })
    expect((await adminAuth.getUser(moderator)).customClaims).toMatchObject({ admin: true })
  })

  it('runs deleteAccount with the sign-in time the rules checked', async () => {
    const uid = await person('Leaving Lark')
    expect(await callViaQueue('deleteAccount', { confirm: 'leaving lark' })).toMatchObject({ state: 'done' })
    await expect(adminAuth.getUser(uid)).rejects.toMatchObject({ code: 'auth/user-not-found' })
  })

  it('never runs a call that waited too long', async () => {
    const uid = await person()
    const ref = adminDb.collection('calls').doc()
    await ref.set({ uid, name: 'saveProfile', data: { penName: 'Too Late' }, authTime: 0, state: 'new', createdAt: new Date(Date.now() - 60_000) })
    await eventually(async () => (await ref.get()).get('state') === 'expired', 'the call to expire')
    expect(await field(`users/${uid}`, 'penName')).toBeUndefined()
  })

  it('moderates new writing and keeps the counters, like the triggers did', async () => {
    const uid = await person('Steady River')
    const g = `groups/local-${runs}`
    await adminDb.doc(g).set({ name: 'Evening sheet', memberCount: 0 })
    await setDoc(doc(db, `${g}/members/${uid}`), { uid, joinedAt: serverTimestamp() })
    await eventually(async () => (await field(g, 'memberCount')) === 1, 'the member count')

    await setDoc(doc(db, `${g}/posts/p1`), { authorUid: uid, body: 'Mum started chemo today. Long day.', status: 'pending', createdAt: serverTimestamp() })
    await eventually(async () => (await field(`${g}/posts/p1`, 'status')) === 'published', 'the post to publish')
    expect(await field(`${g}/posts/p1`, 'author')).toMatchObject({ penName: 'Steady River' })

    await setDoc(doc(db, `${g}/posts/p1/likes/${uid}`), { uid, createdAt: serverTimestamp() })
    await setDoc(doc(db, `${g}/posts/p1/comments/c1`), { authorUid: uid, text: 'Thinking of you.', status: 'pending', createdAt: serverTimestamp() })
    await eventually(
      async () => (await field(`${g}/posts/p1`, 'likeCount')) === 1 && (await field(`${g}/posts/p1`, 'commentCount')) === 1,
      'the like and comment counts',
    )
  })
})
