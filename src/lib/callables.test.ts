import { FirebaseError } from 'firebase/app'
import { StorageError, StorageErrorCode } from 'firebase/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stand-ins for Firebase: the calls/{id} listener is driven by hand, the clock by fake timers
const fake = vi.hoisted(() => ({
  localBackend: true,
  answer: (_call: Record<string, unknown> | undefined) => {},
}))

vi.mock('./firebase', () => ({
  auth: { currentUser: { uid: 'u1', getIdTokenResult: async () => ({ claims: { auth_time: '100' } }) } },
  db: {},
  functions: {},
  get LOCAL_BACKEND() {
    return fake.localBackend
  },
}))

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({ id: 'call1' }),
  serverTimestamp: () => 'now',
  setDoc: async () => undefined,
  deleteDoc: async () => undefined,
  onSnapshot: (_ref: unknown, next: (snap: { data: () => unknown }) => void) => {
    fake.answer = (call) => next({ data: () => call })
    return () => {
      fake.answer = () => {}
    }
  },
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => async () => ({ data: { ok: true } })),
}))

// LOCAL_BACKEND is read when the module loads, so each case loads it afresh
const load = async (localBackend: boolean) => {
  vi.resetModules()
  fake.localBackend = localBackend
  return import('./callables')
}

// Settles without an unhandled rejection, so a test can look at it at any time
const watch = <T>(promise: Promise<T>) => {
  const seen: { value?: T; error?: unknown; settled: boolean } = { settled: false }
  void promise.then(
    (value) => Object.assign(seen, { value, settled: true }),
    (error: unknown) => Object.assign(seen, { error, settled: true }),
  )
  return seen
}

describe('calls through the local backend', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for a long deletion the backend has started, past the 25s it allows for pickup', async () => {
    const { deleteAccount } = await load(true)
    const seen = watch(deleteAccount({ confirm: 'Wren' }))
    await vi.advanceTimersByTimeAsync(1_000)
    fake.answer({ state: 'running' })
    await vi.advanceTimersByTimeAsync(39_000)
    expect(seen.settled).toBe(false)
    fake.answer({ state: 'done', result: { ok: true } })
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual({ value: { ok: true }, settled: true })
  })

  it('still gives up after 25s when the backend never picks the call up', async () => {
    const { deleteAccount } = await load(true)
    const seen = watch(deleteAccount({ confirm: 'Wren' }))
    await vi.advanceTimersByTimeAsync(24_000)
    expect(seen.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect((seen.error as FirebaseError).code).toBe('functions/deadline-exceeded')
  })

  it('gives up on a started call only once it has run as long as the server allows', async () => {
    const { saveProfile } = await load(true)
    const seen = watch(saveProfile({ note: 'hi' }))
    await vi.advanceTimersByTimeAsync(20_000)
    fake.answer({ state: 'running' })
    await vi.advanceTimersByTimeAsync(299_000)
    expect(seen.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect((seen.error as FirebaseError).code).toBe('functions/deadline-exceeded')
  })

  it('passes on the error the backend wrote', async () => {
    const { deleteAccount, problemOf } = await load(true)
    const seen = watch(deleteAccount({ confirm: 'Wren' }))
    await vi.advanceTimersByTimeAsync(1_000)
    fake.answer({ state: 'running' })
    fake.answer({ state: 'failed', error: { status: 'invalid-argument', message: 'confirm', details: { problem: 'confirm' } } })
    await vi.advanceTimersByTimeAsync(0)
    expect((seen.error as FirebaseError).code).toBe('functions/invalid-argument')
    expect(problemOf(seen.error)).toBe('confirm')
  })

  it('stops waiting at once when the backend had to stop partway, and says to check before trying again', async () => {
    const { deleteAccount, describeError } = await load(true)
    const seen = watch(deleteAccount({ confirm: 'Wren' }))
    await vi.advanceTimersByTimeAsync(1_000)
    fake.answer({ state: 'running' })
    await vi.advanceTimersByTimeAsync(5_000)
    // What the backend writes for a call it took on when it is stopped (a restart, a reboot)
    fake.answer({ state: 'failed', error: { status: 'unavailable', message: 'The server stopped before it finished.' } })
    await vi.advanceTimersByTimeAsync(0)
    expect((seen.error as FirebaseError).code).toBe('functions/unavailable')
    expect(describeError(seen.error)).toBe('The server stopped before it finished. Check whether it went through, then try again.')
  })
})

describe('calls through Cloud Functions', () => {
  it('lets deleteAccount run as long as the server allows (300s), and leaves other calls at the SDK default', async () => {
    const { httpsCallable } = await import('firebase/functions')
    vi.mocked(httpsCallable).mockClear()
    await load(false)
    const options = new Map(vi.mocked(httpsCallable).mock.calls.map(([, name, given]) => [name, given]))
    expect(options.get('deleteAccount')?.timeout).toBeGreaterThan(300_000)
    expect(options.has('saveProfile')).toBe(true)
    expect(options.get('saveProfile')?.timeout).toBeUndefined()
  })
})

describe('describeError', () => {
  it('tells a paused account why it cannot sign in, instead of asking it to try again', async () => {
    const { describeError } = await load(true)
    const message = describeError(new FirebaseError('auth/user-disabled', 'x'))
    expect(message).toContain('paused')
    expect(message).not.toBe('Something went wrong. Try again in a moment.')
  })

  it('sends Google on an email that signs in with a password to the password, instead of asking to try again', async () => {
    const { describeError } = await load(true)
    const message = describeError(new FirebaseError('auth/account-exists-with-different-credential', 'x'))
    expect(message).toContain('password')
    expect(message).not.toBe('Something went wrong. Try again in a moment.')
  })

  it('says a missing item is gone, instead of asking to try again', async () => {
    const { describeError } = await load(true)
    expect(describeError(new FirebaseError('functions/not-found', 'queue item'))).toBe('That isn’t there any more.')
  })

  it('names what went wrong opening or uploading a licence document', async () => {
    const { describeError } = await load(true)
    // The SDK's own errors, so the FirebaseError check is tried on the real thing
    const storage = (code: StorageErrorCode) => describeError(new StorageError(code, 'x'))
    expect(storage(StorageErrorCode.OBJECT_NOT_FOUND)).toBe('That document isn’t there.')
    expect(storage(StorageErrorCode.UNAUTHORIZED)).toBe('You can’t do that here.')
    expect(storage(StorageErrorCode.UNAUTHENTICATED)).toBe('Sign in first.')
    expect(storage(StorageErrorCode.RETRY_LIMIT_EXCEEDED)).toContain('connection')
    for (const code of [StorageErrorCode.RETRY_LIMIT_EXCEEDED, StorageErrorCode.UNKNOWN]) {
      expect(storage(code)).not.toBe('Something went wrong. Try again in a moment.')
    }
  })

  it('keeps the general message for anything it does not know', async () => {
    const { describeError } = await load(true)
    expect(describeError(new FirebaseError('auth/something-new', 'x'))).toBe('Something went wrong. Try again in a moment.')
    expect(describeError(new Error('x'))).toBe('Something went wrong. Try again in a moment.')
  })
})

describe('resetRefusal', () => {
  it('names what stopped a reset link that is the same for every address', async () => {
    const { resetRefusal } = await load(true)
    expect(resetRefusal(new FirebaseError('auth/network-request-failed', 'x'))).toBe('No connection. Check your internet and try again.')
    expect(resetRefusal(new FirebaseError('auth/invalid-email', 'x'))).toBe('That doesn’t look like an email address.')
    expect(resetRefusal(new FirebaseError('auth/too-many-requests', 'x'))).toBe('Too many tries. Wait a minute, then try again.')
  })

  it('leaves anything that could depend on the account to the note a sent link gets', async () => {
    const { resetRefusal } = await load(true)
    for (const code of ['auth/user-not-found', 'auth/user-disabled', 'auth/invalid-recipient-email', 'auth/something-new']) {
      expect(resetRefusal(new FirebaseError(code, 'x')), code).toBeNull()
    }
    expect(resetRefusal(new Error('x'))).toBeNull()
  })
})
