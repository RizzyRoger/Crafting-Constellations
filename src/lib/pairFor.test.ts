import { describe, expect, it } from 'vitest'
import { pairIdOf } from './pair'
import { isPairFor } from './pairFor'

describe('isPairFor', () => {
  it('opens the thread I share with one other person, from either side', () => {
    expect(isPairFor(pairIdOf('synth03', 'synth04'), 'synth03')).toBe(true)
    expect(isPairFor(pairIdOf('synth03', 'synth04'), 'synth04')).toBe(true)
  })

  it('refuses ids with no other person in them', () => {
    expect(isPairFor('synth03_synth03', 'synth03')).toBe(false)
    expect(isPairFor('synth03_', 'synth03')).toBe(false)
    expect(isPairFor('_synth03', 'synth03')).toBe(false)
    expect(isPairFor('', 'synth03')).toBe(false)
  })

  it('refuses other people’s threads and anything not built by pairIdOf', () => {
    expect(isPairFor('synth04_synth05', 'synth03')).toBe(false)
    expect(isPairFor('synth04_synth03', 'synth03')).toBe(false)
    expect(isPairFor('synth03_synth04_synth05', 'synth03')).toBe(false)
    // An encoded slash in the address arrives decoded
    expect(isPairFor('synth03_synth04/x', 'synth03')).toBe(false)
    expect(isPairFor('synth03_x/synth04', 'synth03')).toBe(false)
  })
})
