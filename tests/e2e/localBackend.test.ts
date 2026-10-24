/*
 * The local backend (functions/src/local-backend.ts) end to end, on the Auth and
 * Firestore emulators with no Functions emulator: the backend alone answers calls
 * and does the triggers' work, as it would on the NUC. Calls go through the real
 * rules. Run with `npm run test:local-backend` (stop `npm run emulators` first).
 */
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore as getAdminFirestore, type DocumentReference } from 'firebase-admin/firestore'
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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

// Signs in as a new moderator, who makes the calls that follow
const moderator = async () => {
  const uid = await person('Night Owl')
  await adminAuth.setCustomUserClaims(uid, { admin: true })
  return uid
}

const notices = async (uid: string) =>
  (await adminDb.collection(`users/${uid}/notices`).get()).docs.map((d): { id: string; [field: string]: unknown } => ({ id: d.id, ...d.data() }))

const group = async (uids: string[]) => {
  const g = `groups/notify-${++runs}`
  await adminDb.doc(g).set({ name: 'Evening sheet', memberCount: 0 })
  await Promise.all(uids.map((uid) => adminDb.doc(`${g}/members/${uid}`).set({ uid, joinedAt: new Date() })))
  return g
}

const published = (path: string) => eventually(async () => (await field(path, 'status')) === 'published', `${path} to publish`)
const held = (path: string) => eventually(async () => (await field(path, 'status')) === 'held', `${path} to be held`)
const queueId = (path: string) => path.replaceAll('/', '~')

// What people say to each other, taken in turn: none comes round often enough to read as the same
// line again and again
const TALK = [
  'Still in the waiting room.',
  'They said another hour at least.',
  'Dad is asleep now, finally.',
  'Thank you for staying up with me.',
  'The nurse came by again.',
  'Coffee from the machine is awful.',
  'She squeezed my hand!',
  'Going to try to rest a bit.',
]
const said = (i: number) => TALK[i % TALK.length]

// Posts written while the backend was off, one every three minutes. Paced by when they are
// judged (all at once), a third of them would be held
const BACKLOG = Array.from({ length: 12 }, (_, i) => `groups/backlog/posts/p${i + 1}`)

let backend: { stop: () => void }
let startBackend: () => Promise<{ stop: () => void }>

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

  await adminDb.doc('users/backlog-writer').set({ penName: 'Slow Writer', avatarSeed: 'backlog-writer', pigment: 'graphite', pro: false, banned: false })
  await Promise.all(
    BACKLOG.map((path, i) =>
      adminDb.doc(path).set({
        authorUid: 'backlog-writer',
        body: `Still up with Dad, note ${i + 1}.`,
        status: 'pending',
        createdAt: new Date(Date.now() - (BACKLOG.length - i) * 3 * 60_000),
      }),
    ),
  )

  // @ts-expect-error built JS from the functions package (npm run functions:build)
  const { startLocalBackend } = await import('../../functions/lib/local-backend.js')
  startBackend = startLocalBackend
  backend = await startBackend()
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

  it('ages calls on the server’s clock, so a clock running ahead here expires nothing', async () => {
    const uid = await person()
    // The backend runs in this process: a whole minute ahead of the emulator's clock
    vi.useFakeTimers({ now: Date.now() + 60_000, toFake: ['Date'], shouldAdvanceTime: true })
    try {
      expect(await callViaQueue('saveProfile', { penName: `Fast Clock ${runs}`, pigment: 'fresco' })).toMatchObject({ state: 'done' })
    } finally {
      vi.useRealTimers()
    }
    expect(await field(`users/${uid}`, 'penName')).toBe(`Fast Clock ${runs}`)
  })

  it('lets someone who just signed in leave, with this clock ten minutes ahead of the server’s', async () => {
    const uid = await person('Leaving Wren')
    vi.useFakeTimers({ now: Date.now() + 10 * 60_000, toFake: ['Date'], shouldAdvanceTime: true })
    try {
      expect(await callViaQueue('deleteAccount', { confirm: 'leaving wren' })).toMatchObject({ state: 'done' })
    } finally {
      vi.useRealTimers()
    }
    await expect(adminAuth.getUser(uid)).rejects.toMatchObject({ code: 'auth/user-not-found' })
  })

  it('refuses a sign-in ten minutes old, with this clock ten minutes behind the server’s', async () => {
    const uid = await person('Stale Sparrow')
    // Queued past the rules, which would want a sign-in really made ten minutes ago
    const ref = adminDb.collection('calls').doc()
    const authTime = Math.floor(Date.now() / 1000) - 10 * 60
    vi.useFakeTimers({ now: Date.now() - 10 * 60_000, toFake: ['Date'], shouldAdvanceTime: true })
    try {
      await ref.set({ uid, name: 'deleteAccount', data: { confirm: 'stale sparrow' }, authTime, state: 'new', createdAt: FieldValue.serverTimestamp() })
      await eventually(async () => !['new', 'running'].includes((await ref.get()).get('state')), 'an answer to the call')
    } finally {
      vi.useRealTimers()
    }
    expect((await ref.get()).data()).toMatchObject({ state: 'failed', error: { details: { problem: 'recent-login' } } })
    expect((await adminAuth.getUser(uid)).uid).toBe(uid)
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

  it('paces writing from while it was off by when it was written, so a slow backlog isn’t held as a flood', async () => {
    const statuses = async () => Promise.all(BACKLOG.map((path) => field(path, 'status')))
    await eventually(async () => (await statuses()).every((status) => status !== 'pending'), 'the backlog to be moderated')
    expect(await statuses()).toEqual(BACKLOG.map(() => 'published'))
    expect((await adminDb.collection('modQueue').where('authorUid', '==', 'backlog-writer').get()).empty).toBe(true)
  })

  it('still holds a burst of talk, judging one person’s notes in the order they were written', async () => {
    await adminDb.doc('users/burst-writer').set({ penName: 'Fast Writer', avatarSeed: 'burst-writer', pigment: 'graphite', pro: false, banned: false })
    // Thirty lines in the last thirty seconds, all arriving at once; ids run newest first
    const written = Array.from({ length: 30 }, (_, i) => ({ path: `groups/burst/messages/m${String(30 - i).padStart(2, '0')}`, at: Date.now() - (30 - i) * 1000 }))
    const batch = adminDb.batch()
    written.forEach(({ path, at }, i) => batch.set(adminDb.doc(path), { authorUid: 'burst-writer', text: said(i), status: 'pending', createdAt: new Date(at) }))
    await batch.commit()
    const statuses = async () => Promise.all(written.map(({ path }) => field(path, 'status')))
    await eventually(async () => (await statuses()).every((status) => status !== 'pending'), 'the burst to be moderated')
    // Twenty lines in a minute go out; past that is faster than anyone types
    expect(await statuses()).toEqual(written.map((_, i) => (i < 20 ? 'published' : 'held')))
    expect((await adminDb.collection('modQueue').where('authorUid', '==', 'burst-writer').get()).size).toBe(10)
  })

  it('never holds a run of quick lines of talk sent as they happen', async () => {
    const uid = await person('Quick Thumbs')
    const g = await group([uid])
    // Twelve lines sent one after another, as news comes in
    const paths = Array.from({ length: 12 }, (_, i) => `${g}/messages/m${i + 1}`)
    for (const [i, path] of paths.entries()) {
      await setDoc(doc(db, path), { authorUid: uid, text: said(i), status: 'pending', createdAt: serverTimestamp() })
    }
    await Promise.all(paths.map(published))
    expect((await adminDb.collection('modQueue').where('authorUid', '==', uid).get()).empty).toBe(true)
  })

  it('never holds two people’s private notes at texting pace', async () => {
    const [writer, reader] = ['texting-writer', 'texting-reader']
    await Promise.all([writer, reader].map((uid) => adminDb.doc(`users/${uid}`).set({ penName: uid, avatarSeed: uid, pigment: 'graphite', pro: false, banned: false })))
    const pairId = [writer, reader].sort().join('_')
    await adminDb.doc(`connections/${pairId}`).set({ uids: pairId.split('_'), requester: writer, recipient: reader, status: 'accepted', createdAt: new Date(), updatedAt: new Date() })
    // Twenty notes each, half a minute apart and taking turns, over the last ten minutes
    const written = Array.from({ length: 40 }, (_, i) => ({ path: `dms/${pairId}/messages/m${String(i + 1).padStart(2, '0')}`, authorUid: i % 2 ? reader : writer, at: Date.now() - (40 - i) * 15_000 }))
    const batch = adminDb.batch()
    written.forEach(({ path, authorUid, at }, i) => batch.set(adminDb.doc(path), { authorUid, text: said(Math.floor(i / 2)), status: 'pending', createdAt: new Date(at) }))
    await batch.commit()
    const statuses = async () => Promise.all(written.map(({ path }) => field(path, 'status')))
    await eventually(async () => (await statuses()).every((status) => status !== 'pending'), 'the notes to be moderated')
    expect(await statuses()).toEqual(written.map(() => 'published'))
    expect((await adminDb.collection('modQueue').where('authorUid', 'in', [writer, reader]).get()).empty).toBe(true)
  })

  it('never holds two people replying to each other under a post, a minute apart each', async () => {
    const [poster, friend] = ['thread-poster', 'thread-friend']
    await Promise.all([poster, friend].map((uid) => adminDb.doc(`users/${uid}`).set({ penName: uid, avatarSeed: uid, pigment: 'graphite', pro: false, banned: false })))
    const post = 'groups/thread/posts/p1'
    await adminDb.doc(post).set({ authorUid: poster, body: 'Scan results tomorrow.', status: 'published', createdAt: new Date(Date.now() - 16 * 60_000) })
    // Thirty replies, taking turns half a minute apart, over the last quarter of an hour
    const written = Array.from({ length: 30 }, (_, i) => ({ path: `${post}/comments/c${String(i + 1).padStart(2, '0')}`, authorUid: i % 2 ? friend : poster, at: Date.now() - (30 - i) * 30_000 }))
    const batch = adminDb.batch()
    written.forEach(({ path, authorUid, at }, i) => batch.set(adminDb.doc(path), { authorUid, text: said(Math.floor(i / 2)), status: 'pending', createdAt: new Date(at) }))
    await batch.commit()
    const statuses = async () => Promise.all(written.map(({ path }) => field(path, 'status')))
    await eventually(async () => (await statuses()).every((status) => status !== 'pending'), 'the replies to be moderated')
    expect(await statuses()).toEqual(written.map(() => 'published'))
    expect((await adminDb.collection('modQueue').where('authorUid', 'in', [poster, friend]).get()).empty).toBe(true)
  })

  it('holds the same line said over and over in one place, keeping none of its words', async () => {
    await adminDb.doc('users/echo-writer').set({ penName: 'Loud Writer', avatarSeed: 'echo-writer', pigment: 'graphite', pro: false, banned: false })
    // The same line every five seconds over the last two minutes, give or take its case, punctuation and emoji
    const written = Array.from({ length: 26 }, (_, i) => ({
      path: `groups/echo/messages/m${String(i + 1).padStart(2, '0')}`,
      at: Date.now() - (27 - i) * 5000,
      text: i % 2 ? 'EVERYONE look at my page RIGHT NOW!! 🙂' : 'Everyone, look at my page right now.',
    }))
    // Then once in another group, which is no repeat
    const elsewhere = { path: 'groups/echo-2/messages/m01', at: Date.now() - 5000, text: 'Everyone, look at my page right now.' }
    const lines = [...written, elsewhere]
    const batch = adminDb.batch()
    lines.forEach(({ path, at, text }) => batch.set(adminDb.doc(path), { authorUid: 'echo-writer', text, status: 'pending', createdAt: new Date(at) }))
    await batch.commit()
    const statuses = async () => Promise.all(lines.map(({ path }) => field(path, 'status')))
    await eventually(async () => (await statuses()).every((status) => status !== 'pending'), 'the lines to be moderated')
    expect(await statuses()).toEqual([...written.map((_, i) => (i < 20 ? 'published' : 'held')), 'published'])
    const queued = await adminDb.collection('modQueue').where('authorUid', '==', 'echo-writer').get()
    expect(queued.docs.map((d) => d.get('contentPath')).sort()).toEqual(written.slice(20).map(({ path }) => path))
    expect(queued.docs.map((d) => d.get('automod.matches'))).toEqual(queued.docs.map(() => [{ category: 'spam', term: 'the same note again' }]))
    expect(JSON.stringify((await adminDb.doc('rateLimits/echo-writer').get()).data())).not.toMatch(/look|page|everyone/i)
  })

  it('never holds the same thanks to each person who replied under their own post', async () => {
    await adminDb.doc('users/thankful-writer').set({ penName: 'Thankful Writer', avatarSeed: 'thankful-writer', pigment: 'graphite', pro: false, banned: false })
    const post = 'groups/thanks/posts/p1'
    await adminDb.doc(post).set({ authorUid: 'thankful-writer', body: 'Surgery went well.', status: 'published', createdAt: new Date(Date.now() - 11 * 60_000) })
    // Twenty well-wishers thanked, a reply every half minute over the last ten minutes
    const written = Array.from({ length: 20 }, (_, i) => ({ path: `${post}/comments/t${String(i + 1).padStart(2, '0')}`, at: Date.now() - (20 - i) * 30_000 }))
    const batch = adminDb.batch()
    written.forEach(({ path, at }) => batch.set(adminDb.doc(path), { authorUid: 'thankful-writer', text: 'Thank you so much ❤️', status: 'pending', createdAt: new Date(at) }))
    await batch.commit()
    const statuses = async () => Promise.all(written.map(({ path }) => field(path, 'status')))
    await eventually(async () => (await statuses()).every((status) => status !== 'pending'), 'the thanks to be moderated')
    expect(await statuses()).toEqual(written.map(() => 'published'))
    expect((await adminDb.collection('modQueue').where('authorUid', '==', 'thankful-writer').get()).empty).toBe(true)
  })

  it('keeps posts to eight in ten minutes, counting talk written between them apart', async () => {
    await adminDb.doc('users/mixed-writer').set({ penName: 'Busy Writer', avatarSeed: 'mixed-writer', pigment: 'graphite', pro: false, banned: false })
    // In the last half minute: a post, two lines of talk, and again, nine times
    const at = (second: number) => new Date(Date.now() - (30 - second) * 1000)
    const posts = Array.from({ length: 9 }, (_, i) => `groups/mixed/posts/p${i + 1}`)
    const talk = Array.from({ length: 18 }, (_, i) => `groups/mixed/messages/m${String(i + 1).padStart(2, '0')}`)
    const batch = adminDb.batch()
    posts.forEach((path, i) => batch.set(adminDb.doc(path), { authorUid: 'mixed-writer', body: `Update ${i + 1}.`, status: 'pending', createdAt: at(i * 3) }))
    talk.forEach((path, i) => batch.set(adminDb.doc(path), { authorUid: 'mixed-writer', text: `Line ${i + 1}.`, status: 'pending', createdAt: at(Math.floor(i / 2) * 3 + 1 + (i % 2)) }))
    await batch.commit()
    const statuses = async (paths: string[]) => Promise.all(paths.map((path) => field(path, 'status')))
    await eventually(async () => [...(await statuses(posts)), ...(await statuses(talk))].every((status) => status !== 'pending'), 'the writing to be moderated')
    expect(await statuses(posts)).toEqual(posts.map((_, i) => (i < 8 ? 'published' : 'held')))
    expect(await statuses(talk)).toEqual(talk.map(() => 'published'))
    const queued = await adminDb.collection('modQueue').where('authorUid', '==', 'mixed-writer').get()
    expect(queued.docs.map((d) => d.get('contentPath'))).toEqual([posts[8]])
  })
})

describe('notifications', () => {
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
    expect(await callViaQueue('approveContent', { queueId: path.replaceAll('/', '~') })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'published' } })

    expect(await field(path, 'status')).toBe('published')
    expect(await field(path, 'mentioned')).toEqual([{ uid: fern, penName: 'Bracken' }])
    expect(await notices(fern)).toEqual([expect.objectContaining({ type: 'mention', contentPath: path, actorUid: writer })])
  })

  // Written while the post was up, judged once it had gone (the backend was off). Written here
  // with the post already gone, so the timing is fixed
  it('pings nobody about a comment that waited while its post was withdrawn, removed or hidden', async () => {
    const poster = await person('Sorrel')
    const fern = await person('Clover')
    const writer = await person('Linden')
    const g = await group([poster, fern, writer])
    const paths = await Promise.all(
      ['withdrawn', 'removed', 'held'].map(async (status) => {
        await adminDb.doc(`${g}/posts/${status}`).set({ authorUid: poster, body: 'A long day.', status, createdAt: new Date() })
        const path = `${g}/posts/${status}/comments/c1`
        await adminDb.doc(path).set({ authorUid: writer, text: '@Clover thinking of you', mentions: [fern], status: 'pending', createdAt: new Date() })
        return path
      }),
    )
    await Promise.all(paths.map(published))

    expect(await Promise.all(paths.map((path) => field(path, 'mentioned')))).toEqual([undefined, undefined, undefined])
    expect(await notices(poster)).toEqual([])
    expect(await notices(fern)).toEqual([])
  })

  it('pings nobody once a moderator approves a comment whose post was withdrawn while it was held', async () => {
    const poster = await person('Tansy')
    const fern = await person('Vetch')
    const writer = await person('Burdock')
    const g = await group([poster, fern, writer])
    const post = `${g}/posts/p1`
    await adminDb.doc(post).set({ authorUid: poster, body: 'A long day.', status: 'published', createdAt: new Date() })

    const path = `${post}/comments/c1`
    await adminDb.doc(path).set({ authorUid: writer, text: '@Vetch thinking of you https://example.test/fundraiser', mentions: [fern], status: 'pending', createdAt: new Date() })
    await held(path)
    await signInAs(poster)
    await updateDoc(doc(db, post), { status: 'withdrawn' })

    await moderator()
    expect(await callViaQueue('approveContent', { queueId: queueId(path) })).toMatchObject({ state: 'done', result: { ok: true } })
    expect(await field(path, 'mentioned')).toBeUndefined()
    expect(await notices(poster)).toEqual([])
    expect(await notices(fern)).toEqual([])
  })

  it('catches up on a recent acceptance from while it was off, and leaves old ones be', async () => {
    await eventually(async () => (await notices('away-asker')).length === 1, 'the missed acceptance')
    expect((await notices('away-asker'))[0]).toMatchObject({ type: 'accepted', actorUid: 'away-answerer', seen: false })
    expect(await notices('old-asker')).toEqual([])
  })

  it('tells the person who reached out about an acceptance it first sees already accepted', async () => {
    const asker = await person('Reacher')
    const answerer = await person('Welcomer')
    const uids = [asker, answerer].sort()
    // Asked and answered while its listener was reconnecting: it never sees the request pending
    await adminDb.doc(`connections/${uids.join('_')}`).set({
      uids,
      requester: asker,
      recipient: answerer,
      status: 'accepted',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await eventually(async () => (await notices(asker)).length === 1, 'the accepted notice')
    expect((await notices(asker))[0]).toMatchObject({ type: 'accepted', actorUid: answerer, actor: { penName: 'Welcomer' }, seen: false })
    expect(await notices(answerer)).toEqual([])
    expect(await field(`friendships/${uids.join('_')}`, 'uids')).toEqual(uids)
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

describe('friendships', () => {
  const exists = async (path: string) => (await adminDb.doc(path).get()).exists

  it('never brings back a line after a block when the acceptance is handled late', async () => {
    const asker = await person('Kestrel')
    const answerer = await person('Merlin')
    const uids = [asker, answerer].sort()
    const pairId = uids.join('_')
    const connection = adminDb.doc(`connections/${pairId}`)
    const friendship = `friendships/${pairId}`
    // @ts-expect-error built JS from the functions package (npm run functions:build)
    const { mirrorFriendship } = await import('../../functions/lib/friendships.js')
    // Read with the functions package's own firebase-admin, so the event holds what the trigger gets
    // @ts-expect-error built JS from the functions package (npm run functions:build)
    const { db: functionsDb } = await import('../../functions/lib/app.js')

    await signInAs(asker)
    await setDoc(doc(db, connection.path), { uids, requester: asker, recipient: answerer, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const pending = await functionsDb.doc(connection.path).get()
    await signInAs(answerer)
    await updateDoc(doc(db, connection.path), { status: 'accepted', updatedAt: serverTimestamp() })
    const accepted = await functionsDb.doc(connection.path).get()
    await eventually(() => exists(friendship), 'the friendship')
    expect((await adminDb.doc(friendship).get()).data()).toEqual({ uids, since: accepted.get('updatedAt') })

    await updateDoc(doc(db, connection.path), { status: 'blocked', blockedBy: answerer, updatedAt: serverTimestamp() })
    await eventually(async () => !(await exists(friendship)), 'the friendship to go')

    // The acceptance's event arrives late (or is retried), still carrying "accepted"
    await mirrorFriendship.run({ params: { pairId }, data: { before: pending, after: accepted } })
    expect(await exists(friendship)).toBe(false)
  })
})

// Written while they could, judged later: the backend was off, or a trigger retried. Written
// here with the block (or the disconnect, or the leaving) already done, so the timing is fixed
describe('private notes that waited', () => {
  const connect = (writer: string, reader: string) => {
    const pairId = [writer, reader].sort().join('_')
    return adminDb.doc(`connections/${pairId}`).set({ uids: pairId.split('_'), requester: writer, recipient: reader, status: 'accepted', createdAt: new Date(), updatedAt: new Date() })
  }
  const write = (path: string, authorUid: string, text: string) => adminDb.doc(path).set({ authorUid, text, status: 'pending', createdAt: new Date() })
  const queueEntry = async (path: string) => (await adminDb.doc(`modQueue/${queueId(path)}`).get()).data()

  it('delivers a note while the two are connected, and holds one that waited past a block, telling only its writer', async () => {
    const writer = await person('Juniper')
    const reader = await person('Larch')
    const pairId = [writer, reader].sort().join('_')
    await connect(writer, reader)
    const [first, second] = [`dms/${pairId}/messages/m1`, `dms/${pairId}/messages/m2`]
    await write(first, writer, 'Thinking of you tonight.')
    await published(first)
    const thread = (await adminDb.doc(`dms/${pairId}`).get()).data()
    expect(thread).toMatchObject({ lastAuthorUid: writer })

    await adminDb.doc(`connections/${pairId}`).update({ status: 'blocked', blockedBy: reader, updatedAt: new Date() })
    await write(second, writer, 'Thinking of you tonight.')
    await held(second)

    expect((await adminDb.doc(second).get()).data()).toMatchObject({ undelivered: true, author: { penName: 'Juniper' } })
    // Nothing in it for a person to read
    expect(await field(second, 'heldReason')).toBeUndefined()
    expect(await queueEntry(second)).toBeUndefined()
    expect((await adminDb.doc(`dms/${pairId}`).get()).data()).toEqual(thread)
  })

  it('holds notes that waited past a disconnect, still giving crisis words to a person and their writer resources', async () => {
    const writer = await person('Medick')
    const reader = await person('Lovage')
    const pairId = [writer, reader].sort().join('_')
    const [plain, heavy] = [`dms/${pairId}/messages/m1`, `dms/${pairId}/messages/m2`]
    await write(plain, writer, 'Thinking of you tonight.')
    await write(heavy, writer, 'I want to die')
    await Promise.all([plain, heavy].map(held))

    expect((await adminDb.doc(plain).get()).data()).toMatchObject({ undelivered: true })
    expect((await adminDb.doc(heavy).get()).data()).toMatchObject({ undelivered: true, heldReason: 'crisis' })
    expect(await field(heavy, 'crisis')).toBeUndefined()
    expect(await queueEntry(heavy)).toMatchObject({ state: 'open', delivered: false, priority: 2 })
    expect(await notices(writer)).toEqual([expect.objectContaining({ type: 'crisis', contentPath: heavy })])
    expect((await adminDb.doc(`dms/${pairId}`).get()).exists).toBe(false)

    // Its writer was told it won't arrive, so it doesn't once they connect again either
    await connect(writer, reader)
    await moderator()
    expect(await callViaQueue('approveContent', { queueId: queueId(heavy) })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'undelivered' } })
    expect(await field(heavy, 'status')).toBe('held')
    expect((await adminDb.doc(`dms/${pairId}`).get()).exists).toBe(false)
  })

  it('still delivers a chat line whose writer left the chat while it waited', async () => {
    const writer = await person('Yarrow Bell')
    const friend = await person('Comfrey')
    const chat = `chats/chat-${runs}`
    await adminDb.doc(chat).set({ name: 'Evenings', uids: [friend], createdBy: writer, createdAt: new Date(), lastMessageAt: null })
    const path = `${chat}/messages/m1`
    await write(path, writer, 'Take care of yourselves, I am heading out.')
    await published(path)
    expect(await field(chat, 'lastAuthorUid')).toBe(writer)
  })
})

describe('review queue', () => {
  const report = (path: string, reporterUids: string[]) =>
    Promise.all(reporterUids.map((reporterUid) => adminDb.collection('reports').add({ reporterUid, contentPath: path, reason: 'harassment', createdAt: new Date() })))
  const queued = (path: string) => eventually(async () => (await field(`modQueue/${queueId(path)}`, 'state')) === 'open', `${path} to be queued`)
  const removedNotices = async (uid: string) => (await notices(uid)).filter((notice) => notice.type === 'removed')

  it('keeps up writing that reports hid without pinging anyone again, so read notices stay read', async () => {
    const poster = await person('Alder')
    const hazel = await person('Hazel')
    const writer = await person('Rowan')
    const reporters = [await person('Moss'), await person('Sedge'), await person('Teasel')]
    const g = await group([poster, hazel, writer, ...reporters])
    await adminDb.doc(`${g}/posts/p1`).set({ authorUid: poster, body: 'A long day.', status: 'published', createdAt: new Date() })

    const path = `${g}/posts/p1/comments/c1`
    await adminDb.doc(path).set({ authorUid: writer, text: '@Hazel thinking of you', mentions: [hazel], status: 'pending', createdAt: new Date() })
    await published(path)
    const sent = [`users/${hazel}/notices/mention~${queueId(path)}`, `users/${poster}/notices/comment~${queueId(path)}`]
    await Promise.all(sent.map((notice) => adminDb.doc(notice).update({ seen: true })))
    const read = await Promise.all(sent.map(async (notice) => (await adminDb.doc(notice).get()).data()))
    const publishedAt = await field(path, 'publishedAt')

    await report(path, reporters)
    await held(path)
    await moderator()
    expect(await callViaQueue('approveContent', { queueId: queueId(path) })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'restored' } })

    expect(await field(path, 'status')).toBe('published')
    expect(await field(path, 'publishedAt')).toEqual(publishedAt)
    expect(await Promise.all(sent.map(async (notice) => (await adminDb.doc(notice).get()).data()))).toEqual(read)
    expect(read.map((notice) => notice?.seen)).toEqual([true, true])
  })

  it('keeps up a chat line that reports hid without moving the chat on', async () => {
    const writer = await person('Linnet')
    const reporters = [await person('Wren'), await person('Finch'), await person('Siskin')]
    const chat = `chats/chat-${runs}`
    await adminDb.doc(chat).set({ name: 'Night shift', uids: [writer, ...reporters], createdBy: writer, createdAt: new Date(), lastMessageAt: null })
    const path = `${chat}/messages/m1`
    await adminDb.doc(path).set({ authorUid: writer, text: 'Long night here.', status: 'pending', createdAt: new Date() })
    await published(path)
    // Someone answers, so the chat's latest line is theirs
    await adminDb.doc(`${chat}/messages/m2`).set({ authorUid: reporters[0], text: 'Same here.', status: 'pending', createdAt: new Date() })
    await published(`${chat}/messages/m2`)
    const latest = await adminDb.doc(chat).get()

    await report(path, reporters)
    await held(path)
    await moderator()
    expect(await callViaQueue('approveContent', { queueId: queueId(path) })).toMatchObject({ state: 'done' })

    expect(await field(path, 'status')).toBe('published')
    expect(await field(chat, 'lastAuthorUid')).toBe(reporters[0])
    expect(await field(chat, 'lastMessageAt')).toEqual(latest.get('lastMessageAt'))
  })

  it('delivers a held private note while the two are connected, and never once one has blocked the other', async () => {
    const writer = await person('Bramble')
    const reader = await person('Clover')
    const pairId = [writer, reader].sort().join('_')
    await adminDb.doc(`connections/${pairId}`).set({ uids: pairId.split('_'), requester: writer, recipient: reader, status: 'accepted', createdAt: new Date(), updatedAt: new Date() })
    const [first, second] = [`dms/${pairId}/messages/m1`, `dms/${pairId}/messages/m2`]
    await adminDb.doc(first).set({ authorUid: writer, text: 'you are such a loser', status: 'pending', createdAt: new Date() })
    await held(first)
    await moderator()
    expect(await callViaQueue('approveContent', { queueId: queueId(first) })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'published' } })
    expect(await field(first, 'status')).toBe('published')
    expect(await field(first, 'undelivered')).toBeUndefined()
    const thread = (await adminDb.doc(`dms/${pairId}`).get()).data()
    expect(thread).toMatchObject({ lastAuthorUid: writer })

    await adminDb.doc(second).set({ authorUid: writer, text: 'you are such a loser', status: 'pending', createdAt: new Date() })
    await held(second)
    await adminDb.doc(`connections/${pairId}`).update({ status: 'blocked', blockedBy: reader, updatedAt: new Date() })
    // The moderator is told it went nowhere, though it leaves the queue all the same
    expect(await callViaQueue('approveContent', { queueId: queueId(second) })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'undelivered' } })

    expect(await field(second, 'status')).toBe('held')
    // Its writer is told so too, not left thinking a person has yet to read it
    expect(await field(second, 'undelivered')).toBe(true)
    expect((await adminDb.doc(`dms/${pairId}`).get()).data()).toEqual(thread)
    expect(await field(`modQueue/${queueId(second)}`, 'state')).toBe('resolved')
    expect(await field(`modQueue/${queueId(second)}`, 'resolution')).toBe('approved-undelivered')
  })

  it('gives both people crisis resources once a moderator approves a private note held for crisis words and more', async () => {
    const writer = await person('Sorrel Moon')
    const reader = await person('Tansy')
    const pairId = [writer, reader].sort().join('_')
    await adminDb.doc(`connections/${pairId}`).set({ uids: pairId.split('_'), requester: writer, recipient: reader, status: 'accepted', createdAt: new Date(), updatedAt: new Date() })
    const chat = `chats/chat-${runs}`
    await adminDb.doc(chat).set({ name: 'Late shift', uids: [writer, reader], createdBy: writer, createdAt: new Date(), lastMessageAt: null })
    // The crisis words alone would go straight out marked; the link holds it for a person first
    const [note, line] = [`dms/${pairId}/messages/m1`, `${chat}/messages/m1`]
    await Promise.all([note, line].map((path) => adminDb.doc(path).set({ authorUid: writer, text: 'I want to die, see example.com', status: 'pending', createdAt: new Date() })))
    await Promise.all([note, line].map(held))
    expect(await Promise.all([note, line].map((path) => field(path, 'heldReason')))).toEqual(['crisis', 'crisis'])

    await moderator()
    for (const path of [note, line]) {
      expect(await callViaQueue('approveContent', { queueId: queueId(path) })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'published' } })
      expect((await adminDb.doc(path).get()).data()).toMatchObject({ status: 'published', crisis: true })
    }
  })

  it('keeps a banned writer’s held writing held when a moderator approves it, and pings nobody', async () => {
    const writer = await person('Hemlock')
    const reader = await person('Fen')
    const pairId = [writer, reader].sort().join('_')
    await adminDb.doc(`connections/${pairId}`).set({ uids: pairId.split('_'), requester: writer, recipient: reader, status: 'accepted', createdAt: new Date(), updatedAt: new Date() })
    const g = await group([writer, reader])
    const [note, post] = [`dms/${pairId}/messages/m1`, `${g}/posts/p1`]
    await adminDb.doc(note).set({ authorUid: writer, text: 'you are such a loser', status: 'pending', createdAt: new Date() })
    await adminDb.doc(post).set({ authorUid: writer, body: '@Fen you are such a loser', mentions: [reader], status: 'pending', createdAt: new Date() })
    await Promise.all([note, post].map(held))

    // Banned, with their writing left as it is
    await moderator()
    expect(await callViaQueue('banUser', { uid: writer, reason: 'Harassment.' })).toMatchObject({ state: 'done' })
    for (const path of [note, post]) {
      expect(await callViaQueue('approveContent', { queueId: queueId(path) })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'paused' } })
      expect((await adminDb.doc(path).get()).data()).toMatchObject({ status: 'held', undelivered: true })
      expect(await field(`modQueue/${queueId(path)}`, 'resolution')).toBe('approved-undelivered')
    }
    expect(await notices(reader)).toEqual([])
    expect((await adminDb.doc(`dms/${pairId}`).get()).exists).toBe(false)
  })

  it('tells the writer once, with the moderator’s note, however many times Remove is pressed', async () => {
    const writer = await person('Thistle')
    const reporter = await person('Yarrow')
    const g = await group([writer, reporter])
    const path = `${g}/posts/p1`
    await adminDb.doc(path).set({ authorUid: writer, body: 'Call me any time.', status: 'published', createdAt: new Date() })
    await report(path, [reporter])
    await queued(path)

    await moderator()
    const note = '  Please keep phone numbers out of posts.  '
    const calls = await Promise.all([1, 2].map(() => callViaQueue('removeContent', { queueId: queueId(path), note })))
    expect(calls).toEqual([expect.objectContaining({ state: 'done' }), expect.objectContaining({ state: 'done' })])
    // Whichever came second is told it changed nothing
    expect(calls.map((call) => call.result.outcome).sort()).toEqual(['already-resolved', 'removed'])

    expect(await field(path, 'status')).toBe('removed')
    expect(await removedNotices(writer)).toEqual([
      expect.objectContaining({ type: 'removed', contentPath: path, note: 'Please keep phone numbers out of posts.', seen: false }),
    ])
  })

  it('tells a moderator who approves what another already removed that nothing changed, and changes nothing', async () => {
    const writer = await person('Nettle')
    const reporter = await person('Campion')
    const g = await group([writer, reporter])
    const path = `${g}/posts/p1`
    await adminDb.doc(path).set({ authorUid: writer, body: 'Call me any time.', status: 'published', createdAt: new Date() })
    await report(path, [reporter])
    await queued(path)

    const first = await moderator()
    expect(await callViaQueue('removeContent', { queueId: queueId(path) })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'removed' } })
    // A second moderator, whose page still shows the entry
    await moderator()
    expect(await callViaQueue('approveContent', { queueId: queueId(path) })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'already-resolved' } })

    expect(await field(path, 'status')).toBe('removed')
    expect((await adminDb.doc(`modQueue/${queueId(path)}`).get()).data()).toMatchObject({ state: 'resolved', resolution: 'removed', resolvedBy: first })
  })

  it('leaves held writing its writer withdrew as theirs, and tells them nothing', async () => {
    const writer = await person('Burdock')
    const g = await group([writer])
    const path = `${g}/posts/p1`
    await setDoc(doc(db, path), { authorUid: writer, body: 'you are such a loser', status: 'pending', createdAt: serverTimestamp() })
    await held(path)
    await updateDoc(doc(db, path), { status: 'withdrawn' })

    await moderator()
    expect(await callViaQueue('removeContent', { queueId: queueId(path), note: 'Not here.' })).toMatchObject({ state: 'done', result: { ok: true, outcome: 'withdrawn' } })

    expect(await field(path, 'status')).toBe('withdrawn')
    expect(await field(`modQueue/${queueId(path)}`, 'state')).toBe('resolved')
    expect(await removedNotices(writer)).toEqual([])
  })

  it('resets a reported profile once, however many times Reset is pressed', async () => {
    const owner = await person('Loud Name')
    const reporter = await person('Quiet Reader')
    await report(`users/${owner}`, [reporter])
    await queued(`users/${owner}`)

    await moderator()
    const calls = await Promise.all([1, 2].map(() => callViaQueue('removeContent', { queueId: queueId(`users/${owner}`) })))
    expect(calls).toEqual([expect.objectContaining({ state: 'done' }), expect.objectContaining({ state: 'done' })])
    expect(calls.map((call) => call.result.outcome).sort()).toEqual(['already-resolved', 'removed'])

    const profile = (await adminDb.doc(`users/${owner}`).get()).data()
    expect(profile?.penName).not.toBe('Loud Name')
    expect(await field(`penNames/${profile?.penNameLower}`, 'uid')).toBe(owner)
    expect(await removedNotices(owner)).toEqual([expect.not.objectContaining({ note: expect.anything() })])
  })

  it('shows a reported post’s title once, above its words', async () => {
    const writer = await person('Sorrel')
    const reporter = await person('Vetch')
    const g = await group([writer, reporter])
    const path = `${g}/posts/p1`
    await adminDb.doc(path).set({ authorUid: writer, title: 'Tonight', body: 'Sitting up with Mum again.', status: 'published', createdAt: new Date() })
    await report(path, [reporter])
    await queued(path)

    expect(await field(`modQueue/${queueId(path)}`, 'snapshot')).toEqual({ title: 'Tonight', text: 'Sitting up with Mum again.' })
  })

  it('takes three new reports to hide writing a moderator kept up', async () => {
    const writer = await person('Aspen')
    const reporters = [await person('Birch'), await person('Hornbeam'), await person('Elder')]
    const late = await person('Spindle')
    const g = await group([writer, ...reporters, late])
    const path = `${g}/posts/p1`
    await adminDb.doc(path).set({ authorUid: writer, body: 'A long day.', status: 'published', createdAt: new Date() })
    await report(path, reporters)
    await held(path)
    await moderator()
    expect(await callViaQueue('approveContent', { queueId: queueId(path) })).toMatchObject({ state: 'done' })

    await report(path, [late])
    await queued(path)
    expect(await field(path, 'status')).toBe('published')
    expect(await field(`modQueue/${queueId(path)}`, 'reports')).toEqual({ count: 1, reasons: ['harassment'], reporterUids: [late] })
  })

  it('hears again from someone who reported a profile, once a moderator has reset it', async () => {
    const owner = await person('Loud Heron')
    const reporter = await person('Watchful Reader')
    const profile = `users/${owner}`
    await report(profile, [reporter])
    await queued(profile)
    await moderator()
    expect(await callViaQueue('removeContent', { queueId: queueId(profile) })).toMatchObject({ state: 'done' })

    // They take another name like the one that was reset
    await adminDb.doc(profile).update({ penName: 'Loud Heron Again', penNameLower: 'loud heron again' })
    await report(profile, [reporter])
    await queued(profile)
    expect(await field(`modQueue/${queueId(profile)}`, 'snapshot')).toMatchObject({ title: 'Loud Heron Again' })
    expect(await field(`modQueue/${queueId(profile)}`, 'reports.reporterUids')).toEqual([reporter])
  })

  it('catches up after a restart without undoing a decision or counting a report it dropped', async () => {
    const writer = await person('Hawthorn')
    const reporters = [await person('Sloe'), await person('Damson'), await person('Bullace')]
    const late = await person('Medlar')
    const outsider = await person('Passer-by')
    const g = await group([writer, ...reporters, late])
    const [kept, unseen, missed] = ['p1', 'p2', 'p3'].map((p) => `${g}/posts/${p}`)
    await Promise.all([kept, unseen, missed].map((path) => adminDb.doc(path).set({ authorUid: writer, body: 'A quiet evening.', status: 'published', createdAt: new Date() })))
    const handled = (refs: DocumentReference[]) =>
      eventually(async () => (await Promise.all(refs.map((ref) => ref.get()))).every((snap) => snap.get('handledAt') !== undefined), 'the reports to be handled')

    // Three reports hide one post, and a fourth, sent as it was hidden, is dropped
    const first = await report(kept, reporters)
    await held(kept)
    const dropped = await report(kept, [late])
    // Someone outside the group reports another, which is dropped; they join later
    const outside = await report(unseen, [outsider])
    await handled([...first, ...dropped, ...outside])
    await moderator()
    expect(await callViaQueue('approveContent', { queueId: queueId(kept) })).toMatchObject({ state: 'done' })
    await adminDb.doc(`${g}/members/${outsider}`).set({ uid: outsider, joinedAt: new Date() })

    backend.stop()
    // The first three as handled before reports were marked: only their time keeps them from counting again
    await Promise.all(first.map((ref) => ref.update({ handledAt: FieldValue.delete() })))
    const sentWhileOff = await report(missed, [late])
    backend = await startBackend()
    await handled([...first, ...sentWhileOff])
    // Anything else it replayed has had time to land
    await sleep(1000)

    expect(await field(`modQueue/${queueId(missed)}`, 'reports.reporterUids')).toEqual([late])
    expect(await field(kept, 'status')).toBe('published')
    expect(await field(`modQueue/${queueId(kept)}`, 'state')).toBe('resolved')
    // Filed together, so counted in whatever order they landed
    expect((await field(`modQueue/${queueId(kept)}`, 'reports.reporterUids')).sort()).toEqual([...reporters].sort())
    expect((await adminDb.doc(`modQueue/${queueId(unseen)}`).get()).exists).toBe(false)
  })
})
