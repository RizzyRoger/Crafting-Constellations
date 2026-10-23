import { describe, expect, it } from 'vitest'
import { findById } from './lookup'

describe('findById', () => {
  it('picks the row asked for', () => {
    expect(findById([{ id: 'a_b' }, { id: 'a_c' }], 'a_c')).toEqual({ id: 'a_c' })
  })

  it('ignores the next one along that a lookup from a gone id returns', () => {
    expect(findById([{ id: 'shown' }], 'gone')).toBeNull()
    expect(findById([], 'gone')).toBeNull()
  })
})
