import { describe, expect, it } from 'vitest'
import { chartIsEmpty, type EgoTie } from './egoLayout'

const tie = (id: string, a: string, b: string): EgoTie => ({ id, uids: [a, b] })

// The Friends view welcomes whoever has no one of their own to draw yet. It hears every
// friendship on the site, so other people being friends mustn't count as yours
describe('an empty chart', () => {
  it('is empty when the only friendships are between other people', () => {
    expect(chartIsEmpty({ me: 'me', friendships: [tie('f1', 'heron', 'river'), tie('f2', 'river', 'wren')], pending: [] })).toBe(true)
  })

  it('is not empty with a friend of yours', () => {
    expect(chartIsEmpty({ me: 'me', friendships: [tie('f1', 'heron', 'river'), tie('f2', 'river', 'me')], pending: [] })).toBe(false)
  })

  it('is not empty with a request either way', () => {
    expect(chartIsEmpty({ me: 'me', friendships: [tie('f1', 'heron', 'river')], pending: [tie('k1', 'wren', 'me')] })).toBe(false)
    expect(chartIsEmpty({ me: 'me', friendships: [], pending: [tie('k1', 'me', 'wren')] })).toBe(false)
  })

  it('is empty when everyone tied to you is blocked, as the chart would draw only you', () => {
    expect(chartIsEmpty({ me: 'me', friendships: [tie('f1', 'me', 'heron')], pending: [tie('k1', 'wren', 'me')], blocked: ['heron', 'wren'] })).toBe(true)
  })
})
