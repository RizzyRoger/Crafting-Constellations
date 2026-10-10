import { describe, expect, it } from 'vitest'
import { checkPenName, isAllowedLink, moderate, suggestPenName } from './index.js'

const rot13 = (s: string) =>
  s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))

const held = (text: string, context: 'public' | 'private' = 'public') => moderate(text, { context })

describe('moderate — publishes ordinary support talk', () => {
  it.each([
    'Mum started chemo today. Long day at the hospital.',
    'My therapist helped me assess what I can carry this week.',
    'We drove through Scunthorpe after class and ate grapes in the car.',
    'This is so fucking hard and I am tired.',
    'Nobody deserves cancer.',
    'You are not a loser for needing a break.',
    'The chemo is killing the tumour, slowly.',
    '',
  ])('%j', (text) => {
    const result = held(text)
    expect(result.action).toBe('publish')
    expect(result.crisis).toBe(false)
  })
})

describe('moderate — harassment', () => {
  it.each([
    'you are such a loser',
    'fuck you',
    'kys',
    'k i l l yourself',
    'y0u 4re 4 l0ser',
    'I hope you get cancer',
    'nobody likes you',
  ])('%j is held', (text) => {
    const result = held(text)
    expect(result.action).toBe('hold')
    expect(result.categories).toContain('harassment')
  })
})

describe('moderate — @mentions', () => {
  it.each(['thank you @Fern for the soup', '@Quiet Heron see you thursday', 'love you @Fern'])('publishes %j', (text) => {
    expect(held(text).action).toBe('publish')
  })

  // An @ at the start of a word used to read as "a" ("@idiot" → "aidiot") and hide the insult
  it.each(['you @idiot', 'love you @Loser', '@Fern kys'])('still reads the word after an @: %j', (text) => {
    expect(held(text)).toMatchObject({ action: 'hold', categories: ['harassment'] })
  })

  it('still reads an @ inside a word as an "a", and an email as contact details', () => {
    expect(held('you are so p@thetic').action).toBe('hold')
    expect(held('write to fern@example.test').categories).toContain('personalInfo')
  })
})

describe('moderate — slurs', () => {
  it('holds a slur, including leetspeak', () => {
    const result = held(`you ${rot13('ergneq').replace('e', '3').replace('a', '4')}`)
    expect(result.action).toBe('hold')
    expect(result.categories).toContain('slur')
  })

  it('does not hold words that only contain a stem', () => {
    expect(held('spicy food and a faggot of sticks is not this').categories).not.toContain('harassment')
    expect(held('the spice cabinet').action).toBe('publish')
  })
})

describe('moderate — crisis language', () => {
  it.each([
    'I want to die',
    'sometimes I think about ending it all',
    'I keep hurting myself',
    'they would be better off without me',
    'I don’t want to wake up tomorrow',
    'I can’t go on',
    'I wish I was dead',
    'kms',
    'been thinking about suicide',
    'my sister says she wants to die',
    'self-harm again last night',
    'no reason to live',
  ])('%j is crisis', (text) => {
    const result = held(text)
    expect(result.crisis).toBe(true)
    expect(result.action).toBe('hold')
    expect(result.categories).toContain('selfHarm')
  })

  it('flags crisis in private messages too (delivery is decided by the caller)', () => {
    expect(held('I want to die', 'private').crisis).toBe(true)
  })
})

describe('moderate — links', () => {
  it('publishes allowlisted support links', () => {
    expect(held('see cancer.org/treatment for options').action).toBe('publish')
    expect(held('https://www.macmillan.org.uk/cancer-information').action).toBe('publish')
  })

  it('holds other links', () => {
    expect(held('buy at cheap-pills.xyz today').categories).toContain('spam')
    expect(held('visit https://evil.com/now').categories).toContain('spam')
  })

  it('holds more than three allowlisted links', () => {
    const text = 'cancer.org nhs.uk samaritans.org nami.org'
    expect(held(text).categories).toContain('spam')
  })

  it('matches hosts exactly, not by suffix trickery', () => {
    expect(isAllowedLink('https://evilcancer.org')).toBe(false)
    expect(isAllowedLink('https://www.cancer.org/x')).toBe(true)
    expect(isAllowedLink('https://help.nhs.uk')).toBe(true)
  })
})

describe('moderate — personal info', () => {
  it('holds emails and phone numbers in groups', () => {
    expect(held('write me at quiet.heron@example.com').categories).toContain('personalInfo')
    expect(held('call me 555-123-4567').categories).toContain('personalInfo')
  })

  it('allows them in private messages', () => {
    expect(held('write me at quiet.heron@example.com', 'private').action).toBe('publish')
    expect(held('call me 555-123-4567', 'private').action).toBe('publish')
  })

  it('lets people share crisis lines', () => {
    expect(held('You can call 988 or 1-800-273-8255, or Samaritans on 116 123').action).toBe('publish')
  })
})

describe('moderate — flooding', () => {
  it('holds character and word floods', () => {
    expect(held('a'.repeat(30)).categories).toContain('spam')
    expect(held('help '.repeat(10)).categories).toContain('spam')
  })
})

describe('pen names', () => {
  it('accepts quiet names and tidies spacing', () => {
    expect(checkPenName('  Quiet   Heron ')).toEqual({ ok: true, value: 'Quiet Heron' })
    expect(checkPenName("Ana-María O'Neil").ok).toBe(true)
  })

  it.each([
    ['a', 'length'],
    ['x'.repeat(33), 'length'],
    ['joe@example', 'characters'],
    ['Heron 1234567', 'contact'],
    ['Dr Heron', 'reserved'],
    ['Nurse Joy', 'reserved'],
    ['Admin', 'reserved'],
    ['Licensed Listener', 'reserved'],
    [`Big ${rot13('ergneq')}`, 'unkind'],
  ])('%j → %s', (name, problem) => {
    expect(checkPenName(name)).toEqual({ ok: false, problem })
  })

  it('suggests names that pass its own check', () => {
    const rands = [0, 0.13, 0.5, 0.77, 0.999]
    rands.forEach((r) => expect(checkPenName(suggestPenName(() => r)).ok).toBe(true))
  })
})
