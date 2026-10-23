import { describe, expect, it } from 'vitest'
import { checkPenName, isAllowedLink, moderate, suggestPenName, tidyPenName } from './index.js'

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
    // Plans and care that read like crisis phrases word by word
    "We can't go on holiday this year because of chemo",
    "Sorry, I can't go on Friday's walk",
    'Mum can’t go on the trial',
    "I can't keep going to every appointment alone",
    "I can't keep going in and out of hospital",
    "I can't keep going in every day to see him",
    "I can't keep going into hospital every week",
    "I can't keep going into every appointment alone",
    'I don’t want to wake up dad, he finally fell asleep',
    "I don't want to live far from mum any more",
    "I don't want to live in that care home",
    "I don't want to live in a hospice",
    "I don't want to live in a tiny flat",
    "I don't want to live in a nursing home",
    "I don't want to live in the city",
    'We can’t go on a morning walk until her counts are up',
    'We can’t go on a day trip until her counts are up',
    "I'm taking my life back after treatment",
    'the hospital is 40 kms away',
    'it is only 2 kms away',
    "We're going 2 kms down the road for lunch",
    "I'm going to odd places",
    'I wanna go home',
    // A ! or | that ends the line is punctuation, not an "i" on the last word
    "We can't go on holiday!",
    'I don’t want to wake up dad!!',
    "I'm taking my life back!",
    "I can't keep going back|",
    // A full stop with the space left out still ends the sentence
    "We can't go on holiday.Mum is in hospital again",
    'family 👨\u200d👩\u200d👧 love',
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

  // The word between "you" and the insult used to be any word, even "not";
  // and a hope about how someone dies read as wishing it on them
  it.each([
    'you are not worthless',
    "you're not pathetic",
    "you aren't disgusting",
    "you're no loser",
    'when you feel worthless, call me',
    'Are you a control freak like me?',
    'I hope he dies peacefully at home',
    'Mum is in hospice. I hope she dies peacefully.',
    'I hope he dies, peacefully, in his sleep',
    'She deserves to die with dignity',
    'I hope he dies peacefully!',
  ])('publishes support that only sounds like abuse: %j', (text) => {
    expect(held(text).action).toBe('publish')
    expect(held(text, 'private').action).toBe('publish')
  })

  it.each([
    'you stupid idiot',
    'you look pathetic',
    "you're worthless",
    'I hope he dies',
    'I hope she dies alone',
    'I hope you die peacefully',
    'I hope you die at home alone',
    'you deserve to die with dignity',
    'they deserve to die',
  ])('still holds %j', (text) => {
    expect(held(text)).toMatchObject({ action: 'hold', categories: ['harassment'] })
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

  // A suffix on a stem used to spell everyday words: "spicy", "spiced"
  it.each(['She can only taste spicy food since chemo', 'Loves spiced apple cake', 'spicing up dinner', 'the spice cabinet'])(
    'does not hold words that only contain a stem: %j',
    (text) => {
      expect(held(text).action).toBe('publish')
      expect(held(text, 'private').action).toBe('publish')
    },
  )

  it('still holds the stem and its plural', () => {
    expect(held(rot13('fcvp')).categories).toContain('slur')
    expect(held(rot13('fcvpf')).categories).toContain('slur')
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
    "I've been cutting myself again",
    'I started cutting myself',
    'cutting my self',
    'I harmed myself',
    'I wanna die',
    "I don't wanna live anymore",
    'I cannot go on',
    'I can not go on',
    'I can’t go on. Everything hurts',
    'i cant go on like this',
    "I can't go on the way things are",
    "I don't want to live with this pain anymore",
    'thinking of taking my own life',
    // A determiner that starts how long or how it feels, not a place or a plan
    "I don't want to live in a world without him",
    "I don't want to live in a body that hurts",
    "I can't go on this much longer",
    "I can't go on that way",
    "I can't go on the same way",
    "I can't go on a single day more",
    "I can't keep going a day longer",
    "I don't want to wake up a single day more",
    "I can't go on an hour longer",
    "I can't keep going a single hour more",
    "I don't want to wake up a single morning more",
    "I can't go on the rest of my life like this",
    "I can't keep going the rest of my life like this",
    // How it feels, not where to go or live
    "I can't keep going in this world without him",
    "I can't keep going in this pain",
    "I can't keep going in pain every day",
    "I can't keep going into another day of this",
    "I can't keep going into every day like this",
    "I can't keep going into the next day",
    "I don't want to live with my husband gone",
    "I don't want to live in a cruel world",
    "I don't want to live in a broken body",
    "I don't want to live in the pain",
    "I don't want to live in a living hell",
    // A full stop ends the phrase, even when the next sentence starts like a plan
    'I can’t go on. The pain is too much',
    "I don't want to wake up. My mum would cope",
    'I can’t go on 😭 the pain is too much',
    'I can’t go on.The pain is too much',
    'I can’t go on!The pain is too much',
    'I can’t go on?The pain is too much',
    // "2" for "to", not a distance
    'i just want 2 kms',
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

describe('moderate — punctuation, stretched letters and invisible characters', () => {
  // A ! straight after a phrase used to fold into an "i" ("die!" read as
  // "diei"), and a letter stretched past two hid the word ("dieeee")
  it.each([
    'I want to die!',
    'I want to die! Nobody cares',
    'I want to die!Nobody cares',
    'I want to die!1!',
    'suicide!!',
    'I want to dieeee',
    'I want to diiiie',
    'I want to kiiiill myself',
    'suiciiiidal',
  ])('%j is crisis', (text) => {
    expect(held(text)).toMatchObject({ action: 'hold', crisis: true, categories: ['selfHarm'] })
  })

  it('flags crisis ending in ! in private messages too', () => {
    expect(held('I want to die!', 'private').crisis).toBe(true)
  })

  // A ! standing for an "i" mustn't end the clause it's in, even when a full
  // stop and a word that would otherwise excuse the line come straight after
  it.each([
    "I can't keep go!ng. The pain is too much",
    "I can't keep go!ng. My body is done",
    "I don't want to l!ve. There is nothing left",
    "I don't want to l!ve. Alone again tonight",
    'I want to take my l!fe. Back to square one every day',
  ])('%j is crisis', (text) => {
    expect(held(text).crisis).toBe(true)
    expect(held(text, 'private').crisis).toBe(true)
  })

  it.each([
    'kill yourself!',
    'kill yourself!1',
    'kys!',
    'fuck you!',
    'you idiot!',
    'you @idiot!',
    'k i l l yourself!',
    'kill yourself$',
    'ky$',
    'ky$!',
    'go diiiie',
  ])('%j is harassment', (text) => {
    expect(held(text)).toMatchObject({ action: 'hold', categories: ['harassment'] })
  })

  it('still reads an @ inside an email address as a letter', () => {
    expect(held('my email is kms@example.test', 'private')).toMatchObject({ action: 'publish', crisis: false })
  })

  it('holds a leetspeak slur ending in !', () => {
    expect(held(`you ${rot13('ergneq').replace('e', '3')}!`).categories).toContain('slur')
  })

  // One stem ends in "i", which a final ! or | can stand for
  it.each(['!', '|'])('still reads a %s that ends a slur as an "i"', (end) => {
    expect(held(`you ${rot13('cnx')}${end}`).categories).toContain('slur')
  })

  // Each looks like nothing on screen but used to split the word around it
  it.each([
    ['a left-to-right mark', '\u200e'],
    ['a right-to-left mark', '\u200f'],
    ['an invisible times', '\u2062'],
    ['a left-to-right embedding', '\u202a'],
    ['a left-to-right isolate', '\u2066'],
    ['a Mongolian vowel separator', '\u180e'],
    ['a Hangul filler', '\u3164'],
  ])('reads through %s inside a word', (_, c) => {
    expect(held(`ki${c}ll yourself`)).toMatchObject({ action: 'hold', categories: ['harassment'] })
    expect(held(`I want to d${c}ie`).crisis).toBe(true)
    expect(held(`email me fern@exa${c}mple.com`).categories).toContain('personalInfo')
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

  // A browser opens evil.com for both
  it('reads the host a browser would open', () => {
    expect(isAllowedLink('https://evil.com\\.nhs.uk')).toBe(false)
    expect(isAllowedLink('https://nhs.uk@evil.com/login')).toBe(false)
    expect(held('see https://evil.com\\.nhs.uk for help').categories).toContain('spam')
  })

  it('holds a link with a login in private messages, not reading it as an email', () => {
    expect(held('https://nhs.uk@evil.com/login', 'private').categories).toContain('spam')
    expect(held('https://nhs.uk:x@evil.com/login', 'private').categories).toContain('spam')
  })

  it('holds links on other domains and written with an ideographic full stop', () => {
    expect(held('scam.tk/free').categories).toContain('spam')
    expect(held('free-meds.cc').categories).toContain('spam')
    expect(held('evil.de/abc').categories).toContain('spam')
    expect(held('evil\u3002com/abc').categories).toContain('spam')
  })

  // A missing space after a full stop used to read as a domain: "all.me"
  it.each([
    'Thanks all.Me and mum are home now',
    'Got home.Info from the doctor was good',
    'It was a long day.Co-pay was awful',
    'He is in the ICU.App for scans is broken',
    'Fine.Ca',
    'ok.me too',
  ])('publishes a missing space as prose: %j', (text) => {
    expect(held(text).action).toBe('publish')
    expect(held(text, 'private').action).toBe('publish')
  })

  it.each(['go to evil.shop/deal', 'www.evil.me', 'https://evil.me'])('still holds a link on a word domain: %j', (text) => {
    expect(held(text, 'private').categories).toContain('spam')
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

  // Only the first number each pattern found used to be looked at
  it.each([
    'If it gets bad call 1-800-273-8255, or text me anytime 555-867-5309',
    'Call 1-800-273-8255 or text me 555-867-5309',
    'Samaritans 08457 909090 or me 07700 900123',
  ])('holds a personal number after a crisis line: %j', (text) => {
    expect(held(text).categories).toContain('personalInfo')
  })

  it.each(['ring me on 020 7946 0958', '07700 900 123', '0161 496 0000', '0412 345 678', '07700-900-123', '02 9876 5432', '(03) 9876 5432'])(
    'holds UK and Australian numbers as people write them: %j',
    (text) => {
      expect(held(text).categories).toContain('personalInfo')
    },
  )

  it.each([
    'Samaritans on 0845 790 9090',
    'Macmillan on 0808 808 00 00',
    'Cancer Research UK nurses on 0808 800 4040',
    'Marie Curie 0800 090 2309',
    'Mind 0300 123 3393',
  ])('lets people share support lines: %j', (text) => {
    expect(held(text).action).toBe('publish')
  })

  it.each(['scan on 05.10.2026 10.30', '05 10 2026', '01/02/2026 at 10:30', 'nhs 111 or 999', 'doses at 0930 1330 1730'])(
    'does not read dates and times as numbers: %j',
    (text) => {
      expect(held(text).action).toBe('publish')
    },
  )

  it('does not read a time written with @ as an email', () => {
    expect(held('chemo tomorrow@10.15').action).toBe('publish')
    expect(held('mum@9.30 scan').action).toBe('publish')
    expect(held('email fern@example.test or a@b.co.uk').categories).toContain('personalInfo')
  })
})

describe('moderate — flooding', () => {
  it('holds character and word floods', () => {
    expect(held('a'.repeat(30)).categories).toContain('spam')
    expect(held('help '.repeat(10)).categories).toContain('spam')
    expect(held('-'.repeat(20)).categories).toContain('spam')
  })

  // Runs of spaces collapse on screen: pasted columns, aligned lists
  it('does not count whitespace as a flood', () => {
    expect(held(`Morning meds:${' '.repeat(21)}2 tablets`, 'private').action).toBe('publish')
    expect(held(`a${'\t'.repeat(20)}b`, 'private').action).toBe('publish')
    expect(held(`a${'\u00a0'.repeat(20)}b`, 'private').action).toBe('publish')
  })
})

describe('pen names', () => {
  it('accepts quiet names and tidies spacing', () => {
    expect(checkPenName('  Quiet   Heron ')).toEqual({ ok: true, value: 'Quiet Heron' })
    expect(checkPenName("Ana-María O'Neil").ok).toBe(true)
    expect(checkPenName('Spicy Fern').ok).toBe(true)
    expect(checkPenName('Spiced Pear').ok).toBe(true)
  })

  // Vowel signs and points stay combining marks after NFKC
  it.each(['अनीता देवी', 'கவிதா', 'রিনা', 'นิด', 'प्रिया', 'முருகன்', 'วิภา', 'ಕವಿತಾ', 'ਪ੍ਰੀਤ', 'שָׁלוֹם', 'سَلَام', 'Adébáyọ̀'])(
    'accepts %j, written with combining marks',
    (name) => {
      expect(checkPenName(name)).toEqual({ ok: true, value: name.normalize('NFKC') })
    },
  )

  it('accepts a name in any one alphabet, and scripts with no lookalikes mixed', () => {
    expect(checkPenName('Анна').ok).toBe(true)
    expect(checkPenName('Νίκος').ok).toBe(true)
    expect(checkPenName('山田さくら').ok).toBe(true)
    expect(checkPenName('Sato さくら').ok).toBe(true)
    expect(checkPenName('प्रिया Sharma').ok).toBe(true)
  })

  // Letters whose stroke or dot is their own, not a mark laid over them
  it.each(['Søren', 'Łukasz', 'Đorđe', 'İpek', 'I\u0307pek', 'María', 'Anaïs'])('accepts %j', (name) => {
    expect(checkPenName(name).ok).toBe(true)
  })

  it('reads a curly apostrophe or a Unicode hyphen as the plain one', () => {
    expect(checkPenName('O’Neil')).toEqual({ ok: true, value: "O'Neil" })
    expect(checkPenName('Dad’s team')).toEqual({ ok: true, value: "Dad's team" })
    expect(checkPenName('Ana\u2010María')).toEqual({ ok: true, value: 'Ana-María' })
    expect(checkPenName('Ana\u2011María')).toEqual({ ok: true, value: 'Ana-María' })
    // Both spellings claim the same penNames key
    expect(tidyPenName('O’Neil').toLowerCase()).toBe(tidyPenName("O'Neil").toLowerCase())
  })

  // Saved names keep their penNames key and their delete confirmation
  it('tidies names that were already allowed exactly as before', () => {
    expect(tidyPenName('  Quiet   Heron ')).toBe('Quiet Heron')
    expect(tidyPenName('O\u02bcNeil')).toBe('O\u02bcNeil')
    expect(tidyPenName('Moderators')).toBe('Moderators')
    // Lookalike letters are read as plain ones only when looking for a role
    expect(tidyPenName('\u029c\u1d07\u0280\u1d0f\u0274')).toBe('\u029c\u1d07\u0280\u1d0f\u0274')
    expect(tidyPenName('I\u015f\u0131k')).toBe('I\u015f\u0131k')
  })

  it.each([
    ['a', 'length'],
    ['x'.repeat(33), 'length'],
    ['joe@example', 'characters'],
    // Blank or invisible: Hangul fillers, a grapheme joiner, a variation selector
    ['\u3164\u3164', 'characters'],
    ['Fern\u3164', 'characters'],
    ['Quiet Heron\u034f', 'characters'],
    ['Quiet Heron\ufe0f', 'characters'],
    // A dot above an i sits on its own dot
    ['Qui\u0307et Heron', 'characters'],
    // No letter or number at all; ".." can't be a penNames key either
    ['--', 'characters'],
    ["''", 'characters'],
    ['. -', 'characters'],
    ['..', 'characters'],
    ['Fe x\u0301\u0302\u0303\u0304', 'characters'],
    // Marks that make one letter pass for another: a dot or accent on a
    // dotless i, a slash or stroke through a letter (o and a slash for \u00f8), a
    // mark made for symbols, the same mark twice
    ['Qu\u0131\u0307et Heron', 'characters'],
    ['Mar\u0131\u0301a', 'characters'],
    ['Ana\u0131\u0308s', 'characters'],
    ['So\u0338ren', 'characters'],
    ['L\u0337ukasz', 'characters'],
    ['H\u0334e\u0335l\u0336l\u0337o\u0338', 'characters'],
    ['Fern\u20d2', 'characters'],
    ['Jose\u0301\u0301', 'characters'],
    ['\u0e27\u0e34\u0e34\u0e20\u0e32', 'characters'],
    // Lookalike letters from another alphabet: Cyrillic е, о and А, or a whole
    // word ("Ѕӏоԝ River" for "Slow River")
    ['F\u0435rn', 'mixed'],
    ['Quiet H\u0435ron', 'mixed'],
    ['D\u043ector Ann', 'mixed'],
    ['M\u043ederator Heron', 'mixed'],
    ['\u0410dmin', 'mixed'],
    ['\u0405\u04cf\u043e\u051d River', 'mixed'],
    ['\u0410\u043d\u043d\u0430 Smith', 'mixed'],
    ['Heron 1234567', 'contact'],
    ['Dr Heron', 'reserved'],
    ['Nurse Joy', 'reserved'],
    ['Admin', 'reserved'],
    ['Licensed Listener', 'reserved'],
    ['Adm1n', 'reserved'],
    ['Nurs3', 'reserved'],
    // Plurals, a number on the end, joined words, spaced-out letters
    ['Moderators', 'reserved'],
    ['Admins', 'reserved'],
    ['Nurses', 'reserved'],
    ['Officials', 'reserved'],
    ['Doctors', 'reserved'],
    ['Therapists', 'reserved'],
    ['Mods', 'reserved'],
    ['The Mods', 'reserved'],
    ['RNs', 'reserved'],
    ["Admin's", 'reserved'],
    ['Admin1', 'reserved'],
    ['Moderator7', 'reserved'],
    ['Doctor7', 'reserved'],
    ['Staff2', 'reserved'],
    ['SiteAdmin', 'reserved'],
    ['NurseJoy', 'reserved'],
    ['DrHeron', 'reserved'],
    ['DRHeron', 'reserved'],
    ['AskDrRuth', 'reserved'],
    ['TheModerator', 'reserved'],
    ['TherapistAnn', 'reserved'],
    ['A d m i n', 'reserved'],
    // A number where a new word starts, not only on the end
    ['2Admin', 'reserved'],
    ['Nurse2Joy', 'reserved'],
    ['SiteAdm1n', 'reserved'],
    // In any case, where the number starts the word or can't be a letter
    ['2admin', 'reserved'],
    ['2ADMIN', 'reserved'],
    ['1admin', 'reserved'],
    ['nurse2joy', 'reserved'],
    ['NURSE2JOY', 'reserved'],
    ['admin2', 'reserved'],
    ['ADMIN2', 'reserved'],
    // A run of digits splits off whole, not all but its last digit
    ['Joy12nurse', 'reserved'],
    ['12admin', 'reserved'],
    // A digit starting a word can be its first letter, with a number after or
    // before it
    ['4dmin2', 'reserved'],
    ['4DMIN2', 'reserved'],
    ['4dmin1', 'reserved'],
    ['4dmin1Joy', 'reserved'],
    ['4dm1n2', 'reserved'],
    ['5taff2', 'reserved'],
    ['0fficial2', 'reserved'],
    ['7herapist2', 'reserved'],
    ['24dmin', 'reserved'],
    ['14dmin', 'reserved'],
    ['Joy14dmin', 'reserved'],
    // MD, RN and NP after a name, or before another title
    ['JoyRN', 'reserved'],
    ['AnnMD', 'reserved'],
    ['JoyRN Smith', 'reserved'],
    ['RN1', 'reserved'],
    ['MdAdmin', 'reserved'],
    ['NPNurse', 'reserved'],
    // Latin letters NFKC leaves alone: small capitals, the Latin alpha, a
    // dotless i
    ['\u1d00dmin', 'reserved'],
    ['\u0251dmin', 'reserved'],
    ['Nu\u0280se Joy', 'reserved'],
    ['\u0274urse', 'reserved'],
    ['D\u0280 Heron', 'reserved'],
    ['Adm\u0131n', 'reserved'],
    ['Site\u1d00dmin', 'reserved'],
    [`Big ${rot13('ergneq')}`, 'unkind'],
  ])('%j → %s', (name, problem) => {
    expect(checkPenName(name)).toEqual({ ok: false, problem })
  })

  // Reserved words only as whole words: these just hold one
  it.each(['Badminton Fan', 'Nursery Rhyme', 'Modest Wren', 'Drew Heron', 'Stafford Lane', 'Officially Tired', 'McDonald Fern', 'Fern2'])(
    'accepts %j',
    (name) => {
      expect(checkPenName(name).ok).toBe(true)
    },
  )

  // MD, RN and NP starting a joined word are something else: Md is short for
  // Muhammad. A number inside a word is still a letter there.
  it.each(['RnB Lover', 'RnR Fan', 'NPFan', 'MdRahim', 'MDRahim', 'RnBFan', 'Dr4gon', 'Dr3w'])('accepts %j', (name) => {
    expect(checkPenName(name).ok).toBe(true)
    expect(checkPenName(name, { chat: true }).ok).toBe(true)
  })

  // Numbers split off only to find a role: names with them pass as typed
  it.each([
    'dr4gon', 'DR4GON', 'mum2kids', 'back2back', 'jo99fern', '4ever Fern', 'Catch22', 'R2D2', 'K9 Lover',
    'Dr4gon2', 'Ad4m2', '0liver1', '5ummer Wren', 'b4dminton', 'Staff0rd Lane', 'Nurs3ry Rhyme', 'sk8er',
  ])('accepts %j', (name) => {
    expect(checkPenName(name)).toEqual({ ok: true, value: name })
    expect(checkPenName(name, { chat: true })).toEqual({ ok: true, value: name })
  })

  // Read as plain letters only to find a role: other names written with them pass
  it.each(['I\u015f\u0131k Y\u0131lmaz', '\u029c\u1d07\u0280\u1d0f\u0274', '\u0251nna'])('accepts %j', (name) => {
    expect(checkPenName(name)).toEqual({ ok: true, value: name })
  })

  // Chat names go through the same check
  it.each(['Dad’s team', 'Kitchen-table logistics', 'Late-night caregivers', 'After the appointment', 'Mum and the kids'])(
    'accepts the chat name %j',
    (name) => {
      expect(checkPenName(name).ok).toBe(true)
      expect(checkPenName(name, { chat: true }).ok).toBe(true)
    },
  )

  // A chat or group name can't pass for a person, so a plural role word or a
  // second alphabet is ordinary there
  it.each(['Questions for doctors', 'Night-shift nurses', 'Therapists welcome', 'Мама and Dad'])(
    'accepts the chat name %j, though not as a pen name',
    (name) => {
      expect(checkPenName(name).ok).toBe(false)
      expect(checkPenName(name, { chat: true }).ok).toBe(true)
    },
  )

  it.each([
    ['Questions for the doctor', 'reserved'],
    ['SiteAdmin', 'reserved'],
    ['Admin1', 'reserved'],
    ['2Admin chat', 'reserved'],
    ['2admin chat', 'reserved'],
    ['nurse2joy chat', 'reserved'],
    ['4dmin2 chat', 'reserved'],
    ['\u1d00dmin chat', 'reserved'],
    ['\u0410dmin chat', 'mixed'],
    ['Quiet H\u0435ron', 'mixed'],
    ['So\u0338ren', 'characters'],
    ['..', 'characters'],
  ])('chat name %j → %s', (name, problem) => {
    expect(checkPenName(name, { chat: true })).toEqual({ ok: false, problem })
  })

  it('suggests names that pass its own check', () => {
    const rands = [0, 0.13, 0.5, 0.77, 0.999]
    rands.forEach((r) => expect(checkPenName(suggestPenName(() => r)).ok).toBe(true))
    // pickFreeName's fallback adds a number
    rands.forEach((r) => expect(checkPenName(`${suggestPenName(() => r)} 23`).ok).toBe(true))
  })
})
