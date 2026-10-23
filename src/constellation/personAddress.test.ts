import { describe, expect, it } from 'vitest'
import { personAddress } from './personAddress'

describe('the address the rail search opens someone at', () => {
  it('keeps the view open on the chart', () => {
    expect(personAddress({ pathname: '/constellation', search: '?view=groups' }, 'heron')).toBe('/constellation?view=groups&person=heron')
    expect(personAddress({ pathname: '/constellation', search: '?view=list&person=river' }, 'heron')).toBe('/constellation?view=list&person=heron')
  })

  it('opens Friends from the chart’s own Friends view', () => {
    expect(personAddress({ pathname: '/constellation', search: '' }, 'heron')).toBe('/constellation?person=heron')
    expect(personAddress({ pathname: '/constellation', search: '?person=river' }, 'heron')).toBe('/constellation?person=heron')
  })

  it('carries nothing over from another page', () => {
    expect(personAddress({ pathname: '/groups/g1', search: '?view=list' }, 'heron')).toBe('/constellation?person=heron')
  })

  it('gives the same address for whoever is open already', () => {
    expect(personAddress({ pathname: '/constellation', search: '?view=groups&person=heron' }, 'heron')).toBe('/constellation?view=groups&person=heron')
  })
})
