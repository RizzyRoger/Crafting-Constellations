import { describe, expect, it } from 'vitest'
import { crisisOnly } from './delivery.js'
import { moderate } from './index.js'

const rot13 = (s: string) =>
  s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))

const CRISIS = rot13('v jnag gb qvr')
const inPrivate = (text: string) => crisisOnly(moderate(text, { context: 'private' }))

describe('crisisOnly', () => {
  it('lets private crisis writing go out when nothing else was flagged', () => {
    expect(inPrivate(CRISIS)).toBe(true)
    expect(inPrivate(`${CRISIS}. I called https://www.samaritans.org, they were kind`)).toBe(true)
  })

  it('keeps it for a person when something else was flagged too', () => {
    expect(inPrivate(`${CRISIS} https://example.com/fundraiser`)).toBe(false)
    expect(inPrivate(`${CRISIS} ${'\u{1F62D}'.repeat(20)}`)).toBe(false)
  })

  it('is about crisis only: clean or otherwise flagged writing is not', () => {
    expect(inPrivate('see you at 6')).toBe(false)
    expect(inPrivate('have a look at https://example.com/x')).toBe(false)
  })
})
