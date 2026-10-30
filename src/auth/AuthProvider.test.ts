import type { User } from 'firebase/auth'
import type { NavigateFunction } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { currentClaims, leavePaused } from './AuthProvider'

const seen = vi.hoisted(() => [] as unknown[][])

vi.mock('../lib/firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/auth', async (actual) => ({
  ...(await actual<typeof import('firebase/auth')>()),
  signOut: async () => void seen.push(['signOut']),
}))

// A signed-in person as the SDK sees them on a fresh page load: it has reloaded them (so
// emailVerified is current) but still holds the token it saved, until asked for a fresh one.
// Each case is a new person: a fresh token is fetched at most once per person per page
let next = 0
const person = ({
  confirmed,
  tokenSays,
  freshSays = confirmed,
  refresh = 'works',
}: {
  confirmed: boolean
  tokenSays: boolean
  freshSays?: boolean
  refresh?: 'works' | 'fails'
}) => {
  let token = tokenSays
  const asked: boolean[] = []
  const user = {
    uid: `person-${next++}`,
    emailVerified: confirmed,
    getIdTokenResult: async (force = false) => {
      asked.push(force)
      if (force) {
        if (refresh === 'fails') throw new Error('auth/network-request-failed')
        token = freshSays
      }
      return { claims: { email_verified: token } }
    },
  } as unknown as User
  return { user, asked }
}

describe('currentClaims', () => {
  it('fetches a fresh token when the email was confirmed elsewhere since it was issued', async () => {
    const { user, asked } = person({ confirmed: true, tokenSays: false })
    expect((await currentClaims(user)).emailVerified).toBe(true)
    expect(asked).toEqual([false, true])
  })

  it('asks for nothing more while the email is still unconfirmed', async () => {
    const { user, asked } = person({ confirmed: false, tokenSays: false })
    expect((await currentClaims(user)).emailVerified).toBe(false)
    expect(asked).toEqual([false])
  })

  it('asks for nothing more once the token says so', async () => {
    const { user, asked } = person({ confirmed: true, tokenSays: true })
    expect((await currentClaims(user)).emailVerified).toBe(true)
    expect(asked).toEqual([false])
  })

  it('keeps the token it has when a fresh one can’t be had, so the app still opens', async () => {
    const { user } = person({ confirmed: true, tokenSays: false, refresh: 'fails' })
    expect((await currentClaims(user)).emailVerified).toBe(false)
  })

  it('asks once, not again on the token change that follows, when the fresh token still says not', async () => {
    const { user, asked } = person({ confirmed: true, tokenSays: false, freshSays: false })
    expect((await currentClaims(user)).emailVerified).toBe(false)
    // The fresh token changed the token, so the SDK calls the listener again
    expect((await currentClaims(user)).emailVerified).toBe(false)
    expect((await currentClaims(user)).emailVerified).toBe(false)
    expect(asked).toEqual([false, true, false, false])
  })
})

// A pause seen on the profile signs them out like any sign-out (see useSignOut.test): sign-in goes
// up at once, before signOut starts, or Gate can send whoever signs in next to this person's page.
// The effect that sees it runs while React is committing, where flushSync can't put a page up, so
// this waits for it to end
describe('leavePaused', () => {
  it('puts sign-in up at once, before signing out, once the effect that saw the pause has ended', async () => {
    seen.length = 0
    const navigate = ((...args: unknown[]) => void seen.push(['navigate', ...args])) as NavigateFunction
    leavePaused(navigate)
    expect(seen).toEqual([])
    await new Promise((done) => setTimeout(done))
    expect(seen).toEqual([['navigate', '/signin', { replace: true, flushSync: true }], ['signOut']])
  })
})
