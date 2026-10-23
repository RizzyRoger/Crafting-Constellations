/*
 * The local backend (functions/src/local-backend.ts) when something around it goes away: it is
 * stopped partway through a call (a restart, a reboot), Auth fails to answer, or there's no
 * Storage (as on the NUC). On the Auth and Firestore emulators, with the backend in this process.
 * Run with `npm run test:local-backend`.
 *
 * Calls are written straight to calls/{id} (the rules are localBackend.test.ts's business), for
 * people under fresh ids, so nothing here meets another file's people.
 */
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = 'demo-crafting-constellations'

const admin = initializeApp({ projectId: PROJECT_ID }, 'local-backend-outages-admin')
const adminDb = getFirestore(admin)
const adminAuth = getAuth(admin)

type Backend = { stop: (waitMs?: number) => Promise<void> }
let startLocalBackend: () => Promise<Backend>
let backend: Backend
// The backend's own modules, loaded once it has set up its environment
let callables: Record<string, { run: (request: unknown) => Promise<unknown> }>
let backendAuth: { getUser: (uid: string) => Promise<unknown> }
let backendStorage: { app: { options: { storageBucket?: string } } }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const eventually = async (check: () => Promise<boolean>, what: string) => {
  for (let i = 0; i < 60; i++) {
    if (await check()) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

// Settles without an unhandled rejection, so a test can look at it at any time
const watch = (promise: Promise<unknown>) => {
  const seen = { settled: false }
  void promise.finally(() => (seen.settled = true)).catch(() => undefined)
  return seen
}

const run = Date.now()
let n = 0
const person = async () => {
  const uid = `outage-${run}-${++n}`
  await adminAuth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true })
  return uid
}

// A call as the site writes it
const call = async (uid: string, name: string, data: Record<string, unknown>) => {
  const ref = adminDb.collection('calls').doc()
  await ref.set({ uid, name, data, authTime: Math.floor(Date.now() / 1000), state: 'new', createdAt: FieldValue.serverTimestamp() })
  return ref
}

const answered = async (ref: DocumentReference) => {
  await eventually(async () => !['new', 'running'].includes((await ref.get()).get('state')), 'an answer to the call')
  return (await ref.get()).data()
}

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Run with npm run test:local-backend (inside the emulators).')
  }
  // What emulators:exec hands every script it runs: a Storage bucket, with no Storage emulator behind it
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` })
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  startLocalBackend = (await import('../../functions/lib/local-backend.js')).startLocalBackend
  backend = await startLocalBackend()
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  callables = await import('../../functions/lib/index.js')
  // @ts-expect-error built JS from the functions package (npm run functions:build)
  const app = await import('../../functions/lib/app.js')
  backendAuth = app.auth
  backendStorage = app.storage
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await backend?.stop()
  await deleteApp(admin)
})

describe('stopping', () => {
  // Each case stops the backend: a new one starts after it even when the case fails partway (or
  // times out), so the cases after it still have a backend to answer them
  afterEach(async () => {
    // Stops listening at once, if the case didn't get as far as stopping it
    void backend.stop(0)
    // Before the new backend can take up a call the case left behind
    vi.restoreAllMocks()
    backend = await startLocalBackend()
  })

  it('finishes a call under way before it stops, so a restart leaves nothing half done', async () => {
    const uid = await person()
    let finish = () => {}
    const slow = vi.spyOn(callables.saveProfile, 'run').mockImplementation(() => new Promise((resolve) => (finish = () => resolve({ ok: true }))))
    const ref = await call(uid, 'saveProfile', { note: 'Back soon.' })
    await eventually(async () => slow.mock.calls.length === 1, 'the call to start')

    const stopped = watch(backend.stop())
    await sleep(1000)
    expect(stopped.settled).toBe(false)
    finish()
    await eventually(async () => stopped.settled, 'the backend to stop')
    expect((await ref.get()).data()).toMatchObject({ state: 'done', result: { ok: true } })
  })

  it('answers a call it can’t finish in time as interrupted, so the site stops waiting', async () => {
    const uid = await person()
    const stuck = vi.spyOn(callables.saveProfile, 'run').mockImplementation(() => new Promise(() => {}))
    const ref = await call(uid, 'saveProfile', { note: 'Back soon.' })
    await eventually(async () => stuck.mock.calls.length === 1, 'the call to start')

    await backend.stop(500)
    expect((await ref.get()).data()).toMatchObject({ state: 'failed', error: { status: 'unavailable' } })
  })
})

describe('Auth', () => {
  it('tells a signed-in caller something went wrong, not to sign in, when Auth fails to answer', async () => {
    const uid = await person()
    vi.spyOn(backendAuth, 'getUser').mockRejectedValueOnce(Object.assign(new Error('getaddrinfo EAI_AGAIN identitytoolkit.googleapis.com'), { code: 'app/network-error' }))
    const ref = await call(uid, 'saveProfile', { note: 'Back soon.' })
    expect(await answered(ref)).toMatchObject({ state: 'failed', error: { status: 'internal' } })
  })

  it('still asks someone Auth has no account for to sign in', async () => {
    const ref = await call(`outage-${run}-nobody`, 'saveProfile', { note: 'Back soon.' })
    expect(await answered(ref)).toMatchObject({ state: 'failed', error: { status: 'unauthenticated' } })
  })
})

describe('Storage', () => {
  it('has no bucket, as on the NUC, though emulators:exec names one, so deleting an account never reaches Cloud Storage', () => {
    expect(backendStorage.app.options.storageBucket).toBeUndefined()
  })
})
