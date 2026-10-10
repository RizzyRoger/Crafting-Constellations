import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  arrayRemove,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const PROJECT_ID = 'demo-crafting-constellations'
const GROUP = 'groups/g1'

let env: RulesTestEnvironment

// Personas: alice/bob are verified members of g1, carl is verified but not a
// member, una is an unverified member, mia is an admin, bea is banned.
const as = (uid: string, token: Record<string, unknown> = { email_verified: true }) =>
  env.authenticatedContext(uid, token).firestore() as unknown as Firestore
const alice = () => as('alice')
const bob = () => as('bob')
const carl = () => as('carl')
const una = () => as('una', { email_verified: false })
const admin = () => as('mia', { email_verified: true, admin: true })
const banned = () => as('bea')

const seed = (write: (db: Firestore) => Promise<unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await write(ctx.firestore() as unknown as Firestore)
  })

const pending = (authorUid: string, extra: Record<string, unknown>) => ({
  authorUid,
  status: 'pending',
  createdAt: serverTimestamp(),
  ...extra,
})

beforeAll(async () => {
  setLogLevel('error')
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await seed(async (db) => {
    for (const uid of ['alice', 'bob', 'carl', 'una', 'mia', 'bea']) {
      await setDoc(doc(db, 'users', uid), { penName: uid, pro: false, banned: false })
    }
    await setDoc(doc(db, GROUP), { name: 'Evening sheet', memberCount: 0 })
    for (const uid of ['alice', 'bob', 'una', 'bea']) {
      await setDoc(doc(db, `${GROUP}/members/${uid}`), { uid, joinedAt: new Date() })
    }
    await setDoc(doc(db, 'bans/bea'), { uid: 'bea', reason: 'test' })
    await setDoc(doc(db, `${GROUP}/posts/pub`), { authorUid: 'bob', body: 'hello', status: 'published', createdAt: new Date() })
    await setDoc(doc(db, `${GROUP}/posts/pend`), { authorUid: 'bob', body: 'checking', status: 'pending', createdAt: new Date() })
  })
})

describe('profiles', () => {
  it('signed-in people can read profiles; strangers cannot', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/bob')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, 'users/bob')))
  })

  it('nobody writes a profile directly, not even their own', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { penName: 'Alice', pro: true }))
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { pro: true }))
  })

  it('private settings are owner-only', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/private/settings'), { reduceMotion: true }))
    await assertFails(getDoc(doc(bob(), 'users/alice/private/settings')))
  })
})

describe('membership', () => {
  it('people join and leave themselves only', async () => {
    await assertSucceeds(setDoc(doc(carl(), `${GROUP}/members/carl`), { uid: 'carl', joinedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(carl(), `${GROUP}/members/dan`), { uid: 'dan', joinedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(carl(), `${GROUP}/members/alice`)))
    await assertSucceeds(deleteDoc(doc(alice(), `${GROUP}/members/alice`)))
  })

  it('collection-group membership queries are readable', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(alice(), 'members'), where('uid', '==', 'bob'))))
  })
})

describe('posts', () => {
  const posts = (db: Firestore) => collection(db, `${GROUP}/posts`)

  it('a member creates a pending post as themself', async () => {
    await assertSucceeds(setDoc(doc(posts(alice())), pending('alice', { body: 'first post' })))
  })

  it('an unverified member cannot post or talk in the group', async () => {
    await assertFails(setDoc(doc(posts(una())), pending('una', { body: 'x' })))
    await assertFails(setDoc(doc(collection(una(), `${GROUP}/messages`)), pending('una', { text: 'x' })))
    await assertSucceeds(setDoc(doc(collection(alice(), `${GROUP}/messages`)), pending('alice', { text: 'hello' })))
  })

  it('rejects forged status, author snapshot, or someone else as author', async () => {
    await assertFails(setDoc(doc(posts(alice())), { ...pending('alice', { body: 'x' }), status: 'published' }))
    await assertFails(setDoc(doc(posts(alice())), pending('alice', { body: 'x', author: { penName: 'A', pro: true } })))
    await assertFails(setDoc(doc(posts(alice())), pending('bob', { body: 'x' })))
    await assertFails(setDoc(doc(posts(alice())), pending('alice', { body: 'x', likeCount: 99 })))
  })

  it('non-members and banned members cannot post', async () => {
    await assertFails(setDoc(doc(posts(carl())), pending('carl', { body: 'x' })))
    await assertFails(setDoc(doc(posts(banned())), pending('bea', { body: 'x' })))
  })

  it('rejects empty and over-long bodies', async () => {
    await assertFails(setDoc(doc(posts(alice())), pending('alice', { body: '' })))
    await assertFails(setDoc(doc(posts(alice())), pending('alice', { body: 'x'.repeat(4001) })))
  })

  it('pending posts are visible to their author only', async () => {
    await assertSucceeds(getDoc(doc(bob(), `${GROUP}/posts/pend`)))
    await assertFails(getDoc(doc(alice(), `${GROUP}/posts/pend`)))
    await assertSucceeds(getDoc(doc(alice(), `${GROUP}/posts/pub`)))
  })

  it('members can query published posts; unfiltered or non-member queries fail', async () => {
    await assertSucceeds(getDocs(query(posts(alice()), where('status', '==', 'published'))))
    await assertSucceeds(getDocs(query(posts(alice()), where('authorUid', '==', 'alice'))))
    await assertFails(getDocs(posts(alice())))
    await assertFails(getDocs(query(posts(carl()), where('status', '==', 'published'))))
  })

  it('admins can read any post', async () => {
    await assertSucceeds(getDoc(doc(admin(), `${GROUP}/posts/pend`)))
  })

  it('authors can withdraw, but never publish', async () => {
    await assertFails(updateDoc(doc(bob(), `${GROUP}/posts/pend`), { status: 'published' }))
    await assertFails(updateDoc(doc(alice(), `${GROUP}/posts/pub`), { status: 'withdrawn' }))
    await assertSucceeds(updateDoc(doc(bob(), `${GROUP}/posts/pub`), { status: 'withdrawn' }))
    await assertFails(deleteDoc(doc(bob(), `${GROUP}/posts/pend`)))
  })
})

describe('comments and likes', () => {
  it('comments need a published parent', async () => {
    await assertSucceeds(setDoc(doc(collection(alice(), `${GROUP}/posts/pub/comments`)), pending('alice', { text: 'with you' })))
    await assertFails(setDoc(doc(collection(alice(), `${GROUP}/posts/pend/comments`)), pending('alice', { text: 'x' })))
  })

  it('an unverified member cannot comment or like', async () => {
    await assertFails(setDoc(doc(collection(una(), `${GROUP}/posts/pub/comments`)), pending('una', { text: 'x' })))
    await assertFails(setDoc(doc(una(), `${GROUP}/posts/pub/likes/una`), { uid: 'una', createdAt: serverTimestamp() }))
  })

  it('one like per person, on published posts only', async () => {
    const like = { uid: 'alice', createdAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(alice(), `${GROUP}/posts/pub/likes/alice`), like))
    await assertFails(setDoc(doc(alice(), `${GROUP}/posts/pub/likes/alice`), like))
    await assertFails(setDoc(doc(alice(), `${GROUP}/posts/pub/likes/bob`), { uid: 'bob', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(alice(), `${GROUP}/posts/pend/likes/alice`), like))
    await assertSucceeds(deleteDoc(doc(alice(), `${GROUP}/posts/pub/likes/alice`)))
  })
})

describe('connections', () => {
  const request = (from: string, to: string) => {
    const uids = [from, to].sort()
    return {
      id: uids.join('_'),
      data: { uids, requester: from, recipient: to, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    }
  }

  it('verified people can reach out; unverified cannot', async () => {
    const r = request('alice', 'carl')
    await assertSucceeds(setDoc(doc(alice(), `connections/${r.id}`), r.data))
    const u = request('una', 'carl')
    await assertFails(setDoc(doc(una(), `connections/${u.id}`), u.data))
  })

  it('the pair id must match the sorted uids', async () => {
    const r = request('alice', 'carl')
    await assertFails(setDoc(doc(alice(), 'connections/carl_alice'), r.data))
  })

  it('only the recipient accepts', async () => {
    const r = request('alice', 'carl')
    await assertSucceeds(setDoc(doc(alice(), `connections/${r.id}`), r.data))
    await assertFails(updateDoc(doc(alice(), `connections/${r.id}`), { status: 'accepted', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(carl(), `connections/${r.id}`), { status: 'accepted', updatedAt: serverTimestamp() }))
  })

  it('an unverified recipient cannot accept', async () => {
    const r = request('alice', 'una')
    await assertSucceeds(setDoc(doc(alice(), `connections/${r.id}`), r.data))
    await assertFails(updateDoc(doc(una(), `connections/${r.id}`), { status: 'accepted', updatedAt: serverTimestamp() }))
  })

  it('participants list their own connections; others cannot read them', async () => {
    const r = request('alice', 'carl')
    await assertSucceeds(setDoc(doc(alice(), `connections/${r.id}`), r.data))
    await assertSucceeds(getDocs(query(collection(carl(), 'connections'), where('uids', 'array-contains', 'carl'))))
    await assertFails(getDoc(doc(bob(), `connections/${r.id}`)))
  })
})

describe('friendships', () => {
  it('accepted friendships are visible to everyone signed in, and written only by functions', async () => {
    await seed((db) => setDoc(doc(db, 'friendships/alice_bob'), { uids: ['alice', 'bob'] }))
    await assertSucceeds(getDocs(collection(carl(), 'friendships')))
    await assertFails(setDoc(doc(alice(), 'friendships/alice_carl'), { uids: ['alice', 'carl'] }))
  })
})

describe('private messages', () => {
  const PAIR = 'alice_bob'

  const connect = (status: string) =>
    seed((db) => setDoc(doc(db, `connections/${PAIR}`), { uids: ['alice', 'bob'], requester: 'alice', recipient: 'bob', status }))

  it('needs an accepted connection', async () => {
    await connect('pending')
    await assertFails(setDoc(doc(collection(alice(), `dms/${PAIR}/messages`)), pending('alice', { text: 'hi' })))
    await connect('accepted')
    await assertSucceeds(setDoc(doc(collection(alice(), `dms/${PAIR}/messages`)), pending('alice', { text: 'hi' })))
  })

  it('needs a verified email', async () => {
    await seed((db) => setDoc(doc(db, 'connections/alice_una'), { uids: ['alice', 'una'], status: 'accepted' }))
    await assertFails(setDoc(doc(collection(una(), 'dms/alice_una/messages')), pending('una', { text: 'hi' })))
  })

  it('outsiders cannot read a thread', async () => {
    await connect('accepted')
    await seed((db) => setDoc(doc(db, `dms/${PAIR}/messages/m1`), { authorUid: 'alice', text: 'hi', status: 'published' }))
    await assertSucceeds(getDoc(doc(bob(), `dms/${PAIR}/messages/m1`)))
    await assertFails(getDoc(doc(carl(), `dms/${PAIR}/messages/m1`)))
    await assertFails(getDoc(doc(admin(), `dms/${PAIR}/messages/m1`)))
    await assertSucceeds(getDocs(query(collection(bob(), `dms/${PAIR}/messages`), where('status', '==', 'published'))))
  })
})

describe('private group chats', () => {
  const CHAT = 'chats/c1'

  beforeEach(() =>
    seed(async (db) => {
      await setDoc(doc(db, CHAT), { name: 'Tuesday soup', uids: ['alice', 'bob', 'una', 'bea'], createdBy: 'alice' })
      await setDoc(doc(db, `${CHAT}/messages/m1`), { authorUid: 'bob', text: 'hi', status: 'published', createdAt: new Date() })
    }),
  )

  it('only verified members can open or list a chat', async () => {
    await assertSucceeds(getDoc(doc(bob(), CHAT)))
    await assertSucceeds(getDocs(query(collection(bob(), 'chats'), where('uids', 'array-contains', 'bob'))))
    await assertFails(getDoc(doc(carl(), CHAT)))
    await assertFails(getDoc(doc(una(), CHAT)))
    await assertSucceeds(getDoc(doc(bob(), `${CHAT}/messages/m1`)))
    await assertFails(getDoc(doc(carl(), `${CHAT}/messages/m1`)))
    await assertSucceeds(getDocs(query(collection(alice(), `${CHAT}/messages`), where('status', '==', 'published'))))
  })

  it('chats are created by the function, never by clients', async () => {
    await assertFails(setDoc(doc(alice(), 'chats/c2'), { name: 'Mine', uids: ['alice', 'bob'], createdBy: 'alice' }))
    await assertFails(deleteDoc(doc(alice(), CHAT)))
  })

  it('members write pending notes as themselves; others cannot', async () => {
    await assertSucceeds(setDoc(doc(collection(alice(), `${CHAT}/messages`)), pending('alice', { text: 'hello' })))
    await assertFails(setDoc(doc(collection(alice(), `${CHAT}/messages`)), { ...pending('alice', { text: 'x' }), status: 'published' }))
    await assertFails(setDoc(doc(collection(alice(), `${CHAT}/messages`)), pending('bob', { text: 'x' })))
    await assertFails(setDoc(doc(collection(carl(), `${CHAT}/messages`)), pending('carl', { text: 'x' })))
    await assertFails(setDoc(doc(collection(una(), `${CHAT}/messages`)), pending('una', { text: 'x' })))
    await assertFails(setDoc(doc(collection(banned(), `${CHAT}/messages`)), pending('bea', { text: 'x' })))
  })

  it('a member can leave, but cannot remove or add anyone else', async () => {
    await assertFails(updateDoc(doc(alice(), CHAT), { uids: ['alice', 'una', 'bea'] }))
    await assertFails(updateDoc(doc(alice(), CHAT), { uids: ['alice', 'bob', 'una', 'bea', 'carl'] }))
    await assertFails(updateDoc(doc(alice(), CHAT), { name: 'Renamed' }))
    await assertSucceeds(updateDoc(doc(bob(), CHAT), { uids: arrayRemove('bob') }))
    await assertFails(getDoc(doc(bob(), `${CHAT}/messages/m1`)))
  })

  it('chat notes can be reported', async () => {
    const report = { reporterUid: 'alice', contentPath: `${CHAT}/messages/m1`, reason: 'harassment', createdAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(collection(alice(), 'reports')), report))
  })
})

describe('mentions and notifications', () => {
  const CHAT = 'chats/c1'
  const eleven = Array.from({ length: 11 }, (_, i) => `u${i}`)

  beforeEach(() =>
    seed(async (db) => {
      await setDoc(doc(db, CHAT), { name: 'Tuesday soup', uids: ['alice', 'bob'], createdBy: 'alice' })
      await setDoc(doc(db, 'connections/alice_bob'), { uids: ['alice', 'bob'], requester: 'alice', recipient: 'bob', status: 'accepted' })
      await setDoc(doc(db, 'users/bob/notices/n1'), { type: 'mention', contentPath: `${GROUP}/posts/pub`, actorUid: 'alice', seen: false, createdAt: new Date() })
    }),
  )

  it('new posts, comments, group talk and chat notes may carry up to ten picked people', async () => {
    await assertSucceeds(setDoc(doc(collection(alice(), `${GROUP}/posts`)), pending('alice', { body: 'hi @bob', mentions: ['bob'] })))
    await assertSucceeds(setDoc(doc(collection(alice(), `${GROUP}/posts/pub/comments`)), pending('alice', { text: 'hi @bob', mentions: ['bob'] })))
    await assertSucceeds(setDoc(doc(collection(alice(), `${GROUP}/messages`)), pending('alice', { text: 'hi @bob', mentions: ['bob'] })))
    await assertSucceeds(setDoc(doc(collection(alice(), `${CHAT}/messages`)), pending('alice', { text: 'hi @bob', mentions: ['bob'] })))
    await assertSucceeds(setDoc(doc(collection(alice(), `${GROUP}/messages`)), pending('alice', { text: 'hi', mentions: eleven.slice(0, 10) })))
  })

  it('refuses more than ten, an empty or non-list value, and mentions in one-to-one notes', async () => {
    const talk = (db: Firestore) => doc(collection(db, `${GROUP}/messages`))
    await assertFails(setDoc(talk(alice()), pending('alice', { text: 'hi', mentions: eleven })))
    await assertFails(setDoc(talk(alice()), pending('alice', { text: 'hi', mentions: [] })))
    await assertFails(setDoc(talk(alice()), pending('alice', { text: 'hi', mentions: 'bob' })))
    await assertFails(setDoc(doc(collection(alice(), 'dms/alice_bob/messages')), pending('alice', { text: 'hi', mentions: ['bob'] })))
  })

  it('clients never attach the checked list of who was pinged', async () => {
    await assertFails(
      setDoc(doc(collection(alice(), `${GROUP}/messages`)), pending('alice', { text: 'hi @bob', mentioned: [{ uid: 'bob', penName: 'bob' }] })),
    )
  })

  it('a notification can always ask for its words as published at their time, even once they are withdrawn', async () => {
    const at = new Date('2026-10-10T12:00:00Z')
    await seed((db) => setDoc(doc(db, `${GROUP}/messages/gone`), { authorUid: 'alice', text: '@bob', status: 'withdrawn', createdAt: at }))
    const published = (db: Firestore) =>
      getDocs(query(collection(db, `${GROUP}/messages`), where('status', '==', 'published'), where('createdAt', '==', at)))
    await assertSucceeds(published(bob()))
    // Reading the document is refused, and so is a query pinned to its id: the page opens neither
    await assertFails(getDoc(doc(bob(), `${GROUP}/messages/gone`)))
  })

  it('only the owner reads their notifications, and can only mark them read', async () => {
    await assertSucceeds(getDoc(doc(bob(), 'users/bob/notices/n1')))
    await assertFails(getDoc(doc(alice(), 'users/bob/notices/n1')))
    await assertFails(updateDoc(doc(bob(), 'users/bob/notices/n1'), { seen: false, type: 'comment' }))
    await assertSucceeds(updateDoc(doc(bob(), 'users/bob/notices/n1'), { seen: true }))
  })

  it('nobody can write a notification into someone’s list, or remove one', async () => {
    const forged = { type: 'mention', contentPath: `${GROUP}/posts/pub`, actorUid: 'alice', seen: false, createdAt: serverTimestamp() }
    await assertFails(setDoc(doc(alice(), 'users/bob/notices/n2'), forged))
    await assertFails(setDoc(doc(bob(), 'users/bob/notices/n2'), forged))
    await assertFails(deleteDoc(doc(bob(), 'users/bob/notices/n1')))
  })
})

describe('reports, queue, and bans', () => {
  it('anyone signed in can report a valid path; only admins read reports', async () => {
    const report = { reporterUid: 'alice', contentPath: `${GROUP}/posts/pub`, reason: 'harassment', createdAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(collection(alice(), 'reports')), report))
    await assertFails(setDoc(doc(collection(alice(), 'reports')), { ...report, contentPath: 'bans/bea' }))
    await assertFails(getDocs(collection(alice(), 'reports')))
    await assertSucceeds(getDocs(collection(admin(), 'reports')))
  })

  it('the review queue and bans are admin-only, and nobody writes them', async () => {
    await assertFails(getDocs(collection(alice(), 'modQueue')))
    await assertSucceeds(getDocs(collection(admin(), 'modQueue')))
    await assertFails(setDoc(doc(admin(), 'bans/bob'), { uid: 'bob' }))
  })

  it('a banned person cannot write even with a valid token', async () => {
    await assertFails(setDoc(doc(banned(), `${GROUP}/members/bea`), { uid: 'bea', joinedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(collection(banned(), 'reports')), {
      reporterUid: 'bea', contentPath: `${GROUP}/posts/pub`, reason: 'other', createdAt: serverTimestamp(),
    }))
  })
})

describe('professional applications', () => {
  const application = {
    uid: 'alice',
    status: 'submitted',
    legalName: 'Alice Example',
    licenseType: 'counselor',
    licenseRegion: 'Oregon, US',
    licenseNumber: 'C-1234',
    files: ['doc-1'],
    submittedAt: serverTimestamp(),
  }

  it('verified owners apply; nobody can self-approve', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'proApplications/alice'), application))
    await assertFails(updateDoc(doc(alice(), 'proApplications/alice'), { status: 'approved' }))
    await assertFails(setDoc(doc(una(), 'proApplications/una'), { ...application, uid: 'una' }))
  })

  it('applications are readable by the owner and admins only', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'proApplications/alice'), application))
    await assertSucceeds(getDoc(doc(alice(), 'proApplications/alice')))
    await assertSucceeds(getDoc(doc(admin(), 'proApplications/alice')))
    await assertFails(getDoc(doc(bob(), 'proApplications/alice')))
  })
})

describe('calls (local backend)', () => {
  const AUTH_TIME = 1_800_000_000
  const caller = (uid: string) => as(uid, { email_verified: true, auth_time: AUTH_TIME })
  const call = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    name: 'saveProfile',
    data: { penName: 'Quiet Heron' },
    authTime: AUTH_TIME,
    state: 'new',
    createdAt: serverTimestamp(),
    ...extra,
  })

  it('a person can ask for a known call as themselves, with their real sign-in time', async () => {
    await assertSucceeds(setDoc(doc(caller('alice'), 'calls/c1'), call('alice')))
  })

  it('refuses calls made in someone else’s name, with a forged sign-in time, an unknown name, or an answer filled in', async () => {
    await assertFails(setDoc(doc(caller('alice'), 'calls/c1'), call('bob')))
    await assertFails(setDoc(doc(caller('alice'), 'calls/c2'), call('alice', { authTime: AUTH_TIME + 3600 })))
    await assertFails(setDoc(doc(caller('alice'), 'calls/c3'), call('alice', { name: 'grantEverything' })))
    await assertFails(setDoc(doc(caller('alice'), 'calls/c4'), call('alice', { state: 'done' })))
    await assertFails(setDoc(doc(caller('alice'), 'calls/c5'), call('alice', { result: { ok: true } })))
    await assertFails(setDoc(doc(collection(env.unauthenticatedContext().firestore() as unknown as Firestore, 'calls')), call('alice')))
  })

  it('only the caller reads or removes their call, and nobody lists or answers calls from the client', async () => {
    await seed((db) => setDoc(doc(db, 'calls/c1'), { ...call('alice'), createdAt: new Date() }))
    await assertSucceeds(getDoc(doc(caller('alice'), 'calls/c1')))
    await assertFails(getDoc(doc(caller('bob'), 'calls/c1')))
    await assertFails(getDoc(doc(admin(), 'calls/c1')))
    await assertFails(getDocs(collection(caller('alice'), 'calls')))
    await assertFails(updateDoc(doc(caller('alice'), 'calls/c1'), { state: 'done' }))
    await assertFails(deleteDoc(doc(caller('bob'), 'calls/c1')))
    await assertSucceeds(deleteDoc(doc(caller('alice'), 'calls/c1')))
  })
})
