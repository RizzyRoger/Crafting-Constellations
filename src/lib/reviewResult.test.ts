import { describe, expect, it } from 'vitest'
import { banSaid, focusLost, licenceSaid } from './reviewResult'

const body = {} as Element
const field = {} as Element

describe('licenceSaid', () => {
  it('names who each decision was about, since their row leaves the list', () => {
    expect(licenceSaid('Robin', 'approve')).toBe('Robin — Licence approved. They’ll find a note in Notifications.')
    expect(licenceSaid('Robin', 'deny')).toBe('Robin — Application denied. They’ll find a note in Notifications.')
    expect(licenceSaid('Robin', 'revoke')).toBe('Robin — Licensed mark revoked, on what they already wrote too.')
  })

  it('says nothing changed when it was decided first, rather than what the button says', () => {
    expect(licenceSaid('Robin', 'deny', 'already-resolved')).toBe('Robin — Already decided, so nothing changed.')
    expect(licenceSaid('Wren', 'revoke', 'already-resolved')).toBe('Wren — Already decided, so nothing changed.')
  })
})

describe('banSaid', () => {
  it('says a ban, and whether their writing was hidden with it', () => {
    expect(banSaid(true, false)).toBe('Banned. They’re signed out everywhere and can’t sign in.')
    expect(banSaid(true, true)).toBe('Banned. They’re signed out everywhere and can’t sign in. Their writing is hidden.')
  })

  it('says a ban was lifted', () => {
    expect(banSaid(false, false)).toBe('Ban lifted. They can sign in again.')
  })
})

describe('focusLost', () => {
  it('is lost when the browser left focus on the page itself, or nowhere', () => {
    expect(focusLost({ activeElement: body, body })).toBe(true)
    expect(focusLost({ activeElement: null, body })).toBe(true)
  })

  it('isn’t when the moderator has moved to something since', () => {
    expect(focusLost({ activeElement: field, body })).toBe(false)
  })
})
