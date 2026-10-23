import { describe, expect, it } from 'vitest'
import { roleFocus } from './roleQuestion'

describe('roleFocus', () => {
  it('takes focus to the question as it opens, never leaving it on Yes', () => {
    expect(roleFocus('remove', null)).toBe('question')
    expect(roleFocus('make', null)).toBe('question')
  })

  it('gives focus back to the button that asked when the question closes', () => {
    expect(roleFocus(null, 'remove')).toBe('remove')
    expect(roleFocus(null, 'make')).toBe('make')
  })

  it('moves nothing when the row first shows', () => {
    expect(roleFocus(null, null)).toBeNull()
  })
})
