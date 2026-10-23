import { describe, expect, it } from 'vitest'
import { afterVerify, hereOf, returnTo } from './returnTo'

describe('hereOf', () => {
  it('keeps the query and hash, so a tab or a selected person comes back too', () => {
    expect(hereOf({ pathname: '/groups/abc', search: '?tab=posts', hash: '' })).toBe('/groups/abc?tab=posts')
    expect(hereOf({ pathname: '/constellation', search: '?person=u2&view=groups', hash: '#x' })).toBe(
      '/constellation?person=u2&view=groups#x',
    )
  })
})

describe('returnTo', () => {
  it('goes back to the page they were opening', () => {
    expect(returnTo({ from: '/groups/abc?tab=posts' })).toBe('/groups/abc?tab=posts')
    expect(returnTo({ from: '/messages/a_b' })).toBe('/messages/a_b')
  })

  it('falls back when there is nowhere to go back to', () => {
    expect(returnTo(null)).toBe('/constellation')
    expect(returnTo(undefined)).toBe('/constellation')
    expect(returnTo({})).toBe('/constellation')
    expect(returnTo({ from: 42 })).toBe('/constellation')
    expect(returnTo({ from: '' })).toBe('/constellation')
    expect(returnTo(null, '/somewhere')).toBe('/somewhere')
  })

  it('never sends anyone to another site', () => {
    for (const from of [
      'https://elsewhere.example/',
      '//elsewhere.example/',
      '/\\elsewhere.example/',
      '/\t/elsewhere.example/',
      '/\n/elsewhere.example',
      'groups/abc',
      'javascript:alert(1)',
    ]) {
      expect(returnTo({ from }), from).toBe('/constellation')
    }
  })
})

describe('afterVerify', () => {
  it('goes back to the page that asked for a confirmed email', () => {
    expect(afterVerify(true, { from: '/groups/abc?tab=posts' })).toEqual({ to: '/groups/abc?tab=posts' })
  })

  it('goes to their constellation when nothing asked', () => {
    expect(afterVerify(true, null)).toEqual({ to: '/constellation' })
  })

  it('has someone with no pen name choose one first, carrying the page on', () => {
    expect(afterVerify(false, { from: '/groups/abc' })).toEqual({ to: '/onboarding', state: { from: '/groups/abc' } })
    expect(afterVerify(false, null)).toEqual({ to: '/onboarding', state: null })
  })

  it('never goes to another site', () => {
    expect(afterVerify(true, { from: '//elsewhere.example/' })).toEqual({ to: '/constellation' })
  })
})
