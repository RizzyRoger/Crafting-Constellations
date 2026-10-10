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
  updateDoc,
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

const signInAs = async (uid: string) => {
  await signOut(auth)
  await signInWithEmailAndPassword(auth, `${uid}@example.test`, PASSWORD)
}

const notices = async (uid: string) => (await adminDb.collection(`users/${uid}/notices`).get()).docs.map((d) => ({ id: d.id, ...d.data() }))

let backend: { stop: () => void }

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Run with npm run test:local-backend (inside the emulators).')
  }
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  connectFirestoreEmulator(db, host, Number(port))
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })

  // Accepted while the backend was off: one an hour ago (still news), one last month (too old)
  const acceptedAgo = async (asker: string, answerer: string, ms: number) => {
    const uids = [asker, answerer].sort()
    await Promise.all([asker, answerer].map((uid) => adminDb.doc(`users/${uid}`).set({ penName: uid, avatarSeed: uid, pigment: 'graphite', pro: false, banned: false })))
    const at = new Date(Date.now() - ms)
    await adminDb.doc(`connections/${uids.join('_')}`).set({ uids, requester: asker, recipient: answerer, status: 'accepted', createdAt: at, updatedAt: at })
  }
  await acceptedAgo('away-asker', 'away-answerer', 60 * 60_000)
  await acceptedAgo('old-asker', 'old-answerer', 30 * 24 * 60 * 60_000)

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

describe('notifications', () => {
  const group = async (uids: string[]) => {
    const g = `groups/notify-${++runs}`
    await adminDb.doc(g).set({ name: 'Evening sheet', memberCount: 0 })
    await Promise.all(uids.map((uid) => adminDb.doc(`${g}/members/${uid}`).set({ uid, joinedAt: new Date() })))
    return g
  }
  const published = (path: string) => eventually(async () => (await field(path, 'status')) === 'published', `${path} to publish`)

  it('pings people picked with @ who can read it, and tells the post’s writer about a comment', async () => {
    const poster = await person('Willow')
    const fern = await person('Fern')
    const outsider = await person('Outsider')
    const writer = await person('Writer')
    const g = await group([poster, fern, writer])
    await adminDb.doc(`${g}/posts/p1`).set({ authorUid: poster, body: 'A long day.', status: 'published', createdAt: new Date() })

    const path = `${g}/posts/p1/comments/c1`
    await setDoc(doc(db, path), {
      authorUid: writer,
      text: '@fern and @Outsider, thinking of you all',
      mentions: [fern, outsider, writer],
      status: 'pending',
      createdAt: serverTimestamp(),
    })
    await published(path)

    expect(await field(path, 'mentioned')).toEqual([{ uid: fern, penName: 'Fern' }])
    expect(await notices(fern)).toEqual([
      expect.objectContaining({ id: `mention~${path.replaceAll('/', '~')}`, type: 'mention', contentPath: path, actorUid: writer, seen: false }),
    ])
    expect((await notices(fern))[0]).toMatchObject({ actor: { penName: 'Writer' }, contentAt: await field(path, 'createdAt') })
    expect(await notices(poster)).toEqual([expect.objectContaining({ type: 'comment', contentPath: path, actorUid: writer })])
    expect(await notices(outsider)).toEqual([])
    expect(await notices(writer)).toEqual([])
  })

  it('never pings someone who blocked the writer, in group talk or anywhere', async () => {
    const blocker = await person('Hedge')
    const friend = await person('Lantern')
    const writer = await person('Talker')
    const g = await group([blocker, friend, writer])
    await adminDb.doc(`connections/${[blocker, writer].sort().join('_')}`).set({
      uids: [blocker, writer].sort(),
      requester: writer,
      recipient: blocker,
      status: 'blocked',
      blockedBy: blocker,
    })

    const path = `${g}/messages/m1`
    await setDoc(doc(db, path), { authorUid: writer, text: '@Hedge @Lantern tea later?', mentions: [blocker, friend], status: 'pending', createdAt: serverTimestamp() })
    await published(path)

    expect(await field(path, 'mentioned')).toEqual([{ uid: friend, penName: 'Lantern' }])
    expect(await notices(friend)).toHaveLength(1)
    expect(await notices(blocker)).toEqual([])
  })

  it('pings nobody while writing is held, then pings once a moderator approves it', async () => {
    const fern = await person('Bracken')
    const writer = await person('Sharp Tongue')
    const g = await group([fern, writer])

    const path = `${g}/posts/p1`
    await setDoc(doc(db, path), { authorUid: writer, body: '@Bracken you are such a loser', mentions: [fern], status: 'pending', createdAt: serverTimestamp() })
    await eventually(async () => (await field(path, 'status')) === 'held', 'the post to be held')
    expect(await notices(fern)).toEqual([])
    expect(await field(path, 'mentioned')).toBeUndefined()

    const moderator = await person('Night Owl')
    await adminAuth.setCustomUserClaims(moderator, { admin: true })
    expect(await callViaQueue('approveContent', { queueId: path.replaceAll('/', '~') })).toMatchObject({ state: 'done' })

    expect(await field(path, 'status')).toBe('published')
    expect(await field(path, 'mentioned')).toEqual([{ uid: fern, penName: 'Bracken' }])
    expect(await notices(fern)).toEqual([expect.objectContaining({ type: 'mention', contentPath: path, actorUid: writer })])
  })

  it('catches up on a recent acceptance from while it was off, and leaves old ones be', async () => {
    await eventually(async () => (await notices('away-asker')).length === 1, 'the missed acceptance')
    expect((await notices('away-asker'))[0]).toMatchObject({ type: 'accepted', actorUid: 'away-answerer', seen: false })
    expect(await notices('old-asker')).toEqual([])
  })

  it('tells the person who reached out, once, when their request is accepted', async () => {
    const asker = await person('Asker')
    const answerer = await person('Answerer')
    const pairId = [asker, answerer].sort().join('_')

    await signInAs(asker)
    await setDoc(doc(db, `connections/${pairId}`), {
      uids: [asker, answerer].sort(),
      requester: asker,
      recipient: answerer,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    // Let the backend see the request as pending before it is answered
    await sleep(1500)
    expect(await notices(asker)).toEqual([])

    await signInAs(answerer)
    await updateDoc(doc(db, `connections/${pairId}`), { status: 'accepted', updatedAt: serverTimestamp() })
    await eventually(async () => (await notices(asker)).length === 1, 'the accepted notice')

    expect((await notices(asker))[0]).toMatchObject({ type: 'accepted', actorUid: answerer, actor: { penName: 'Answerer' }, seen: false })
    expect(await notices(answerer)).toEqual([])
  })
})
