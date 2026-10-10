import { describe, expect, it } from 'vitest'
import { otherInPair, pairIdOf } from './pair'

describe('pair ids', () => {
  it('are the same whichever person starts', () => {
    expect(pairIdOf('synth04', 'synth03')).toBe('synth03_synth04')
    expect(pairIdOf('synth03', 'synth04')).toBe('synth03_synth04')
  })

  it('give back the other person', () => {
    expect(otherInPair('synth03_synth04', 'synth03')).toBe('synth04')
    expect(otherInPair('synth03_synth04', 'synth04')).toBe('synth03')
  })
})
