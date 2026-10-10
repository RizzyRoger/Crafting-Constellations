import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, setLogLevel, type Firestore } from 'firebase/firestore'
import { getBytes, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

const storageAs = (uid: string, token: Record<string, unknown> = { email_verified: true }) =>
  env.authenticatedContext(uid, token).storage() as unknown as FirebaseStorage

const PDF = new TextEncoder().encode('%PDF-1.4 sample')
const upload = (storage: FirebaseStorage, path: string, bytes = PDF, contentType = 'application/pdf') =>
  uploadBytes(ref(storage, path), bytes, { contentType })

beforeAll(async () => {
  setLogLevel('error')
  env = await initializeTestEnvironment({
    projectId: 'demo-crafting-constellations',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearStorage()
  await env.clearFirestore()
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore() as unknown as Firestore, 'bans/bea'), { uid: 'bea' }),
  )
})

describe('professional documents', () => {
  it('a verified owner uploads once', async () => {
    await assertSucceeds(upload(storageAs('alice'), 'proDocs/alice/doc-1'))
    await assertFails(upload(storageAs('alice'), 'proDocs/alice/doc-1'))
  })

  it('rejects other owners, unverified, banned, bad names, types and sizes', async () => {
    await assertFails(upload(storageAs('bob'), 'proDocs/alice/doc-2'))
    await assertFails(upload(storageAs('una', { email_verified: false }), 'proDocs/una/doc-1'))
    await assertFails(upload(storageAs('bea'), 'proDocs/bea/doc-1'))
    await assertFails(upload(storageAs('alice'), 'proDocs/alice/doc-6'))
    await assertFails(upload(storageAs('alice'), 'proDocs/alice/doc-2', PDF, 'text/html'))
    await assertFails(upload(storageAs('alice'), 'proDocs/alice/doc-3', new Uint8Array(10 * 1024 * 1024 + 1)))
  })

  // Separate owner: emulator storage is not reliably cleared between tests
  it('only the owner and admins can read', async () => {
    await assertSucceeds(upload(storageAs('dora'), 'proDocs/dora/doc-1'))
    await assertSucceeds(getBytes(ref(storageAs('dora'), 'proDocs/dora/doc-1')))
    await assertSucceeds(getBytes(ref(storageAs('mia', { email_verified: true, admin: true }), 'proDocs/dora/doc-1')))
    await assertFails(getBytes(ref(storageAs('bob'), 'proDocs/dora/doc-1')))
  })
})
