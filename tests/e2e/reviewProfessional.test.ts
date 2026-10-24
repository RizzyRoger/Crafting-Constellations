/*
 * reviewProfessional end to end: the real function on the emulators. Also a moderator's
 * own case in the review queue, which another moderator decides, as with a licence.
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
const reviewProfessional = httpsCallable<{ uid: string; decision: 'approve' | 'deny' | 'revoke'; note?: string }, { ok: true; outcome?: string }>(
  functions,
  'reviewProfessional',
)
const approveContent = httpsCallable<{ queueId: string }, { ok: true; outcome: string }>(functions, 'approveContent')
const removeContent = httpsCallable<{ queueId: string; note?: string }, { ok: true; outcome: string }>(functions, 'removeContent')

const exists = async (path: string) => (await db.doc(path).get()).exists
const field = async (path: string, name: string) => (await db.doc(path).get()).get(name)
const claims = async (uid: string) => (await adminAuth.getUser(uid)).customClaims ?? {}
const queueId = (path: string) => path.replaceAll('/', '~')
const notices = async (uid: string) => (await db.collection(`users/${uid}/notices`).get()).docs.map((d) => d.get('type'))

const refusalOf = async (attempt: Promise<unknown>) => {
  const error = await attempt.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(FirebaseError)
  const { code, details } = error as FirebaseError & { details?: { problem?: string } }
  return { code, problem: details?.problem }
}

const codeOf = async (attempt: Promise<unknown>) => (await refusalOf(attempt)).code

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

// Someone's licence application, waiting for a moderator
const applied = (uid: string) => db.doc(`proApplications/${uid}`).set({ uid, status: 'submitted', legalName: 'Test Person', files: ['doc-1'], submittedAt: new Date() })

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

  // Account deletion takes the profile first and the application last, so for a while there is an
  // application, an account and no profile
  it('decides nothing for someone whose account is being deleted, and makes them no profile', async () => {
    const n = await asModerator()
    const leaving = `leaving-applicant-${n}`
    await person(leaving, { profile: false })
    await applied(leaving)

    expect(await codeOf(reviewProfessional({ uid: leaving, decision: 'approve' }))).toBe('functions/not-found')
    expect(await codeOf(reviewProfessional({ uid: leaving, decision: 'deny' }))).toBe('functions/not-found')
    expect(await exists(`users/${leaving}`)).toBe(false)
    expect(await notices(leaving)).toEqual([])
    expect(await claims(leaving)).not.toHaveProperty('pro')
    expect(await field(`proApplications/${leaving}`, 'status')).toBe('submitted')
  })

  it('takes the mark from a profile its account outlived', async () => {
    const n = await asModerator()
    const gone = `gone-pro-${n}`
    await db.doc(`users/${gone}`).set({ pro: true, proSince: new Date(), updatedAt: new Date() })

    await expect(reviewProfessional({ uid: gone, decision: 'revoke' })).resolves.toMatchObject({ data: { ok: true } })
    expect(await field(`users/${gone}`, 'pro')).toBe(false)
  })
})

describe('a decision made twice', () => {
  it('approves once: a deny pressed after it on a stale row changes nothing', async () => {
    const n = await asModerator()
    const applicant = `twice-applicant-${n}`
    await person(applicant)
    await applied(applicant)

    await expect(reviewProfessional({ uid: applicant, decision: 'approve' })).resolves.toMatchObject({ data: { ok: true } })
    const reviewedAt = await field(`proApplications/${applicant}`, 'reviewedAt')
    await expect(reviewProfessional({ uid: applicant, decision: 'deny', note: 'Too late' })).resolves.toMatchObject({ data: { ok: true, outcome: 'already-resolved' } })

    expect(await field(`proApplications/${applicant}`, 'status')).toBe('approved')
    expect(await field(`proApplications/${applicant}`, 'reviewedAt')).toEqual(reviewedAt)
    expect(await field(`users/${applicant}`, 'pro')).toBe(true)
    expect(await claims(applicant)).toMatchObject({ pro: true })
    expect(await notices(applicant)).toEqual(['proApproved'])
  })

  it('decides once when two moderators press at the same moment, and everything agrees', async () => {
    const n = await asModerator()
    const applicant = `race-applicant-${n}`
    await person(applicant)
    await applied(applicant)

    const answers = await Promise.all([
      reviewProfessional({ uid: applicant, decision: 'approve' }),
      reviewProfessional({ uid: applicant, decision: 'deny' }),
    ])
    const outcomes = answers.map((answer) => answer.data.outcome)
    expect(outcomes.filter((outcome) => outcome === 'already-resolved')).toHaveLength(1)

    const pro = outcomes[0] === undefined
    expect(await field(`proApplications/${applicant}`, 'status')).toBe(pro ? 'approved' : 'denied')
    expect(await field(`users/${applicant}`, 'pro')).toBe(pro)
    expect((await claims(applicant)).pro).toBe(pro)
    expect(await notices(applicant)).toEqual([pro ? 'proApproved' : 'proDenied'])
  })

  it('revokes once, and leaves the reapplication round where the first revoke put it', async () => {
    const n = await asModerator()
    const pro = `revoked-twice-${n}`
    await person(pro, { claims: { pro: true }, profile: { pro: true } })
    await db.doc(`proApplications/${pro}`).set({ uid: pro, status: 'approved', legalName: 'Test Person', files: ['doc-1'] })

    await expect(reviewProfessional({ uid: pro, decision: 'revoke' })).resolves.toMatchObject({ data: { ok: true } })
    const reviewedAt = await field(`proApplications/${pro}`, 'reviewedAt')
    await expect(reviewProfessional({ uid: pro, decision: 'revoke' })).resolves.toMatchObject({ data: { ok: true, outcome: 'already-resolved' } })
    expect(await field(`proApplications/${pro}`, 'reviewedAt')).toEqual(reviewedAt)
    expect(await field(`users/${pro}`, 'pro')).toBe(false)
  })
})

describe('a moderator’s own case', () => {
  const self = { code: 'functions/permission-denied', problem: 'self' }

  it('leaves their own licence application to another moderator', async () => {
    const n = await asModerator()
    const mod = `review-mod-${n}`
    await applied(mod)

    expect(await refusalOf(reviewProfessional({ uid: mod, decision: 'approve' }))).toEqual(self)
    expect(await refusalOf(reviewProfessional({ uid: mod, decision: 'deny' }))).toEqual(self)
    expect(await field(`proApplications/${mod}`, 'status')).toBe('submitted')
    expect(await field(`users/${mod}`, 'pro')).toBe(false)
    expect(await notices(mod)).toEqual([])

    // Another moderator can
    await asModerator()
    await expect(reviewProfessional({ uid: mod, decision: 'approve' })).resolves.toMatchObject({ data: { ok: true } })
    expect(await field(`users/${mod}`, 'pro')).toBe(true)
    expect(await claims(mod)).toMatchObject({ admin: true, pro: true })
  })

  it('still lets them take their own mark away', async () => {
    const n = await asModerator()
    const mod = `review-mod-${n}`
    await adminAuth.setCustomUserClaims(mod, { admin: true, pro: true })
    await db.doc(`users/${mod}`).update({ pro: true })

    await expect(reviewProfessional({ uid: mod, decision: 'revoke' })).resolves.toMatchObject({ data: { ok: true } })
    expect(await field(`users/${mod}`, 'pro')).toBe(false)
    expect(await claims(mod)).toMatchObject({ admin: true, pro: false })
  })

  // A moderator's post that three people reported, hidden for review; and their profile, reported
  const reportedModerator = async () => {
    const n = await asModerator()
    const mod = `review-mod-${n}`
    const g = `groups/own-${n}`
    const post = `${g}/posts/p`
    await db.doc(g).set({ name: 'Evening sheet', memberCount: 0 })
    await db.doc(post).set({ authorUid: mod, body: 'Call me any time.', status: 'held', heldReason: 'review', createdAt: new Date(), publishedAt: new Date() })
    const reports = { count: 3, reporterUids: [`r1-${n}`, `r2-${n}`, `r3-${n}`], reasons: ['other'] }
    await db.doc(`modQueue/${queueId(post)}`).set({ contentPath: post, kind: 'post', groupId: `own-${n}`, authorUid: mod, reports, state: 'open' })
    await db.doc(`modQueue/${queueId(`users/${mod}`)}`).set({ contentPath: `users/${mod}`, kind: 'profile', authorUid: mod, authorPenName: mod, reports, state: 'open' })
    return { mod, post }
  }

  it('leaves their own reported writing and profile to another moderator, open and as it is', async () => {
    const { mod, post } = await reportedModerator()

    for (const path of [post, `users/${mod}`]) {
      expect(await refusalOf(approveContent({ queueId: queueId(path) })), path).toEqual(self)
      expect(await refusalOf(removeContent({ queueId: queueId(path) })), path).toEqual(self)
      expect(await field(`modQueue/${queueId(path)}`, 'state'), path).toBe('open')
    }
    expect(await field(post, 'status')).toBe('held')
    expect(await field(`users/${mod}`, 'penName')).toBe(mod)
    expect(await notices(mod)).toEqual([])

    // Another moderator decides both
    await asModerator()
    await expect(approveContent({ queueId: queueId(post) })).resolves.toMatchObject({ data: { ok: true, outcome: 'restored' } })
    expect(await field(post, 'status')).toBe('published')
    await expect(approveContent({ queueId: queueId(`users/${mod}`) })).resolves.toMatchObject({ data: { ok: true, outcome: 'kept' } })
  })
})

describe('Revoke mark', () => {
  // The name and mark the triggers put on writing as it goes out, and on the notices it causes
  const signed = (uid: string, pro: boolean) => ({ penName: uid, avatarSeed: uid, pigment: 'graphite', pro })
  const written = (authorUid: string, pro: boolean, extra: Record<string, unknown>) => ({
    authorUid,
    status: 'published',
    createdAt: new Date(),
    author: signed(authorUid, pro),
    ...extra,
  })

  // A marked pro's writing everywhere it goes, one reply of theirs held for review, a notice they
  // caused; and another pro's post and notice beside them
  const marked = async () => {
    const n = await asModerator()
    const pro = `marked-pro-${n}`
    const reader = `marked-reader-${n}`
    const other = `other-pro-${n}`
    await person(pro, { claims: { pro: true }, profile: { pro: true } })
    await person(reader)
    await person(other, { claims: { pro: true }, profile: { pro: true } })

    const g = `groups/revoke-${n}`
    const chat = `chats/revoke-${n}`
    await db.doc(g).set({ name: 'Evening sheet', memberCount: 0 })
    await Promise.all([pro, reader, other].map((uid) => db.doc(`${g}/members/${uid}`).set({ uid, joinedAt: new Date() })))
    await db.doc(chat).set({ name: 'Soup rota', uids: [pro, reader], createdBy: pro, createdAt: new Date(), lastMessageAt: new Date() })

    await db.doc(`${g}/posts/rp`).set(written(reader, false, { body: 'Long week.', likeCount: 0, commentCount: 0 }))
    const theirs = [`${g}/posts/pp`, `${g}/posts/rp/comments/pc`, `${g}/messages/pm`, `${chat}/messages/pm`]
    await Promise.all(theirs.map((path) => db.doc(path).set(written(pro, true, { text: 'Rest when you can.' }))))
    const held = `${g}/posts/rp/comments/held`
    await db.doc(held).set({ ...written(pro, true, { text: 'Try the night line.' }), status: 'held', heldReason: 'review' })
    await db.doc(`modQueue/${queueId(held)}`).set({ contentPath: held, kind: 'comment', groupId: `revoke-${n}`, authorUid: pro, state: 'open' })
    await db.doc(`users/${reader}/notices/from-pro`).set({ type: 'mention', contentPath: `${g}/messages/pm`, actorUid: pro, actor: signed(pro, true), seen: false, createdAt: new Date() })

    await db.doc(`${g}/posts/op`).set(written(other, true, { body: 'Ask me anything.' }))
    await db.doc(`users/${reader}/notices/from-other`).set({ type: 'comment', contentPath: `${g}/posts/rp/comments/oc`, actorUid: other, actor: signed(other, true), seen: false, createdAt: new Date() })
    return { pro, reader, other, g, theirs, held }
  }

  it('takes the mark off everything they wrote and every notice they caused', async () => {
    const w = await marked()
    await expect(reviewProfessional({ uid: w.pro, decision: 'revoke' })).resolves.toMatchObject({ data: { ok: true } })

    for (const path of [...w.theirs, w.held]) expect(await field(path, 'author'), path).toEqual(signed(w.pro, false))
    expect(await field(`users/${w.reader}/notices/from-pro`, 'actor')).toEqual(signed(w.pro, false))
    // Nobody else's mark moves
    expect(await field(`${w.g}/posts/op`, 'author.pro')).toBe(true)
    expect(await field(`users/${w.reader}/notices/from-other`, 'actor.pro')).toBe(true)
  })

  it('lets writing held before the revoke go out without the mark, and its notices too', async () => {
    const w = await marked()
    await expect(reviewProfessional({ uid: w.pro, decision: 'revoke' })).resolves.toMatchObject({ data: { ok: true } })

    await expect(approveContent({ queueId: queueId(w.held) })).resolves.toMatchObject({ data: { ok: true, outcome: 'published' } })
    expect(await field(w.held, 'status')).toBe('published')
    expect(await field(w.held, 'author.pro')).toBe(false)
    // The reply pings the post's writer, under the name and mark they show now
    expect(await field(`users/${w.reader}/notices/comment~${queueId(w.held)}`, 'actor')).toEqual(signed(w.pro, false))
  })
})
