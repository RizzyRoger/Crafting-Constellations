import { FirebaseError } from 'firebase/app'
import { describe, expect, it, vi } from 'vitest'
import { claimModerator, refusedAsModerator } from './moderator'

const refusal = () => new FirebaseError('functions/permission-denied', 'Not on the admin list.')

describe('claimModerator', () => {
  it('lets in someone another moderator made one, without asking the first-moderator list', async () => {
    const refresh = vi.fn(async () => ({ admin: true }))
    const bootstrap = vi.fn(async () => Promise.reject(refusal()))

    await expect(claimModerator({ refresh, bootstrap })).resolves.toBeUndefined()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(bootstrap).not.toHaveBeenCalled()
  })

  it('asks the list when the fresh token still says no, then takes the role it gave', async () => {
    const refresh = vi.fn<() => Promise<{ admin: boolean }>>().mockResolvedValueOnce({ admin: false }).mockResolvedValueOnce({ admin: true })
    const bootstrap = vi.fn(async () => ({ ok: true }))

    await claimModerator({ refresh, bootstrap })
    expect(bootstrap).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(bootstrap.mock.invocationCallOrder[0])
  })

  it('still looks at a fresh token before the list refuses someone not on it', async () => {
    const refresh = vi.fn(async () => ({ admin: false }))
    const bootstrap = vi.fn(async () => Promise.reject(refusal()))

    await expect(claimModerator({ refresh, bootstrap })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(bootstrap).toHaveBeenCalledTimes(1)
  })
})

describe('refusedAsModerator', () => {
  it('is a moderator call the server turned away', () => {
    expect(refusedAsModerator(new FirebaseError('functions/permission-denied', 'Admins only.'))).toBe(true)
  })

  it('is not any other failure', () => {
    expect(refusedAsModerator(new FirebaseError('functions/failed-precondition', 'Remove admin first.'))).toBe(false)
    expect(refusedAsModerator(new FirebaseError('functions/deadline-exceeded', 'No answer from the server.'))).toBe(false)
    expect(refusedAsModerator(new FirebaseError('storage/unauthorized', 'nope'))).toBe(false)
    expect(refusedAsModerator(new Error('functions/permission-denied'))).toBe(false)
  })
})
