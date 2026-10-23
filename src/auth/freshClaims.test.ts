import type { User } from 'firebase/auth'
import { describe, expect, it, vi } from 'vitest'
import { auth } from '../lib/firebase'
import { freshClaims } from './AuthProvider'

vi.mock('../lib/firebase', () => ({ auth: { currentUser: null }, db: {} }))

const signedIn = auth as unknown as { currentUser: User | null }

const someone = (uid: string, meanwhile: () => void = () => {}) =>
  ({
    uid,
    getIdTokenResult: async () => {
      // Whatever happens on the page while the fresh token is on its way
      meanwhile()
      return { claims: { admin: true, email_verified: true } }
    },
  }) as unknown as User

// A moderator signed in here, whose role is looked at again as they come back to the tab
const moderator = (meanwhile?: () => void) => {
  const user = someone('moderator', meanwhile)
  signedIn.currentUser = user
  return user
}

describe('freshClaims', () => {
  it('gives the fresh claims while the same person is still signed in', async () => {
    expect(await freshClaims(moderator())).toMatchObject({ admin: true, emailVerified: true })
  })

  it('gives nothing when they sign out while the token is on its way', async () => {
    const user = moderator(() => {
      signedIn.currentUser = null
    })
    expect(await freshClaims(user)).toBeNull()
  })

  it('gives nothing when someone else has signed in by the time it lands', async () => {
    const user = moderator(() => {
      signedIn.currentUser = someone('next-person')
    })
    expect(await freshClaims(user)).toBeNull()
  })
})
