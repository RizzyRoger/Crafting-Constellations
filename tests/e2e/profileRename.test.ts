/*
 * saveProfile against a moderator's Reset profile, on the Firestore emulator. The
 * handler runs in this process, as the local backend runs it, so the reset can be
 * made to land just before saveProfile's transaction. Needs only Firestore:
 * npm run functions:build, then inside the emulators
 * vitest run --config vitest.e2e.config.ts tests/e2e/profileRename.test.ts
 */
import type { Firestore, Transaction } from 'firebase-admin/firestore'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

interface Callable {
  run: (request: unknown) => Promise<{ ok: boolean; penName?: string }>
}

let db: Firestore
let saveProfile: Callable

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run inside the emulators (Firestore).')
  process.env.GCLOUD_PROJECT ??= 'demo-crafting-constellations'
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  db = (await import('../../functions/lib/app.js')).db
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  saveProfile = (await import('../../functions/lib/profile.js')).saveProfile
})

afterEach(() => {
  vi.restoreAllMocks()
})

const claim = async (lower: string) => (await db.doc(`penNames/${lower}`).get()).data()

let runs = 0

// Someone going by `penName`; their penNames record is their own claim unless given
const person = async (penName: string, record?: Record<string, unknown>) => {
  const uid = `renamer-${++runs}`
  const lower = penName.toLowerCase()
  await db.doc(`users/${uid}`).set({ penName, penNameLower: lower, avatarSeed: uid, pigment: 'graphite', pro: false, banned: false })
  await db.doc(`penNames/${lower}`).set(record ?? { uid })
  return uid
}

const rename = (uid: string, penName: string) => saveProfile.run({ data: { penName }, auth: { uid, token: { uid } }, acceptsStreaming: false })

// What a moderator's Reset profile commits (resetProfile in functions/src/admin.ts)
const reset = async (uid: string, oldLower: string, fresh: string) => {
  const batch = db.batch()
  batch.set(db.doc(`penNames/${oldLower}`), { retired: true })
  batch.set(db.doc(`penNames/${fresh.toLowerCase()}`), { uid })
  batch.update(db.doc(`users/${uid}`), { penName: fresh, penNameLower: fresh.toLowerCase(), note: '' })
  await batch.commit()
}

describe('renaming', () => {
  it('keeps a name a moderator retired while the rename was on its way', async () => {
    const uid = await person('Sharp Kestrel')
    // The reset commits after saveProfile first looked at the profile, before its transaction
    const runTransaction = db.runTransaction.bind(db)
    vi.spyOn(db, 'runTransaction').mockImplementationOnce((async (update: (tx: Transaction) => Promise<unknown>) => {
      await reset(uid, 'sharp kestrel', 'Quiet Moth')
      return runTransaction(update)
    }) as Firestore['runTransaction'])

    await expect(rename(uid, 'Slow River')).resolves.toMatchObject({ ok: true, penName: 'Slow River' })
    expect(await claim('sharp kestrel')).toEqual({ retired: true })
    // The rename leaves the generated name, so that one is free again
    expect(await claim('quiet moth')).toBeUndefined()
    expect(await claim('slow river')).toEqual({ uid })
    expect((await db.doc(`users/${uid}`).get()).get('penNameLower')).toBe('slow river')
  })

  it('frees only a name that is still the person’s own', async () => {
    const retired = await person('Pale Heron', { retired: true })
    await rename(retired, 'Pale Wren')
    expect(await claim('pale heron')).toEqual({ retired: true })

    const elsewhere = await person('Still Lake', { uid: 'someone-else' })
    await rename(elsewhere, 'Still Pond')
    expect(await claim('still lake')).toEqual({ uid: 'someone-else' })
  })
})
