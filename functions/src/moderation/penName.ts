import { RESERVED_NAME_WORDS } from './lexicon.js'
import { moderate } from './moderate.js'
import { normalize } from './normalize.js'

export type PenNameProblem = 'length' | 'characters' | 'mixed' | 'contact' | 'reserved' | 'crisis' | 'unkind'

export type PenNameCheck = { ok: true; value: string } | { ok: false; problem: PenNameProblem }

export const PEN_NAME_HINTS: Record<PenNameProblem, string> = {
  length: 'Between 2 and 32 characters.',
  characters: 'Letters and numbers, with spaces and . \' - only.',
  mixed: 'Keep to one alphabet, so no letter can pass for another.',
  contact: 'No emails or long numbers — a pen name keeps you private.',
  reserved: 'Pen names can’t suggest a title or role. Professionals get a licensed mark instead.',
  crisis: 'Choose a different name. If you need someone right now, there are lines below.',
  unkind: 'Choose a different name.',
}

// Phones type curly apostrophes and Unicode hyphens ("O’Neil"). Neither was
// ever allowed, so no saved name tidies any differently.
export const tidyPenName = (name: string) =>
  name.normalize('NFKC').replace(/[\u2018\u2019]/g, "'").replace(/[\u2010\u2011]/g, '-').replace(/\s+/g, ' ').trim()

// Letters and numbers, each with up to three combining marks (vowel signs in
// Hindi, Tamil or Thai stay marks after NFKC), and . ' - between
const NAME_CHARS = /^(?:[\p{L}\p{N}][\p{Mn}\p{Mc}]{0,3}|[ .'-])+$/u

// Fillers, joiners and variation selectors show as nothing: a blank name, or
// one that looks like someone else's
const HIDDEN = /\p{Default_Ignorable_Code_Point}/u

// Marks that make one letter pass for another, which no name needs: a dot
// above an i or j sits on its own dot, a dotless ı or ȷ with a dot or accent
// looks like an i or j with one, a slash or stroke laid through a letter
// copies a letter that has it ("o" and a slash for "ø"), marks made for
// symbols do the same, and the same mark twice draws as one. Read with each
// letter's own marks split off (NFD), so an "é" then an acute is one twice.
const LOOKALIKE_MARKS = /\p{Soft_Dotted}\p{M}*\u0307|[\u0131\u0237]\p{M}|[\u0334-\u0338\u20d0-\u20ff]|(\p{Mn})\1/u

// Nothing hidden or disguised, and at least one letter or number, so ".." or
// "--" isn't a name
const isMadeOfNameCharacters = (value: string) =>
  NAME_CHARS.test(value) && /[\p{L}\p{N}]/u.test(value) && !HIDDEN.test(value) && !LOOKALIKE_MARKS.test(value.normalize('NFD'))

// Alphabets with letters that pass for each other's. A name that mixes them
// looks like another ("Fеrn" or "Ѕӏоԝ River" with Cyrillic letters), or a
// title ("Аdmin"). Other scripts, such as kana or Devanagari, mix freely.
const LOOKALIKE_SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Armenian', 'Cherokee', 'Lisu'].map(
  (script) => new RegExp(`\\p{Script=${script}}`, 'u'),
)

const mixesScripts = (value: string) => LOOKALIKE_SCRIPTS.filter((script) => script.test(value)).length > 1

// A reserved word as a whole word, or its plural ("Moderators", "Admin's").
// Chat names refuse only the word itself.
const RESERVED = new RegExp(`^(?:${RESERVED_NAME_WORDS.join('|')})s?$`, 'u')
const RESERVED_SINGULAR = new RegExp(`^(?:${RESERVED_NAME_WORDS.join('|')})$`, 'u')

// Letters from other alphabets drawn the same as a Latin one: Cyrillic, Greek
// and Armenian ones ("Јоу" for "Joy", "ΑΝΝΑ" for "ANNA"), and Cherokee and
// Lisu letters, drawn as Latin capitals ("ꓮꓓꓟꓲꓠ"). Not the ones only like a
// Latin letter: Cyrillic м is a small capital, Greek ν a rounded v, so "Мама"
// isn't "Mama". A name wholly in one alphabet is someone's own writing, so it
// passes as typed and keeps its key: these are read only to find a role, and
// for the name it passes for (penNameShape).
const COPIES: Record<string, string> = {
  // Cyrillic, with the letters Serbian, Macedonian, Ukrainian, Kazakh, Komi and Kurdish add
  '\u0410': 'A', '\u0412': 'B', '\u0421': 'C', '\u0500': 'D', '\u0415': 'E', '\u041d': 'H', '\u0406': 'I', '\u0408': 'J',
  '\u041a': 'K', '\u041c': 'M', '\u041e': 'O', '\u0420': 'P', '\u051a': 'Q', '\u0405': 'S', '\u0422': 'T', '\u051c': 'W',
  '\u0425': 'X', '\u04ae': 'Y', '\u04c0': 'l', '\u0430': 'a', '\u0441': 'c', '\u0501': 'd', '\u0435': 'e', '\u04bb': 'h',
  '\u0456': 'i', '\u0458': 'j', '\u04cf': 'l', '\u043e': 'o', '\u0440': 'p', '\u051b': 'q', '\u0455': 's', '\u051d': 'w',
  '\u0445': 'x', '\u0443': 'y',
  // Greek (not the lunate sigmas, which NFKC makes a sigma)
  '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0397': 'H', '\u0399': 'I', '\u037f': 'J', '\u039a': 'K', '\u039c': 'M',
  '\u039d': 'N', '\u039f': 'O', '\u03a1': 'P', '\u03a4': 'T', '\u03a7': 'X', '\u03a5': 'Y', '\u0396': 'Z', '\u03f3': 'j',
  '\u03bf': 'o',
  // Armenian
  '\u053c': 'L', '\u0555': 'O', '\u054d': 'U', '\u0578': 'n', '\u0585': 'o', '\u057d': 'u',
  // Cherokee
  '\u13aa': 'A', '\u13f4': 'B', '\u13df': 'C', '\u13a0': 'D', '\u13ac': 'E', '\u13c0': 'G', '\u13bb': 'H', '\u13ab': 'J',
  '\u13e6': 'K', '\u13de': 'L', '\u13b7': 'M', '\u13eb': 'O', '\u13e2': 'P', '\u13a1': 'R', '\u13da': 'S', '\u13a2': 'T',
  '\u13d9': 'V', '\u13b3': 'W', '\u13c3': 'Z', '\u13a5': 'i',
  // Lisu
  '\ua4ee': 'A', '\ua4d0': 'B', '\ua4da': 'C', '\ua4d3': 'D', '\ua4f0': 'E', '\ua4dd': 'F', '\ua4d6': 'G', '\ua4e7': 'H',
  '\ua4f2': 'I', '\ua4d9': 'J', '\ua4d7': 'K', '\ua4e1': 'L', '\ua4df': 'M', '\ua4e0': 'N', '\ua4f3': 'O', '\ua4d1': 'P',
  '\ua4e3': 'R', '\ua4e2': 'S', '\ua4d4': 'T', '\ua4f4': 'U', '\ua4e6': 'V', '\ua4ea': 'W', '\ua4eb': 'X', '\ua4ec': 'Y',
  '\ua4dc': 'Z',
}
const COPY_LETTERS = new RegExp(`[${Object.keys(COPIES).join('')}]`, 'gu')

// Latin letters that NFKC leaves alone but that read as a plain one: small
// capitals, read as capitals ("ᴀdmin", "Siteᴀdmin"), the Latin alpha and
// script g ("ɑdmin"), a dotless i or j and the Latin iota ("Admın"). With
// them, the letters above, and the Cyrillic small letters drawn as small
// capitals, read as moderation reads them ("моԁ"), as are Cherokee small
// letters, drawn as small capitals of the Cherokee ones ("ꭰꭱ"). Read as plain
// letters only to find a role, so names written with them tidy and pass as
// before.
const PLAIN_LETTERS: Record<string, string> = {
  ...COPIES,
  '\u1d00': 'A', '\u0299': 'B', '\u1d04': 'C', '\u1d05': 'D', '\u1d07': 'E', '\ua730': 'F', '\u0262': 'G',
  '\u029c': 'H', '\u026a': 'I', '\u1d0a': 'J', '\u1d0b': 'K', '\u029f': 'L', '\u1d0d': 'M', '\u0274': 'N',
  '\u1d0f': 'O', '\u1d18': 'P', '\ua7af': 'Q', '\u0280': 'R', '\ua731': 'S', '\u1d1b': 'T', '\u1d1c': 'U',
  '\u1d20': 'V', '\u1d21': 'W', '\u028f': 'Y', '\u1d22': 'Z',
  '\u0251': 'a', '\u0261': 'g', '\u0131': 'i', '\u0237': 'j', '\u0269': 'i',
  '\u0432': 'b', '\u043a': 'k', '\u043c': 'm', '\u043d': 'h', '\u0442': 't', '\u04ba': 'H', '\u03c1': 'p',
}
const LOOKALIKE_LETTERS = new RegExp(`[${Object.keys(PLAIN_LETTERS).join('')}]`, 'gu')
const CHEROKEE_SMALL = /[\u13f8-\u13fd\uab70-\uabbf]/gu
// With each letter's accents split off, so one with an accent reads as its
// plain letter does ("Мӧԁ" as "Möd")
const plainLetters = (value: string) =>
  value
    .normalize('NFD')
    .replace(CHEROKEE_SMALL, (letter) => letter.toUpperCase())
    .replace(LOOKALIKE_LETTERS, (letter) => PLAIN_LETTERS[letter] ?? letter)
    .normalize('NFC')

// A small l among capitals, or spaced out with them, is drawn as a capital I
// ("ADMlN", "OFFlClAL", "A D M l N"). Read both ways, as it may be an l too
// ("lPC").
const capitalI = (value: string) =>
  value.replace(/[\p{L}\p{M}]+/gu, (word) => (/^[\p{Lu}l]+$/u.test(word) ? word.replace(/l/g, 'I') : word))

// Apostrophes that are letters, drawn as a plain or curly one: the modifier
// letter apostrophe ("OʼNeil"), the okina, the prime, the vertical line and
// the saltillo. tidyPenName leaves them, so saved names keep their key.
const APOSTROPHE_LETTERS = /[\u02b9\u02bb\u02bc\u02c8\ua78b\ua78c]/g

// The name a pen name passes for, case-blind as penNames keys are: letters
// drawn the same as a Latin one read as it, apostrophes as the plain one.
// Cyrillic "Јоу" passes for "joy"; "Анна" is its own. Accents are split off
// first and put back after, so a copied letter keeps its accent ("Јоѕе́" and
// "Јӧу" for "José" and "Jöy"). A name still claims tidyPenName lowercased,
// the key saved names and the delete confirmation keep; saveProfile also
// refuses one whose shape is someone else's key.
export const penNameShape = (name: string) =>
  tidyPenName(name)
    .normalize('NFD')
    .replace(COPY_LETTERS, (letter) => COPIES[letter] ?? letter)
    .replace(APOSTROPHE_LETTERS, "'")
    .normalize('NFC')
    .toLowerCase()

// MD, RN and NP are titles after a name ("JoyRN"). Starting a joined word
// they're something else ("MdRahim", Md for Muhammad; "RnB Lover"; "NPFan"),
// so pulling apart leaves them out there. Dr starts a name ("DrHeron").
const SHORT_FORMS = ['md', 'rn', 'np']

// The digits the words view reads as letters: "1" as "i", "4" as "a"
const readsAsLetter = (digit: string) => /^\p{L}$/u.test(normalize(digit).words)

// A number, and the digit in it that may be a letter: one digit inside a word
// ("Adm1n"), or for FIRST_LETTER the last digit of any number a word runs on
// from ("4dmin2", "24dmin"). Never where a new word starts ("Nurse1Joy").
// Both match what comes before the number first, and keep it: the letter a
// digit inside a word follows, or nothing. Not a lookbehind, which Safari
// before 16.4 can't read: the site would not load at all.
const LETTER_IN_WORD = /([\p{L}\p{M}])(\p{N})(?=[\p{L}\p{M}])(?!\p{Lu}\p{Ll})|\p{N}+/gu
const FIRST_LETTER = /()\p{N}*(\p{N})(?=[\p{L}\p{M}])(?!\p{Lu}\p{Ll})|\p{N}+/gu

// Joined words pulled apart ("SiteAdmin", "DRHeron"), and each number split
// off whole, in any case ("Nurse2Joy", "nurse2joy", "2admin", "Admin12"),
// which the words view would read as letters ("admini"). A digit caught above
// that reads as a letter stays one ("Adm1n", "Dr4gon"), and the rest of its
// number splits off ("24dmin").
const pullApart = (value: string, letters = LETTER_IN_WORD) =>
  value
    .replace(/(^|[^\p{L}\p{M}\p{N}])(\p{L}{2})(?=\p{Lu})/gu, (_, before: string, start: string) =>
      before + (SHORT_FORMS.includes(start.toLowerCase()) ? '' : start),
    )
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(letters, (match: string, before = '', letter?: string) => {
      const number = match.slice(before.length)
      if (!letter || !readsAsLetter(letter)) return `${before} ${number} `
      const rest = number.slice(0, -letter.length)
      return before + (rest ? ` ${rest} ${letter}` : letter)
    })

// Credentials written apart, with spaces ("Ann M D", "Ann Ph. D."). The joined
// view glues only three or more single letters, so two are glued here, and so
// is a short piece with no vowel ("Ph", "Psy") with the single letters after
// it, the last maybe plural ("Ph Ds"). A name ending in one initial ("Mo D")
// stays apart. The space before a run is matched too, and kept.
const LETTER_RUN = /(^|\s)(\p{L}(?: \p{L})+s?)(?!\S)/gu
const ABBREVIATION = /(^|\s)((?:(?![aeiou])\p{L}){2,3}(?: \p{L})+s?)(?!\S)/gu
const gluedApart = (words: string) =>
  [LETTER_RUN, ABBREVIATION].map((run) =>
    words.replace(run, (_, space: string, pieces: string) => space + pieces.replace(/ /g, '')),
  )

// Capitals standing alone before a name are its initials ("D.R. Patel", "R. N.
// Sharma", "M D Rahim"), not a credential, which follows a name ("Jane Doe
// M.D.") or is a title ("Dr Patel", "D.r. Ann")
const INITIALS = /^(?:\p{Lu}(?:\. ?| ))*\p{Lu}\.? (?=\p{L}{2})/u

// A digit starting a word may be a number ("1admin") or the word's first
// letter ("4dmin2"), so both are read
const readsAsRole = (value: string, reserved: RegExp, { glue = true } = {}) =>
  [value, pullApart(value), pullApart(value, FIRST_LETTER)].some((view) => {
    const { words, joined } = normalize(view)
    return [words, joined, ...(glue ? gluedApart(words) : [])].join(' ').split(' ').some((word) => reserved.test(word))
  })

// A dot between letters joins them ("R.N.", "Ph.D."), so the name is also read
// with those dots taken out. Gluing every spaced letter would run two
// credentials into one word ("Joy R.N. B.S.N." as "rnbsn"). Initials are read
// as typed, with neither: three or more still spell a word ("A.D.M.I.N Fan"),
// two stay apart.
const suggestsRole = (value: string, reserved: RegExp) => {
  const plain = plainLetters(value)
  return [...new Set([plain, capitalI(plain)])].some((letters) => {
    const named = letters.replace(INITIALS, '')
    const undotted = named.replace(/(\p{L})\.(?=\p{L})/gu, '$1')
    return (
      readsAsRole(letters, reserved, { glue: false }) ||
      [...new Set([named, undotted])].some((view) => readsAsRole(view, reserved))
    )
  })
}

// The most the pen name and chat name fields take (maxLength on each input)
const TYPED_MAX = 40

// Chat and group names ({ chat: true }) name a conversation, not a person, so
// they can't pass for someone: a plural ("Questions for doctors") or a second
// alphabet ("Мама and Dad") is fine there. A role word, or one word that mixes
// alphabets ("Аdmin"), still isn't.
export const checkPenName = (input: string, { chat = false } = {}): PenNameCheck => {
  const value = tidyPenName(input)
  // What the name says comes before anything wrong with it as a name: crisis
  // language gets resources, not "choose another", even when it is too long.
  // Read only up to what the name fields let anyone type, which keeps
  // moderate() off a name of any size.
  const verdict = value.length <= TYPED_MAX ? moderate(value, { context: 'public' }) : undefined
  if (verdict?.crisis) return { ok: false, problem: 'crisis' }
  if (value.length < 2 || value.length > 32) return { ok: false, problem: 'length' }
  if (!isMadeOfNameCharacters(value)) return { ok: false, problem: 'characters' }
  if (chat ? value.split(' ').some(mixesScripts) : mixesScripts(value)) return { ok: false, problem: 'mixed' }
  // In any script's digits, as Arabic, Persian or Hindi keyboards type them
  if (/\p{Nd}{6,}/u.test(value)) return { ok: false, problem: 'contact' }

  if (suggestsRole(value, chat ? RESERVED_SINGULAR : RESERVED)) return { ok: false, problem: 'reserved' }
  if (verdict?.action === 'hold') return { ok: false, problem: 'unkind' }
  return { ok: true, value }
}

// Quiet, unremarkable suggestions: an adjective and a thing from a walk
const ADJECTIVES = [
  'Quiet', 'Slow', 'Grey', 'Soft', 'Late', 'Still', 'Low', 'Pale', 'Steady', 'Small',
  'Patient', 'Gentle', 'Mild', 'Plain', 'Faint', 'Warm', 'Cool', 'Even', 'Tidal', 'Dusk',
]
const NOUNS = [
  'Heron', 'River', 'Wren', 'Harbor', 'Fern', 'Lantern', 'Pebble', 'Moth', 'Willow', 'Tide',
  'Sparrow', 'Meadow', 'Cedar', 'Kettle', 'Thistle', 'Ember', 'Marsh', 'Finch', 'Birch', 'Cove',
]

export const suggestPenName = (rand: () => number = Math.random) =>
  `${ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]} ${NOUNS[Math.floor(rand() * NOUNS.length)]}`
