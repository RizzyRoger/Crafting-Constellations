/*
 * The clear-moderator-ids script (scripts/clear-moderator-ids.ts) against the Firestore emulator.
 * Run inside `firebase emulators:exec --only firestore` (or with the emulators the local backend
 * tests use), naming this file. Every test uses fresh ids.
 */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PROJECT_ID = 'demo-crafting-constellations'
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

const admin = initializeAdminApp({ projectId: PROJECT_ID }, 'clear-moderator-ids-admin')
const db = getAdminFirestore(admin)

// As `npx tsx scripts/clear-moderator-ids.ts …` runs it, on the emulator the tests were given
const clear = async (...args: string[]) =>
  (await promisify(execFile)(`${ROOT}node_modules/.bin/tsx`, ['scripts/clear-moderator-ids.ts', ...args], { cwd: ROOT, env: process.env })).stdout

const data = async (path: string) => (await db.doc(path).get()).data()

let runs = 0

// Writing and applications from before moderators' uids were kept off them, beside some that never had one
const seeded = async () => {
  const n = ++runs
  const g = `groups/clear-${n}`
  const writing = {
    named: `${g}/posts/named`,
    namedComment: `${g}/posts/named/comments/c`,
    namedNote: `dms/clear-a-${n}_clear-b-${n}/messages/m`,
    automod: `${g}/messages/automod`,
    published: `${g}/posts/published`,
  }
  const at = new Date()
  await db.doc(g).set({ name: 'Evening sheet', memberCount: 0 })
  await Promise.all([
    ...[writing.named, writing.namedComment, writing.namedNote].map((path) =>
      db.doc(path).set({ authorUid: `writer-${n}`, text: 'Long night here.', status: 'removed', removedBy: `mod-${n}`, removedAt: at }),
    ),
    db.doc(writing.automod).set({ authorUid: `writer-${n}`, text: 'Long night here.', status: 'removed', removedBy: 'automod', removedAt: at }),
    db.doc(writing.published).set({ authorUid: `writer-${n}`, body: 'A long day.', status: 'published' }),
  ])
  const applications = { decided: `proApplications/decided-${n}`, waiting: `proApplications/waiting-${n}` }
  await db.doc(applications.decided).set({ uid: `decided-${n}`, status: 'denied', legalName: 'Test Person', files: ['doc-1'], reviewedAt: at, reviewedBy: `mod-${n}`, reviewNote: 'Too blurry.' })
  await db.doc(applications.waiting).set({ uid: `waiting-${n}`, status: 'submitted', legalName: 'Test Person', files: ['doc-1'] })
  return { writing, applications }
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run inside the emulators (see the top of this file).')
})

afterAll(async () => {
  await deleteAdminApp(admin)
})

describe('clear-moderator-ids', () => {
  it('says only that a moderator took writing down, takes the name off licence decisions, and leaves the rest', async () => {
    const { writing, applications } = await seeded()
    const before = {
      automod: await data(writing.automod),
      published: await data(writing.published),
      waiting: await data(applications.waiting),
    }

    expect(await clear()).toContain('Cleared.')

    for (const path of [writing.named, writing.namedComment, writing.namedNote]) {
      expect(await data(path), path).toMatchObject({ status: 'removed', removedBy: 'moderator', removedAt: expect.anything() })
    }
    const decided = await data(applications.decided)
    expect(decided).not.toHaveProperty('reviewedBy')
    expect(decided).toMatchObject({ status: 'denied', reviewedAt: expect.anything(), reviewNote: 'Too blurry.' })
    expect(await data(writing.automod)).toEqual(before.automod)
    expect(await data(writing.published)).toEqual(before.published)
    expect(await data(applications.waiting)).toEqual(before.waiting)
  })

  it('changes nothing on a dry run', async () => {
    const { writing, applications } = await seeded()
    const before = await Promise.all([writing.named, applications.decided].map(data))

    expect(await clear('--dry-run')).toMatch(/\d+ removed writing and \d+ licence applications name a moderator/)
    expect(await Promise.all([writing.named, applications.decided].map(data))).toEqual(before)
  })

  it('refuses a real run without a real project named', async () => {
    await expect(clear('--prod')).rejects.toThrow('Pass --project <real-project-id> with --prod.')
  })
})
