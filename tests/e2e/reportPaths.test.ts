/*
 * Reports naming writing Firestore can't name, on the Firestore emulator alone: the built
 * report handler (functions/lib), called as the trigger and the local backend call it. The
 * rules only ask each id in a reported path to be free of '/', so someone can file one naming
 * '__x__' or '..', and reading that throws. Run inside the emulators after npm run functions:build:
 *   firebase emulators:exec --only firestore --project demo-crafting-constellations "vitest run --config vitest.e2e.config.ts tests/e2e/reportPaths.test.ts"
 *
 * Every test files its reports under fresh ids instead of wiping the emulator.
 */
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const admin = initializeApp({ projectId: 'demo-crafting-constellations' }, 'report-paths-admin')
const db = getFirestore(admin)

let handleNewReport: (ref: unknown, report: unknown) => Promise<void>
// The handler's own Firestore: its ref takes the handler's own FieldValue
let handlerDb: { doc: (path: string) => unknown }

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run inside the Firestore emulator (firebase emulators:exec).')
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  handleNewReport = (await import('../../functions/lib/reports.js')).handleNewReport
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  handlerDb = (await import('../../functions/lib/app.js')).db
})

afterAll(() => deleteApp(admin))

const run = Date.now()
let n = 0

// Filed as the rules let anyone signed in file it, and handled once as the trigger handles it
const file = async (contentPath: string) => {
  const ref = await db.collection('reports').add({ reporterUid: `reporter-${run}-${++n}`, contentPath, reason: 'spam', createdAt: FieldValue.serverTimestamp() })
  await handleNewReport(handlerDb.doc(ref.path), (await ref.get()).data())
  return ref
}

describe('reports naming writing Firestore can’t name', () => {
  it('are handled once, queueing nothing, instead of throwing on every retry', async () => {
    // What the handler used to ask for
    await expect(db.doc('users/__x__').get()).rejects.toMatchObject({ code: 3 })

    for (const path of ['users/__x__', 'groups/__x__/posts/y', 'chats/__x__/messages/m', 'dms/__a_b__/messages/m', 'groups/g/posts/p/comments/..', 'groups/./posts/y']) {
      const ref = await file(path)
      expect((await ref.get()).get('handledAt'), path).toBeDefined()
      expect((await db.collection('modQueue').where('contentPath', '==', path).get()).empty, path).toBe(true)
    }
  })

  it('still queues a report on a profile', async () => {
    const uid = `wren-${run}`
    await db.doc(`users/${uid}`).set({ penName: `Wren ${run}`, note: 'A long day.' })
    const ref = await file(`users/${uid}`)
    expect((await ref.get()).get('handledAt')).toBeDefined()
    expect((await db.doc(`modQueue/users~${uid}`).get()).data()).toMatchObject({ kind: 'profile', state: 'open', reports: { count: 1 } })
  })
})
