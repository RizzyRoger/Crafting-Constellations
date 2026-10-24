/*
 * Chat and group names end to end: createChat and createGroup on the emulators.
 * Run inside `firebase emulators:exec --only auth,firestore,functions,storage`
 * (as npm run test:e2e does), naming this file.
 *
 * A chat or group names a conversation, not a person, so a plural role word
 * ("Questions for doctors") is fine there; the role word itself still isn't.
 * Every test seeds its own people under fresh ids.
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

const admin = initializeAdminApp({ projectId: PROJECT_ID }, 'chat-names-admin')
const db = getAdminFirestore(admin)
const adminAuth = getAdminAuth(admin)

const client = initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, 'chat-names-client')
const auth = getAuth(client)
const functions = getFunctions(client, 'us-central1')
const createChat = httpsCallable<{ name: string; uids: string[] }, { ok: true; id: string }>(functions, 'createChat')
const createGroup = httpsCallable<{ name: string; constellationId: string }, { ok: true; id: string }>(functions, 'createGroup')

const field = async (path: string, name: string) => (await db.doc(path).get()).get(name)

const failureOf = async (attempt: Promise<unknown>) => {
  const error = await attempt.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(FirebaseError)
  return { code: (error as FirebaseError).code, details: (error as FirebaseError & { details?: unknown }).details }
}

let runs = 0

const signedIn = async (uid: string, claims?: Record<string, unknown>) => {
  await adminAuth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true, password: PASSWORD })
  if (claims) await adminAuth.setCustomUserClaims(uid, claims)
  await signOut(auth)
  await signInWithEmailAndPassword(auth, `${uid}@example.test`, PASSWORD)
}

// Someone signed in, with one person they're connected with
const withAFriend = async () => {
  const n = ++runs
  const me = `chat-maker-${n}`
  const friend = `chat-friend-${n}`
  await adminAuth.createUser({ uid: friend, email: `${friend}@example.test`, emailVerified: true, password: PASSWORD })
  const uids = [me, friend].sort()
  await db.doc(`connections/${uids.join('_')}`).set({ uids, requester: me, recipient: friend, status: 'accepted', createdAt: new Date(), updatedAt: new Date() })
  await signedIn(me)
  return friend
}

// A moderator, signed in, and a constellation to put groups under
const asModerator = async () => {
  const n = ++runs
  await signedIn(`group-mod-${n}`, { admin: true })
  const constellationId = `names-${n}`
  await db.doc(`constellations/${constellationId}`).set({ name: 'Names' })
  return constellationId
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

describe('createChat', () => {
  it('takes a plural role word or a second alphabet in another word', async () => {
    const friend = await withAFriend()
    // Mama in Cyrillic, escaped, as it reads just like the Latin word
    for (const name of ['Questions for doctors', '\u041c\u0430\u043c\u0430 and Dad']) {
      const { data } = await createChat({ name, uids: [friend] })
      expect(await field(`chats/${data.id}`, 'name')).toBe(name)
    }
  })

  it('still refuses the role word itself, with the reason', async () => {
    const friend = await withAFriend()
    expect(await failureOf(createChat({ name: 'Questions for the doctor', uids: [friend] }))).toEqual({
      code: 'functions/invalid-argument',
      details: { problem: 'reserved' },
    })
    // A Cyrillic A, escaped, as it looks just like a Latin one
    expect(await failureOf(createChat({ name: '\u0410dmin chat', uids: [friend] }))).toEqual({
      code: 'functions/invalid-argument',
      details: { problem: 'mixed' },
    })
  })
})

describe('createGroup', () => {
  it('takes a plural role word', async () => {
    const constellationId = await asModerator()
    const { data } = await createGroup({ name: 'Night-shift nurses', constellationId })
    expect(await field(`groups/${data.id}`, 'name')).toBe('Night-shift nurses')
  })

  it('still refuses the role word itself', async () => {
    const constellationId = await asModerator()
    expect((await failureOf(createGroup({ name: 'SiteAdmin', constellationId }))).code).toBe('functions/invalid-argument')
  })
})
