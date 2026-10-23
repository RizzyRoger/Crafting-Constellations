import { describe, expect, it } from 'vitest'
import { isFirstClick, standingIn } from './groupStanding'

const confirmed = { data: { uid: 'alice' }, pending: false }
const unconfirmed = { data: { uid: 'alice' }, pending: true }
const gone = { data: null, pending: false }

describe('standingIn', () => {
  it('is a member only once the server has the membership', () => {
    expect(standingIn(unconfirmed, false)).toBe('joining')
    expect(standingIn(confirmed, false)).toBe('member')
  })

  it('is outside with no membership', () => {
    expect(standingIn(gone, false)).toBe('outside')
  })

  it('stays leaving, with no Join to press, from the click on Leave until the delete is through', () => {
    // Just clicked: the membership is still there, so it isn't joining either
    expect(standingIn(confirmed, true)).toBe('leaving')
    // The delete applied locally, waiting on the server
    expect(standingIn({ data: null, pending: true }, true)).toBe('leaving')
    expect(standingIn(gone, true)).toBe('leaving')
  })
})

describe('isFirstClick', () => {
  it('takes a single click or a key', () => {
    expect(isFirstClick(1)).toBe(true)
    expect(isFirstClick(0)).toBe(true)
  })

  it('refuses the later clicks of a double-click, which land on Join once a quick leave is through', () => {
    expect(isFirstClick(2)).toBe(false)
    expect(isFirstClick(3)).toBe(false)
  })
})
