import { describe, expect, it } from 'vitest'
import { checkPenName, isAllowedLink, moderate, suggestPenName, tidyPenName } from './index.js'

const rot13 = (s: string) =>
  s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))

const held = (text: string, context: 'public' | 'private' = 'public') => moderate(text, { context })

// Arabic, Persian and Hindi keyboards type their own digits: each ASCII digit
// rewritten in the set that starts at zero
const OTHER_DIGITS: [string, number][] = [
  ['Arabic-Indic', 0x660],
  ['Persian', 0x6f0],
  ['Devanagari', 0x966],
  ['Bengali', 0x9e6],
]
const inDigits = (zero: number, text: string) => text.replace(/[0-9]/g, (d) => String.fromCodePoint(zero + Number(d)))

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
    // A short day name, something else to go on or be put on, an appointment
    // to keep going for, a time or a ward to wake in, somewhere to live
    "Can't go on Tues",
    'Sorry, can’t go on Sat, Mum has chemo',
    "Can't go on Sat morning",
    "Can't go on Sat or Sun",
    'Can’t go on Sat early, we have bloods',
    "Can't go on Sat, July 5th",
    "I can't go on Fri",
    "He can't go on any rides",
    "She can't go on planes since surgery",
    'Mum can’t go on school trips with us',
    "He can't go on Facebook",
    "He can't go on morphine yet",
    "Dad can't go on steroids because of his diabetes",
    "Dad can't go on steroids for the rest of his life",
    'Mum can’t go on hormone therapy',
    "Dad can't keep going upstairs to the loo",
    "We can't keep going for scans every week",
    "I can't keep going at this pace",
    "I don't want to wake up at 5am again for chemo",
    "I don't want to wake up at 6.30am",
    "I don't want to wake up in hospital",
    "I don't want to live on my own",
    "I don't want to live by the sea",
    "I don't want to live next door to them",
    // "2" for "to" still leaves the place to live and the person to wake
    "I don't want 2 live in a care home",
    'I don’t want 2 wake up dad',
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

  it.each(OTHER_DIGITS)('reads a distance in %s digits as in ASCII ones', (_, zero) => {
    expect(held(inDigits(zero, 'the hospital is 40 kms away'))).toMatchObject({ action: 'publish', crisis: false })
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
    // Cancer care, not cancer; what nobody wants for you; the verbs, not the insults
    'You deserve cancer support too',
    'She deserves cancer care close to home',
    'They deserve cancer treatment that works',
    'I hope he gets cancer treatment soon…',
    'I hope they get cancer nurses at home',
    'I hope you get cancer support from Macmillan',
    'I hope she gets cancer screening soon',
    'We hope they get cancer research funding',
    'I hope he gets cancer-free soon',
    'Nobody wants you to go through this alone',
    'Nobody wants you to feel like a burden',
    'Nobody loves you like your mum does',
    'nobody loves you more than I do',
    'Nobody loves you any less for crying',
    'Nobody wants you to have to face this alone',
    "Nobody wants you to think you're a burden",
    'Nobody wants you to leave the group',
    'I hope she gets cancer counselling',
    "Don't worry if you freak out at the first chemo",
    'you might freak out a bit',
    'you can bitch and moan here',
    'you can bitch and vent here',
    'you can bitch about it here',
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
    'hope he gets cancer',
    'you deserve cancer',
    'they deserve cancer and worse',
    // A full stop or comma ends the wish before the word that would excuse it
    'I hope you get cancer, support is overrated',
    'I hope he gets cancer. Treatment won’t help',
    'nobody wants you here',
    'nobody wants you to live',
    'nobody wants you to come back',
    'nobody wants you to exist',
    'nobody wants you to think you matter',
    'nobody wants you to feel welcome here',
    'nobody wants you like a disease',
    'nobody likes you as a person',
    'nobody likes you like that',
    'nobody likes you as much as you think',
    'nobody likes you less than I do',
    'nobody loves you anymore',
    'nobody loves you, freak',
    'you freak',
    'you little freak',
    "you're such a freak out there",
    'you stupid bitch',
    'you stupid bitch and your family',
    // After "a" or "such" it is the insult, not the verb
    "you're such a bitch about everything",
    'you are a bitch about it',
    "you're a stupid bitch about everything",
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

  // ROT13, like the slurs, so these don't read as plain text in the source.
  // The next word only looks like a plan: "sat" as sitting, a treatment that
  // starts a new sentence or says how long, going "for" or waking "at" or "in"
  // how it feels, waking in hospital "again", living "on" as carrying on.
  it.each([
    'v pnag tb ba nal ybatre',
    'v pnag tb ba nal zber',
    'v pnag tb ba vg',
    'v pnag tb ba gbavtug',
    'v pnag tb ba fpubby vf uryy',
    'v pnag tb ba fng urer nybar',
    'v pnag tb ba fng va gur qnex nyy avtug',
    'v pnag tb ba fng jnvgvat sbe gur raq',
    'v pnag tb ba fng dhvrgyl va gur qnex',
    'v pnag tb ba fng fvyragyl',
    'v pnag tb ba fng fgvyy sbe ubhef',
    'v pnag tb ba fng ahzo nyy avtug',
    'v pnag tb ba fng gur jubyr avtug pelvat',
    'v pnag tb ba zbecuvar vfag urycvat',
    'v pnag tb ba zbecuvar yvxr guvf',
    'v pnag tb ba zbecuvar vgf gbb zhpu',
    'v pnag tb ba zbecuvar vz qbar',
    'v pnag tb ba qvnylfvf nalzber',
    'v pnag tb ba qvnylfvf sberire',
    'v pnag tb ba qvnylfvf zhpu ybatre',
    'v pnag tb ba bkltra ybatre',
    'v pnag tb ba qvnylfvf ab zber',
    'v pnag tb ba qvnylfvf sbe gur erfg bs zl yvsr',
    'v pnag tb ba fgrebvqf gur erfg bs bhe yvirf',
    'v pnag xrrc tbvat sbe zhpu ybatre',
    'v pnag xrrc tbvat sbe abguvat',
    'v qbag jnag gb jnxr hc ng nyy',
    'v qbag jnag gb jnxr hc va gur zbeavat',
    'v qbag jnag gb jnxr hc va guvf jbeyq',
    'v qbag jnag gb jnxr hc va ubfcvgny ntnva',
    'v qbag jnag gb jnxr hc va n ubfcvgny orq ntnva',
    'v qbag jnag gb jnxr hc va gur ubfcvgny rire ntnva',
    'v qbag jnag gb yvir ba guvf rnegu',
    'v qbag jnag gb yvir ba jvgubhg uvz',
    'v qbag jnag gb yvir ba zl bja nalzber',
    'v qbag jnag gb yvir arkg lrne',
  ].map(rot13))('%j is crisis', (text) => {
    expect(held(text)).toMatchObject({ action: 'hold', crisis: true })
    expect(held(text, 'private').crisis).toBe(true)
  })

  // "2" for "to", as people text it, with or without spaces (ROT13 as above)
  it.each([
    'v jnag 2 qvr',
    'v jnag2qvr',
    'fur jnagf 2 qvr',
    'v jnagrq 2 qvr',
    'jnagvat 2 qvr',
    'v qbag jnag 2 yvir',
    'v qbag jnag 2 yvir nalzber',
    'v qbag jnag 2 or nyvir',
    'v qbag jnag 2 rkvfg',
    'v qb abg jnag 2 or urer nalzber',
    'v qbag jnag 2 jnxr hc gbzbeebj',
    'ab ernfba 2 yvir',
    'vz tbvat 2 bireqbfr',
    'v jnag 2 bq',
  ].map(rot13))('%j is crisis', (text) => {
    expect(held(text)).toMatchObject({ action: 'hold', crisis: true, categories: ['selfHarm'] })
    expect(held(text, 'private').crisis).toBe(true)
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

describe('moderate — lookalike letters', () => {
  const harassment = { action: 'hold', categories: ['harassment'] }

  // A letter from another alphabet that passes for a Latin one used to hide
  // the word from every list (ROT13 and code points, as above)
  it.each([
    ['a Cyrillic і', 'xvyy lbhefrys', 'i', '\u0456'],
    ['a Cyrillic у', 'lbh vqvbg', 'y', '\u0443'],
    ['a dotless ı', 'lbh vqvbg', 'i', '\u0131'],
    ['a Greek ο', 'shpx lbh', 'o', '\u03bf'],
  ])('holds harassment written with %s', (_, phrase, letter, lookalike) => {
    const text = rot13(phrase)
    expect(held(text)).toMatchObject(harassment)
    expect(held(text.replace(letter, lookalike))).toMatchObject(harassment)
    expect(held(text.replace(letter, lookalike), 'private')).toMatchObject(harassment)
  })

  // Small capitals, capitals that pass only for capitals (Cyrillic К, Т), and
  // Lisu letters, which all look like capitals
  it.each([
    ['small capitals', '\u1d0b\u028f\ua731'],
    ['a Cyrillic К', rot13('xvyy lbhefrys').toUpperCase().replace('K', '\u041a')],
    ['a Cyrillic Т', rot13('lbh vqvbg').toUpperCase().replace('T', '\u0422')],
    ['a Lisu K', rot13('xvyy lbhefrys').replace('k', '\ua4d7')],
    ['a Lisu K in capitals', rot13('xvyy lbhefrys').toUpperCase().replace('K', '\ua4d7')],
  ])('holds harassment written with %s', (_, text) => {
    expect(held(text)).toMatchObject(harassment)
  })

  // A digit leetspeak reads as a letter, or the gaps between spaced-out
  // letters, used to leave the lookalike a word of its own. An 's after a
  // disguised word is no reason to leave it as it is either
  it.each([
    ['a leet 0', rot13('lbh vqvbg').replace('o', '0'), 'y', '\u0443'],
    ['spaced-out letters', rot13('x v y y lbhefrys'), 'i', '\u0456'],
    ["an English 's", rot13('xl') + "'s", 'y', '\u0443'],
  ])('holds harassment written with a lookalike beside %s', (_, text, letter, lookalike) => {
    expect(held(text)).toMatchObject(harassment)
    expect(held(text.replace(letter, lookalike))).toMatchObject(harassment)
  })

  // Each is dropped when the views are built, which joins the word back up, so
  // one either side of a lookalike, or one beside it, must not leave it a word
  // of its own ("reads through %s inside a word" above, for plain letters)
  it.each([
    ['a zero-width space', '\u200b'],
    ['a zero-width joiner', '\u200d'],
    ['a soft hyphen', '\u00ad'],
    ['a Hangul filler', '\u3164'],
    ['an apostrophe', "'"],
    ['a curly apostrophe', '\u2019'],
    ['a left quote', '\u2018'],
    ['a backtick', '`'],
  ])('reads a lookalike through %s', (_, c) => {
    const kill = rot13('xvyy lbhefrys')
    expect(held(kill.replace('i', `${c}\u0456${c}`))).toMatchObject(harassment)
    expect(held(kill.replace('e', `\u0435${c}`))).toMatchObject(harassment)
    expect(held(rot13('lbh vqvbg').replace('o', `\u043e${c}`))).toMatchObject(harassment)
    expect(held(rot13('lbh vqvbg').replace(' i', ` \u0456${c}`))).toMatchObject(harassment)
    expect(held(rot13('xlf').replace('k', `\u043a${c}`))).toMatchObject(harassment)
    const crisis = rot13('v jnag gb qvr').replace(/e$/, `${c}\u0435`)
    expect(held(crisis)).toMatchObject({ action: 'hold', crisis: true, categories: ['selfHarm'] })
    expect(held(crisis, 'private').crisis).toBe(true)
  })

  // A lone letter that is no word in its own alphabet, beside Latin words
  it.each([
    ['a Greek υ', '\u03c5'],
    ['an Armenian ս', '\u057d'],
  ])('holds harassment written with %s for a lone u', (_, lookalike) => {
    for (const phrase of ['shpx h', 'h e na vqvbg']) {
      const text = rot13(phrase)
      expect(held(text)).toMatchObject(harassment)
      expect(held(text.replace(/\bu\b/, lookalike))).toMatchObject(harassment)
      expect(held(text.replace(/\bu\b/, lookalike), 'private')).toMatchObject(harassment)
    }
  })

  it('holds a slur written with a Cyrillic а', () => {
    expect(held(rot13('snttbg')).categories).toContain('slur')
    expect(held(rot13('snttbg').replace('a', '\u0430')).categories).toContain('slur')
  })

  it.each([
    ['a Cyrillic е', 'v jnag gb qvr', 'e', '\u0435'],
    ['a Cyrillic і', 'xvyy zlfrys', 'i', '\u0456'],
    ['a Cyrillic о', 'v pnag tb ba', 'o', '\u043e'],
  ])('reads crisis language written with %s as crisis', (_, phrase, letter, lookalike) => {
    const text = rot13(phrase).replace(letter, lookalike)
    expect(held(rot13(phrase))).toMatchObject({ action: 'hold', crisis: true, categories: ['selfHarm'] })
    expect(held(text)).toMatchObject({ action: 'hold', crisis: true, categories: ['selfHarm'] })
    expect(held(text, 'private').crisis).toBe(true)
  })

  // People write in their own language: a word wholly in one other alphabet is
  // read as it is, even when every letter has a Latin lookalike and, read as
  // Latin, it would spell a slur (raki in Greek, "cancers" in Belarusian, also
  // typed with a Latin i)
  it.each([
    'Мама сегодня начала химиотерапию. Держитесь, мы с вами.',
    'Мама, как все прошло?',
    'Тато в лікарні, але все буде добре.',
    'Мама је у болници, али је добро.',
    'Η μητέρα μου ξεκίνησε χημειοθεραπεία σήμερα.',
    'ΚΟΥΡΑΓΙΟ ΣΕ ΟΛΟΥΣ ΣΑΣ',
    'Մայրիկս հիվանդանոցում է, բայց ամեն ինչ լավ կլինի։',
    'Мама and Dad say hi',
    // Single-letter words in a row ("А я в") read together, and stay as they are
    'А я в больнице, и у меня всё хорошо.',
    'Plan A и B',
    'Θα πιούμε ρακί απόψε',
    'ΡΑΚΙ',
    'Dad wants ρακί tonight',
    'Θα πιούμε ρακί!Cheers',
    'Розныя ракі лечаць па-рознаму',
    'Розныя ракі лечаць па-рознаму'.replace('\u0456', 'i'),
    // An English 's after a word in another language, and apostrophes inside
    // one ("м'ясо"): read as they are, not as one word with a Latin s
    'Yiayia\u2019s ρακί\u2019s the best',
    "ρακί's",
    'ρακί\u02bcs',
    "Мама's soup",
    "ракі's".replace('\u0456', 'i'),
    "Ми купили м'ясо і п'ять яблук",
    // One-letter words in their own alphabet stay as they are (Cyrillic і,
    // Greek ο). A Greek letter used as a symbol in English is read as Latin,
    // which changes nothing ("κ light chains")
    'Tom і Jerry',
    'ο Dad είναι εδώ',
    'Her κ light chains are down',
    'The γ knife worked',
  ])('publishes %j', (text) => {
    expect(held(text)).toMatchObject({ action: 'publish', crisis: false })
    expect(held(text, 'private')).toMatchObject({ action: 'publish', crisis: false })
  })

  // A pattern tried from every letter of a long word took time with the square
  // of its length (seconds at this size), and the Composer checks every keystroke
  it.each(['абвгдежзий', 'abcdefghjk'])('reads a long unbroken word quickly: %j', (letters) => {
    const start = performance.now()
    expect(held(letters.repeat(2000)).action).toBe('publish')
    expect(performance.now() - start).toBeLessThan(1000)
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

  // A browser opens a host's digits as typed: 988lifeline.org in other digits
  // is another site. Only emails and phone numbers read them as ASCII ones.
  it.each(OTHER_DIGITS)('reads a host written in %s digits as typed', (_, zero) => {
    const link = `https://${inDigits(zero, '988')}lifeline.org/help`
    expect(held(`see ${link}`).matches).toContainEqual({ category: 'spam', term: link })
    expect(held(`see ${link}`, 'private').categories).toContain('spam')
    expect(held(`see ${inDigits(zero, '988')}lifeline.org/help`, 'private').categories).toContain('spam')
    expect(held('see https://988lifeline.org/help', 'private').action).toBe('publish')
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

  // The punctuation that ends a sentence used to be read as part of the host
  it.each(
    [',', '!', ';', '*', '"', '...', "'s", '’s', ']', '}', '|', '»'].flatMap((end) => [
      `see https://www.nhs.uk${end} it helped`,
      `see www.samaritans.org${end} it helped`,
    ]),
  )('publishes a support link followed by punctuation: %j', (text) => {
    expect(held(text).action).toBe('publish')
    expect(held(text, 'private').action).toBe('publish')
  })

  it('publishes a support link in quotes', () => {
    expect(held('"https://www.nhs.uk"').action).toBe('publish')
    expect(held('“https://www.macmillan.org.uk”').action).toBe('publish')
    expect(held('«https://www.nhs.uk»').action).toBe('publish')
  })

  it.each(['https://evil.com,', 'https://evil.com|', 'see https://evil.com! now', 'see https://evil.com\\.nhs.uk, now', 'https://nhs.uk@evil.com/login,'])(
    'still holds other links followed by punctuation: %j',
    (text) => {
      expect(held(text, 'private').categories).toContain('spam')
    },
  )

  // A spam match too would keep a crisis note from being delivered
  it('reads a crisis note with a support link and a comma as crisis only', () => {
    const result = held(`${rot13('v jnag gb qvr')}. I called https://www.samaritans.org, they were kind`, 'private')
    expect(result.categories).toEqual(['selfHarm'])
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

  it.each(OTHER_DIGITS)('holds phone numbers in %s digits, as in ASCII ones', (_, zero) => {
    expect(held(`call me ${inDigits(zero, '5551234567')}`).categories).toEqual(['personalInfo'])
    expect(held(inDigits(zero, 'ring me on 020 7946 0958')).categories).toEqual(['personalInfo'])
    expect(held(`call me ${inDigits(zero, '55512')}34567`).categories).toEqual(['personalInfo'])
    expect(held(`call me ${inDigits(zero, '5551234567')}`, 'private').action).toBe('publish')
    // Dates, and support lines, read as they do in ASCII
    expect(held(inDigits(zero, 'scan on 05.10.2026 10.30')).action).toBe('publish')
    expect(held(inDigits(zero, 'Macmillan on 0808 808 00 00')).action).toBe('publish')
  })

  // Every digit set the runtime knows, the maths and fullwidth ones included
  it('reads the digits of every script as the ASCII ones', () => {
    const numbers = Intl.supportedValuesOf('numberingSystem')
      .map((system) => new Intl.NumberFormat(`en-u-nu-${system}`, { useGrouping: false }).format(5551234567))
      .filter((number) => /^\p{Nd}{10}$/u.test(number))
    expect(numbers.length).toBeGreaterThan(20)
    numbers.forEach((number) => expect(held(`call me ${number}`).categories).toEqual(['personalInfo']))
  })

  // Only the first number each pattern found used to be looked at
  it.each([
    'If it gets bad call 1-800-273-8255, or text me anytime 555-867-5309',
    'Call 1-800-273-8255 or text me 555-867-5309',
    'Samaritans 08457 909090 or me 07700 900123',
    'ACS 1-800-227-2345 or text me 555-867-5309',
  ])('holds a personal number after a crisis line: %j', (text) => {
    expect(held(text).categories).toContain('personalInfo')
  })

  it.each([
    'ring me on 020 7946 0958',
    '07700 900 123',
    '0161 496 0000',
    '0412 345 678',
    '07700-900-123',
    '02 9876 5432',
    '(03) 9876 5432',
    // For callers abroad, with the 0 dropped or kept in brackets
    'text me on +44 (0)7700 900123',
    '+44 (0) 7700 900 123',
    '+44(0)20 7946 0958',
    '+61 (0)412 345 678',
    '+61 (0) 2 9876 5432',
    '+353 (0)87 123 4567',
    '+44  (0)  7700 900123',
    '+44 7700 900123',
    '+44 07700 900123',
    '+447700900123',
  ])('holds UK and Australian numbers as people write them: %j', (text) => {
    expect(held(text).categories).toContain('personalInfo')
  })

  it.each([
    'Samaritans on 0845 790 9090',
    'Macmillan on 0808 808 00 00',
    'Cancer Research UK nurses on 0808 800 4040',
    'Marie Curie 0800 090 2309',
    'Mind 0300 123 3393',
    // The same lines written for callers abroad
    'Macmillan on +44 (0)808 808 00 00',
    'Macmillan on +44 (0)808 808 0000',
    'Macmillan on +44 808 808 0000',
    'Macmillan on +44  (0)  808 808 0000',
    'Mind +44 (0)300 123 3393',
    // US and Canadian toll-free lines
    'ACS helpline 1-800-227-2345 any time',
    'Cancer Information Service 1-800-422-6237',
    'CancerCare 1-800-813-4673',
    'Cancer Support Community 1-888-793-9355',
    '(800) 227-2345',
    '+1 800 227 2345',
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
    // Credentials written with dots or spaces
    ['Jane Doe M.D.', 'reserved'],
    ['Joy R.N.', 'reserved'],
    ['Ruth N.P.', 'reserved'],
    ['Ann Ph.D.', 'reserved'],
    ['Ann Psy.D.', 'reserved'],
    ['D.r. Ann', 'reserved'],
    ['M.D.', 'reserved'],
    ['JoyR.N.', 'reserved'],
    ['Ann M D', 'reserved'],
    ['Lynn M D', 'reserved'],
    ['Joy R. N.', 'reserved'],
    ['Ann Ph D', 'reserved'],
    ['Ann Ph. D.', 'reserved'],
    ['Ann Psy D', 'reserved'],
    ['Ann Ph.Ds', 'reserved'],
    ['Ann M.Ds', 'reserved'],
    // More than one, each with its own dots
    ['Joy R.N. B.S.N.', 'reserved'],
    ['Joy B.S.N. R.N.', 'reserved'],
    ['Ann M.D. M.P.H.', 'reserved'],
    ['Ann Ph.D. R.N.', 'reserved'],
    ['Ann Psy.D. R.N.', 'reserved'],
    ['Ann L.P.C. R.N.', 'reserved'],
    ['Jo M.S. N.P.', 'reserved'],
    // Initials before a name still spell a word with three or more, and the
    // name after them is read as any other
    ['A.D.M.I.N Fan', 'reserved'],
    ['L.P.C. Ann', 'reserved'],
    ['J. Admin', 'reserved'],
    ['M.D. Ph.D.', 'reserved'],
    ['R.N. Joy M D', 'reserved'],
    ['D.R. Patel M.D.', 'reserved'],
    ['D. r. Ann', 'reserved'],
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

  // Initials and dots in ordinary names: only a credential's own letters are
  // read as one word
  it.each([
    'J.R.', 'A.J. Fern', 'T.J. Heron', 'J D R', 'A M D Smith', 'J R Tolkien Fan', 'Mo D', 'Mo D.', 'Ty M', 'St. Clair',
    'St.Clair', "D'Angelo", 'Jo Ann', 'mum.of.two', 'R.n.B Lover', 'Ann B.A.', 'I.C.U. Mum', 'Mother of 3',
  ])('accepts %j', (name) => {
    expect(checkPenName(name)).toEqual({ ok: true, value: name })
    expect(checkPenName(name, { chat: true })).toEqual({ ok: true, value: name })
  })

  // Initials before a surname, as many South Indian names are written: two
  // capitals there are a person's, not a credential, which follows a name
  it.each([
    'D.R. Patel', 'R. N. Sharma', 'M.D. Rahim', 'N.P. Singh', 'N.P. Joy', 'D. R. Kumar', 'R.N. Sharma', 'M D Rahim',
    'M. D. Ann', 'M.D. Anderson families',
  ])('accepts the initials in %j', (name) => {
    expect(checkPenName(name)).toEqual({ ok: true, value: name })
    expect(checkPenName(name, { chat: true })).toEqual({ ok: true, value: name })
  })

  it.each(OTHER_DIGITS)('refuses a long number in %s digits, or mixed with ASCII ones', (_, zero) => {
    const names = [`Heron ${inDigits(zero, '1234567')}`, `Fern ${inDigits(zero, '07700900123')}`, `Fern ${inDigits(zero, '07700')}90012`]
    names.forEach((name) => {
      expect(checkPenName(name)).toEqual({ ok: false, problem: 'contact' })
      expect(checkPenName(name, { chat: true })).toEqual({ ok: false, problem: 'contact' })
    })
    // A short one is fine, as in ASCII
    expect(checkPenName(`Heron ${inDigits(zero, '35')}`)).toEqual({ ok: true, value: `Heron ${inDigits(zero, '35')}` })
  })

  // A number in groups has no long run, so it's left to moderate(), as in ASCII
  it.each(OTHER_DIGITS)('refuses a grouped phone number in %s digits, as in ASCII ones', (_, zero) => {
    const numbers = ['07700 900 123', '0770-090-0123', '555 123 4567']
    numbers.forEach((number) => {
      const name = `Fern ${inDigits(zero, number)}`
      expect(checkPenName(name).ok).toBe(false)
      expect(checkPenName(name)).toEqual(checkPenName(`Fern ${number}`))
      expect(checkPenName(name, { chat: true })).toEqual(checkPenName(`Fern ${number}`, { chat: true }))
    })
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
    ['Jane Doe M.D.', 'reserved'],
    ['Joy R.N. chat', 'reserved'],
    ['Ann Ph D', 'reserved'],
    ['Ann M.D. M.P.H.', 'reserved'],
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
