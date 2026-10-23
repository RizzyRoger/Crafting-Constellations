import { PEN_NAME_HINTS } from '@moderation'
import { describe, expect, it } from 'vitest'
import { profileErrorOf } from './profileError'

const FALLBACK = 'Something went wrong. Try again in a moment.'

describe('profileErrorOf', () => {
  it('puts a held note at the note, not on the pen name', () => {
    // saveProfile: HttpsError('invalid-argument', 'note', { problem: 'unkind' }) for 'email me heron@example.com'
    const error = profileErrorOf('note', 'unkind', FALLBACK)
    expect(error.at).toBe('note')
    expect(error.text).not.toBe(PEN_NAME_HINTS.unkind)
    expect(error.text).toMatch(/links, emails, phone numbers/)
  })

  it('gives a too-long note its own words, not the pen-name length rule', () => {
    const error = profileErrorOf('note', 'length', FALLBACK)
    expect(error.at).toBe('note')
    expect(error.text).not.toBe(PEN_NAME_HINTS.length)
    expect(error.text).toMatch(/160/)
  })

  it('still shows pen-name problems as pen-name hints', () => {
    expect(profileErrorOf('pen-name', 'unkind', FALLBACK)).toEqual({ at: 'form', text: PEN_NAME_HINTS.unkind })
    expect(profileErrorOf('pen-name', 'length', FALLBACK)).toEqual({ at: 'form', text: PEN_NAME_HINTS.length })
    expect(profileErrorOf('pen-name', 'taken', FALLBACK)).toEqual({ at: 'form', text: 'Someone already uses that pen name.' })
  })

  it('falls back to the plain message for anything else', () => {
    expect(profileErrorOf('pigment', undefined, FALLBACK)).toEqual({ at: 'form', text: FALLBACK })
    expect(profileErrorOf('internal', undefined, FALLBACK)).toEqual({ at: 'form', text: FALLBACK })
    expect(profileErrorOf('pen-name', 'toString', FALLBACK)).toEqual({ at: 'form', text: FALLBACK })
  })
})
