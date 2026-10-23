import { describe, expect, it } from 'vitest'
import { blockOf, howToBlock } from './blocks'

describe('blocking someone with no connection', () => {
  it('names the pair as any connection does, with the blocker as the one who acted', () => {
    const block = blockOf('synth04', 'synth03')
    expect(block.id).toBe('synth03_synth04')
    expect(block.data).toMatchObject({ uids: ['synth03', 'synth04'], requester: 'synth04', recipient: 'synth03', status: 'blocked', blockedBy: 'synth04' })
  })

  it('carries only the fields of a request blocked later', () => {
    expect(Object.keys(blockOf('a', 'b').data).sort()).toEqual(['blockedBy', 'createdAt', 'recipient', 'requester', 'status', 'uids', 'updatedAt'])
  })
})

describe('the Block button', () => {
  it('blocks a stranger outright', () => {
    expect(howToBlock(undefined)).toBe('create')
  })

  it('turns a request either way, or a friendship, into a block', () => {
    expect(howToBlock({ status: 'pending' })).toBe('update')
    expect(howToBlock({ status: 'accepted' })).toBe('update')
  })

  it('is gone once either person has blocked', () => {
    expect(howToBlock({ status: 'blocked' })).toBeNull()
  })
})
