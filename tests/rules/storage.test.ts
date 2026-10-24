import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, setLogLevel, Timestamp, type Firestore } from 'firebase/firestore'
import { getBytes, getMetadata, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { reapplyRound } from '../../src/lib/proApplication'

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

const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, path), data))

beforeEach(async () => {
  await env.clearStorage()
  await env.clearFirestore()
  await seed('bans/bea', { uid: 'bea' })
})

// As reviewProfessional leaves it; a server time can carry microseconds
const REVIEWED = new Timestamp(1_729_700_000, 123_456_789)
const ROUND = '1729700000123'
const application = (uid: string, status: string, files: string[], reviewedAt: Timestamp | null = REVIEWED) =>
  seed(`proApplications/${uid}`, {
    uid,
    status,
    legalName: 'Alice Example',
    licenseType: 'counselor',
    licenseRegion: 'Oregon, US',
    licenseNumber: 'C-1234',
    files,
    submittedAt: new Date(),
    ...(reviewedAt ? { reviewedAt, reviewedBy: 'mia', reviewNote: 'The scan is too blurry to read.' } : {}),
  })
const ALL = ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']

describe('professional documents', () => {
  it('a verified owner uploads once there is an application', async () => {
    await application('abe', 'submitted', ['doc-1'], null)
    await assertSucceeds(upload(storageAs('abe'), 'proDocs/abe/doc-2'))
    await assertFails(upload(storageAs('abe'), 'proDocs/abe/doc-2'))
  })

  // Uploads that landed before the application write failed would otherwise use up slots for good
  it('before applying, nobody has seen the documents, so a failed try can be redone', async () => {
    await assertSucceeds(upload(storageAs('fay'), 'proDocs/fay/doc-1'))
    await assertSucceeds(upload(storageAs('fay'), 'proDocs/fay/doc-1'))
    await application('fay', 'submitted', ['doc-1'], null)
    await assertFails(upload(storageAs('fay'), 'proDocs/fay/doc-1'))
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

  // The page looks before it picks slots, so a file left by a failed attempt is skipped, not overwritten
  it('an owner can tell a used slot from a free one; nobody else can look', async () => {
    await assertSucceeds(upload(storageAs('erin'), 'proDocs/erin/doc-1'))
    await assertSucceeds(getMetadata(ref(storageAs('erin'), 'proDocs/erin/doc-1')))
    await expect(getMetadata(ref(storageAs('erin'), 'proDocs/erin/doc-2'))).rejects.toMatchObject({ code: 'storage/object-not-found' })
    await assertFails(getMetadata(ref(storageAs('bob'), 'proDocs/erin/doc-1')))
  })
})

// Five documents in, a turned-down applicant still has to be able to send a corrected licence
describe('a reapplication’s documents', () => {
  it('go in a folder for the decision, which a turned-down or revoked owner can write and rewrite', async () => {
    await assertSucceeds(upload(storageAs('rita'), 'proDocs/rita/doc-1'))
    await application('rita', 'denied', ALL)
    await assertFails(upload(storageAs('rita'), 'proDocs/rita/doc-1'))
    await assertSucceeds(upload(storageAs('rita'), `proDocs/rita/${ROUND}/doc-1`))
    await assertSucceeds(upload(storageAs('rita'), `proDocs/rita/${ROUND}/doc-1`))
    await assertSucceeds(upload(storageAs('rita'), `proDocs/rita/${ROUND}/doc-5`))
    await application('rhea', 'revoked', ['doc-1'])
    await assertSucceeds(upload(storageAs('rhea'), `proDocs/rhea/${ROUND}/doc-1`))
  })

  // The page names the folder, so it has to name it as the rule does, to the millisecond
  it('go in the folder the page names', async () => {
    for (const [uid, nanoseconds] of [['raya', 123_456_789], ['rena', 999_999_999], ['rina', 0]] as const) {
      const reviewedAt = new Timestamp(1_729_700_000, nanoseconds)
      await application(uid, 'denied', ALL, reviewedAt)
      await assertSucceeds(upload(storageAs(uid), `proDocs/${uid}/${reapplyRound({ status: 'denied', reviewedAt })}/doc-1`))
    }
  })

  it('only in the folder for the decision that stands', async () => {
    await application('ruth', 'denied', ALL)
    await assertFails(upload(storageAs('ruth'), 'proDocs/ruth/1729700000124/doc-1'))
    await assertFails(upload(storageAs('ruth'), 'proDocs/ruth/1729700000/doc-1'))
    await assertFails(upload(storageAs('ruth'), 'proDocs/ruth/later/doc-1'))
    await assertFails(upload(storageAs('ruth'), `proDocs/ruth/${ROUND}/x/doc-1`))
    await assertFails(upload(storageAs('ruby'), `proDocs/ruby/${ROUND}/doc-1`))
    for (const status of ['submitted', 'approved']) {
      await application('rose', status, ALL)
      await assertFails(upload(storageAs('rose'), `proDocs/rose/${ROUND}/doc-1`))
    }
  })

  // Sent, they're the moderator's to review, and after the next decision they're its evidence
  it('never once the application lists them', async () => {
    await application('remy', 'submitted', [`${ROUND}/doc-1`], null)
    await assertFails(upload(storageAs('remy'), `proDocs/remy/${ROUND}/doc-1`))
    await assertFails(upload(storageAs('remy'), `proDocs/remy/${ROUND}/doc-2`))
    await application('remy', 'denied', [`${ROUND}/doc-1`], new Timestamp(1_729_800_000, 0))
    await assertFails(upload(storageAs('remy'), `proDocs/remy/${ROUND}/doc-1`))
    await assertSucceeds(upload(storageAs('remy'), 'proDocs/remy/1729800000000/doc-1'))
    await application('reed', 'denied', [`${ROUND}/doc-1`])
    await assertFails(upload(storageAs('reed'), `proDocs/reed/${ROUND}/doc-1`))
    await assertSucceeds(upload(storageAs('reed'), `proDocs/reed/${ROUND}/doc-2`))
  })

  it('are refused to anyone else, and checked like any other document', async () => {
    await application('rory', 'denied', ALL)
    await application('bea', 'denied', ALL)
    await application('una', 'denied', ALL)
    await assertFails(upload(storageAs('bob'), `proDocs/rory/${ROUND}/doc-1`))
    await assertFails(upload(storageAs('bea'), `proDocs/bea/${ROUND}/doc-1`))
    await assertFails(upload(storageAs('una', { email_verified: false }), `proDocs/una/${ROUND}/doc-1`))
    await assertFails(upload(storageAs('rory'), `proDocs/rory/${ROUND}/doc-6`))
    await assertFails(upload(storageAs('rory'), `proDocs/rory/${ROUND}/doc-2`, PDF, 'text/html'))
    await assertFails(upload(storageAs('rory'), `proDocs/rory/${ROUND}/doc-3`, new Uint8Array(10 * 1024 * 1024 + 1)))
  })

  it('are read by the owner and admins only', async () => {
    await application('reva', 'denied', ALL)
    await assertSucceeds(upload(storageAs('reva'), `proDocs/reva/${ROUND}/doc-1`))
    await assertSucceeds(getBytes(ref(storageAs('reva'), `proDocs/reva/${ROUND}/doc-1`)))
    await assertSucceeds(getBytes(ref(storageAs('mia', { email_verified: true, admin: true }), `proDocs/reva/${ROUND}/doc-1`)))
    await assertFails(getBytes(ref(storageAs('bob'), `proDocs/reva/${ROUND}/doc-1`)))
  })
})
