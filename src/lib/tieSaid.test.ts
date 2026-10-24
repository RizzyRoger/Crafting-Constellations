import { describe, expect, it } from 'vitest'
import { tieSaid, type TieChange } from './tieSaid'

const CHANGES: TieChange[] = ['request', 'accept', 'decline', 'cancel', 'disconnect', 'block', 'unblock']

describe('tieSaid', () => {
  it.each(CHANGES)('names who %s was about', (change) => {
    expect(tieSaid(change, 'Willow')).toContain('Willow')
  })

  it('says something different for each, so one change isn’t heard as another', () => {
    expect(new Set(CHANGES.map((change) => tieSaid(change, 'Willow'))).size).toBe(CHANGES.length)
  })

  it('says “them” for someone whose name isn’t known yet', () => {
    expect(tieSaid('accept')).toBe('Connected with them. You can write privately now.')
  })
})
