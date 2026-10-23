import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retrying } from './local-backend.js'

describe('retrying', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('says the work went through when a later try succeeds', async () => {
    const work = vi.fn().mockRejectedValueOnce(new Error('UNAVAILABLE')).mockResolvedValue(undefined)
    const result = retrying('answer to saveProfile', work)
    await vi.runAllTimersAsync()
    expect(await result).toBe(true)
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('says it gave up when every try fails, so an answer that was never written is not logged as done', async () => {
    const work = vi.fn().mockRejectedValue(new Error('UNAVAILABLE'))
    const result = retrying('answer to saveProfile', work)
    await vi.runAllTimersAsync()
    expect(await result).toBe(false)
    expect(work).toHaveBeenCalledTimes(5)
    expect(console.log).toHaveBeenCalledWith(expect.any(String), '[local-backend]', 'gave up on answer to saveProfile:', expect.any(Error))
  })
})
