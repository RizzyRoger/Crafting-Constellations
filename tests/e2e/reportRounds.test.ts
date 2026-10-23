/*
 * Rounds of reports end to end, on the Firestore emulator alone: the built report
 * handler and account purge (functions/lib), called as the trigger and deleteAccount
 * call them, with a moderator's Approve written as approveContent writes it, and a
 * watch on when the handler reads every report on the writing. Run inside
 * the emulators after npm run functions:build:
 *   firebase emulators:exec --only firestore --project demo-crafting-constellations "vitest run --config vitest.e2e.config.ts tests/e2e/reportRounds.test.ts"
 *
 * Every test seeds its own people and group under fresh ids instead of wiping the emulator.
 */
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const admin = initializeApp({ projectId: 'demo-crafting-constellations' }, 'report-rounds-admin')
const db = getFirestore(admin)

let handleReport: (report: unknown) => Promise<void>
let purgeAccount: (uid: string) => Promise<unknown>
// The handler's own Firestore, to see when it queries the reports
let handlerDb: { collection: (path: string) => unknown }

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run inside the Firestore emulator (firebase emulators:exec).')
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  handleReport = (await import('../../functions/lib/reports.js')).handleReport
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  purgeAccount = (await import('../../functions/lib/account.js')).purgeAccount
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  handlerDb = (await import('../../functions/lib/app.js')).db
})

afterAll(() => deleteApp(admin))

const run = Date.now()
let n = 0
const fresh = (name: string) => `${name}-${run}-${++n}`

// A published post in a group (or someone's profile), the people in the group who report it,
// and what a moderator does
const setUp = async (names: string[], { profile = false } = {}) => {
  const g = `groups/${fresh('rounds')}`
  const uids = Object.fromEntries(names.map((name) => [name, fresh(name)]))
  await Promise.all(Object.values(uids).map((uid) => db.doc(`${g}/members/${uid}`).set({ uid, joinedAt: new Date() })))
  const path = profile ? `users/${fresh('writer')}` : `${g}/posts/p1`
  await db.doc(path).set(profile ? { penName: 'Wren', note: 'A long day.' } : { authorUid: fresh('writer'), body: 'A long day.', status: 'published', createdAt: new Date() })
  const queued = db.doc(`modQueue/${path.replaceAll('/', '~')}`)

  // One at a time, on the server's clock as the rules set it
  const report = async (...who: string[]) => {
    for (const name of who) {
      const ref = await db.collection('reports').add({ reporterUid: uids[name], contentPath: path, reason: 'harassment', createdAt: FieldValue.serverTimestamp() })
      await handleReport((await ref.get()).data())
    }
  }
  const keep = async () => {
    if (!profile) await db.doc(path).update({ status: 'published' })
    await queued.update({ state: 'resolved', resolution: 'approved', resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  }
  const status = async () => (await db.doc(path).get()).get('status')
  return { uids, queued, report, keep, status }
}

describe('rounds of reports', () => {
  it('never lets the same three hide writing a moderator kept, while three new people still can', async () => {
    const { uids, queued, report, keep, status } = await setUp(['a', 'b', 'c', 'd', 'e', 'f'])
    await report('a', 'b', 'c')
    expect(await status()).toBe('held')
    await keep()

    await report('a', 'b', 'c')
    expect(await status()).toBe('published')
    // Back in the queue for a moderator all the same
    expect((await queued.get()).data()).toMatchObject({ state: 'open', reports: { count: 3, reporterUids: [uids.a, uids.b, uids.c] } })

    await report('d', 'e')
    expect(await status()).toBe('published')
    await report('f')
    expect(await status()).toBe('held')
  })

  it('keeps no uid of someone who reported it and then left, whichever round they reported in', async () => {
    const { uids, queued, report, keep } = await setUp(['a', 'b', 'c', 'd'])
    await report('a', 'b', 'c')
    await keep()
    await report('d')

    await purgeAccount(uids.a)
    await purgeAccount(uids.d)
    const item = (await queued.get()).data()
    expect(item).toMatchObject({ state: 'open', reports: { reporterUids: [] } })
    expect(JSON.stringify(item)).not.toContain(uids.a)
    expect(JSON.stringify(item)).not.toContain(uids.d)
  })

  it('reads every report only when it could hide the writing, not for one person reporting over and over', async () => {
    const queries = vi.spyOn(handlerDb, 'collection')
    const reads = () => queries.mock.calls.filter(([name]) => name === 'reports').length
    try {
      const post = await setUp(['a', 'b', 'c', 'd'])
      await post.report('a', 'b', 'c')
      await post.keep()
      await post.report('a', 'a', 'a', 'a', 'a', 'b', 'b', 'b')
      expect(reads()).toBe(0)
      await post.report('c')
      expect(reads()).toBe(1)
      await post.report('c', 'c', 'd')
      expect(reads()).toBe(2)
      expect(await post.status()).toBe('published')

      // Never for a profile, which a report never hides
      const profile = await setUp(['a', 'b', 'c', 'd'], { profile: true })
      await profile.report('a', 'b', 'c')
      await profile.keep()
      await profile.report('a', 'b', 'c', 'd', 'd', 'd')
      expect(reads()).toBe(2)
      expect((await profile.queued.get()).get('reports.count')).toBe(4)
    } finally {
      queries.mockRestore()
    }
  })
})
