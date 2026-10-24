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
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  type Firestore,
  type Query,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { findById, mineFrom, publishedFrom } from '../../src/lib/lookup'

// The reads Thread, Chat and PostPage make to open something that may no longer be
// theirs to read. Getting its document is refused then (a refused listen breaks the
// Firestore client, tasks/lessons.md); each of these must be allowed, and leave it out.

const PROJECT_ID = 'demo-crafting-constellations'
const GROUP = 'groups/g1'
const POSTS = `${GROUP}/posts`
const CHAT = 'chats/c1'

let env: RulesTestEnvironment

const as = (uid: string) => env.authenticatedContext(uid, { email_verified: true }).firestore() as unknown as Firestore
const alice = () => as('alice')
const bob = () => as('bob')
const carl = () => as('carl')

const seed = (write: (db: Firestore) => Promise<unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await write(ctx.firestore() as unknown as Firestore)
  })

const ids = async (q: Query) => (await assertSucceeds(getDocs(q))).docs.map((d) => ({ id: d.id }))

// As the pages ask them
const myConnections = (db: Firestore, me: string) => query(collection(db, 'connections'), where('uids', 'array-contains', me))
const myChats = (db: Firestore, me: string) => query(collection(db, 'chats'), where('uids', 'array-contains', me))

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
    for (const uid of ['alice', 'bob', 'carl']) await setDoc(doc(db, 'users', uid), { penName: uid, pro: false, banned: false })
    await setDoc(doc(db, GROUP), { name: 'Evening sheet', memberCount: 2 })
    for (const uid of ['alice', 'bob']) await setDoc(doc(db, `${GROUP}/members/${uid}`), { uid, joinedAt: new Date() })
    // 'gone' and 'removed' sort before 'shown', so asking from them finds 'shown' instead
    await setDoc(doc(db, `${POSTS}/gone`), { authorUid: 'alice', body: '@bob', status: 'withdrawn', createdAt: new Date() })
    await setDoc(doc(db, `${POSTS}/removed`), { authorUid: 'alice', body: '@bob', status: 'removed', createdAt: new Date() })
    await setDoc(doc(db, `${POSTS}/shown`), { authorUid: 'alice', body: 'hello @bob', status: 'published', createdAt: new Date() })
    await setDoc(doc(db, `${POSTS}/pend`), { authorUid: 'bob', body: 'checking', status: 'pending', createdAt: new Date() })
    await setDoc(doc(db, CHAT), { name: 'Tuesday soup', uids: ['alice', 'bob'], createdBy: 'alice' })
  })
})

describe('a private thread whose connection is gone (disconnect, unblock)', () => {
  it('refuses the connection document, and lists my connections without it', async () => {
    await assertFails(getDoc(doc(alice(), 'connections/alice_bob')))
    expect(findById(await ids(myConnections(alice(), 'alice')), 'alice_bob')).toBeNull()
  })

  it('finds it while it lasts, accepted or blocked, and never shows it to anyone else', async () => {
    await seed((db) => setDoc(doc(db, 'connections/alice_bob'), { uids: ['alice', 'bob'], requester: 'alice', recipient: 'bob', status: 'blocked', blockedBy: 'bob' }))
    expect(findById(await ids(myConnections(alice(), 'alice')), 'alice_bob')).not.toBeNull()
    expect(findById(await ids(myConnections(carl(), 'carl')), 'alice_bob')).toBeNull()
  })
})

describe('a private chat I left', () => {
  it('refuses the chat document, and lists my chats without it', async () => {
    expect(findById(await ids(myChats(bob(), 'bob')), 'c1')).not.toBeNull()
    await assertSucceeds(updateDoc(doc(bob(), CHAT), { uids: arrayRemove('bob') }))
    await assertFails(getDoc(doc(bob(), CHAT)))
    expect(findById(await ids(myChats(bob(), 'bob')), 'c1')).toBeNull()
  })
})

describe('a post withdrawn or removed since', () => {
  it('refuses the document, and a query pinned to its id', async () => {
    await assertFails(getDoc(doc(bob(), `${POSTS}/gone`)))
    await assertFails(getDoc(doc(bob(), `${POSTS}/removed`)))
    await assertFails(getDocs(query(collection(bob(), POSTS), where(documentId(), '==', 'gone'), where('status', '==', 'published'))))
  })

  it('looks it up from its id without a refusal, and finds the next post instead', async () => {
    for (const id of ['gone', 'removed']) {
      const published = await ids(publishedFrom(bob(), POSTS, id))
      expect(published).toEqual([{ id: 'shown' }])
      expect(findById(published, id)).toBeNull()
      expect(findById(await ids(mineFrom(bob(), POSTS, id, 'bob')), id)).toBeNull()
    }
  })

  it('still finds a published post, and my own at any status', async () => {
    expect(findById(await ids(publishedFrom(bob(), POSTS, 'shown')), 'shown')).not.toBeNull()
    expect(findById(await ids(mineFrom(bob(), POSTS, 'pend', 'bob')), 'pend')).not.toBeNull()
    expect(findById(await ids(mineFrom(alice(), POSTS, 'gone', 'alice')), 'gone')).not.toBeNull()
  })

  it('stays closed to people outside the group', async () => {
    await assertFails(getDocs(publishedFrom(carl(), POSTS, 'shown')))
  })
})
