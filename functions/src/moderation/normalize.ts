// Text normalisation for matching. Several views of the same text, and a
// pattern that matches any one of them counts:
// - raw:   NFKC + lowercase, invisible characters stripped, for links. An
//          ideographic full stop is a dot, as it is in a browser's address
//          bar ("evil。com"). Digits stay as typed, as a browser reads a
//          host: 988lifeline.org in Devanagari digits is another site.
// - digits: raw, but digits from every script read as the ASCII ones, for
//          emails and phone numbers. The views below are read from it.
// - words: diacritics stripped, leetspeak folded, long letter runs
//          collapsed to two, punctuation → single spaces. A !, |, @ or $ that
//          ends a word is punctuation here ("I want to die!"), not a letter.
// - joined: runs of spaced-out single letters glued back together
//          ("k i l l" → "kill"), to catch deliberate spacing
// - unmarked: words, but an @ that starts a word is dropped instead of read
//          as "a": "you @idiot" reads like "you idiot", while words still
//          catches "@ss". @mentions put @ in front of names all the time.
//          A !, | or $ is always punctuation here ("die!nobody",
//          "yourself!1"). An @ between letters stays a letter, so an email
//          address like kms@… does not read as "kms".
// - folded: words, but a $ or @ is a letter even at the end of a word
//          ("ky$"). A ! or | that ends a word still ends the sentence: "on
//          holiday!" is not "on holidayi".
// - leet:  words, but every leet character is a letter, even a ! or | at the
//          end of a word. Only for slurs: one ends in "i".
// - squeezed: words, but long letter runs collapse to one ("dieeee" → "die");
//          words keeps two for "killlll" → "kill"
// - clauses: words, one clause per line, so a pattern can tell
//          "I can't go on. The pain…" from "I can't go on the trial"

// Format and default-ignorable characters: zero-width spaces and joiners,
// direction marks and isolates, invisible operators, fillers, variation
// selectors. One inside a word looks like nothing but splits it for matching.
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu
// Curly quotes and the like, read as an apostrophe
const QUOTES = /[\u2018\u2019\u02bc`´]/g
const MARKS = /\p{M}+/gu

// Digits from other scripts, read as the ASCII ones: a phone number typed on
// an Arabic, Persian or Hindi keyboard. Unicode gives each script its digits
// 0 to 9 in a row (the maths sets sit back to back, ten at a time), so a
// digit's value is how far it is from the start of its run, less whole tens.
const DIGIT = /\p{Nd}/u
const OTHER_DIGIT = /(?![0-9])\p{Nd}/gu
const runStart = (point: number): number => (DIGIT.test(String.fromCodePoint(point - 1)) ? runStart(point - 1) : point)
const asciiDigit = (digit: string) => {
  const point = digit.codePointAt(0) ?? 0
  return String((point - runStart(point)) % 10)
}

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
}

const foldLeet = (text: string) => text.replace(/[0134579!|@$]/g, (c) => LEET[c] ?? c)

// A !, |, @ or $ (or a run of them) straight after a letter or digit and
// before none: "die!", "yourself$"
const WORD_END = /([\p{L}\p{N}])[!|@$]+(?![\p{L}\p{N}])/gu

const foldInWord = (text: string) => foldLeet(text.replace(WORD_END, '$1 '))

// A ! or | that ends a word, and anything after it, once any $ or @ standing
// for its last letters is read: "holiday!", "ky$!", "die|$"
const BANG_END = /([\p{L}\p{N}][@$]*)[!|][!|@$]*(?![\p{L}\p{N}])/gu

// A number and "kms" is a distance ("40 kms away"), not "kill myself". After
// "want" or "going", a 2 is "to" unless a distance follows: "I want 2 kms"
// stays, "going 2 kms down the road" goes.
const DISTANCE =
  /\b((?:wants?|wanna|going|gonna) 2\s*km'?s)\b(?! (?:away|down|up|along|further|more|from|to|round|each|a day)\b)|\d(?:[\d.,]*\d)?\s*km'?s\b/gu

// Punctuation that ends a word, a dash, a line break or an emoji ends a
// clause: "I can't go on 😭 the pain…". So does a full stop, ! or ? with the
// space left out ("go on.The pain"), but only as extra lines on top: a ! can
// also be an "i" inside a word ("l!ve"), and splitting there alone would lose
// the clause it belongs to.
const CLAUSE_END = /[.,;:!?-]+(?![\p{L}\p{N}])|[\n\u2013\u2014\p{Emoji_Presentation}]/gu
const TIGHT_END = /[.!?]+(?=\p{L})/gu

export interface Normalized {
  raw: string
  digits: string
  words: string
  joined: string
  unmarked: string
  folded: string
  leet: string
  squeezed: string
  clauses: string
}

// An @ with no letter or digit before it and one after it: the start of a mention
const WORD_AT = /(^|[^\p{L}\p{N}])@(?=[\p{L}\p{N}])/gu

const wordsOf = (text: string, { fold = foldInWord, runs = '$1$1' } = {}) =>
  fold(text.normalize('NFD').replace(MARKS, ''))
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/(\p{L})\1{2,}/gu, runs)
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// Letters NFKC leaves alone that pass for plain Latin ones: from the Cyrillic,
// Greek, Armenian, Cherokee and Lisu alphabets ("Fеrn" with a Cyrillic е), and
// Latin small capitals, the Latin alpha and script g, a dotless i or j and the
// Latin iota. Capitals are read before lowercasing: Greek Ν is N, its ν a v.
const LOOKALIKES: Record<string, string> = {
  // Cyrillic, with the Serbian, Macedonian, Kazakh, Komi and Kurdish letters
  '\u0410': 'A', '\u0430': 'a', '\u0412': 'B', '\u0432': 'b', '\u0415': 'E', '\u0435': 'e', '\u041a': 'K',
  '\u043a': 'k', '\u041c': 'M', '\u043c': 'm', '\u041d': 'H', '\u043d': 'h', '\u041e': 'O', '\u043e': 'o',
  '\u0420': 'P', '\u0440': 'p', '\u0421': 'C', '\u0441': 'c', '\u0422': 'T', '\u0442': 't', '\u0423': 'Y',
  '\u0443': 'y', '\u0425': 'X', '\u0445': 'x', '\u0405': 'S', '\u0455': 's', '\u0406': 'I', '\u0456': 'i',
  '\u0408': 'J', '\u0458': 'j', '\u04ba': 'H', '\u04bb': 'h', '\u04ae': 'Y', '\u04af': 'y', '\u04c0': 'l',
  '\u04cf': 'l', '\u0500': 'D', '\u0501': 'd', '\u051a': 'Q', '\u051b': 'q', '\u051c': 'W', '\u051d': 'w',
  // Greek
  '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0396': 'Z', '\u0397': 'H', '\u0399': 'I', '\u039a': 'K',
  '\u039c': 'M', '\u039d': 'N', '\u039f': 'O', '\u03a1': 'P', '\u03a4': 'T', '\u03a5': 'Y', '\u03a7': 'X',
  '\u03b1': 'a', '\u03b3': 'y', '\u03b9': 'i', '\u03ba': 'k', '\u03bd': 'v', '\u03bf': 'o', '\u03c1': 'p',
  '\u03c4': 't', '\u03c5': 'u', '\u03c7': 'x', '\u03f9': 'C', '\u03f2': 'c', '\u037f': 'J', '\u03f3': 'j',
  // Armenian
  '\u0555': 'O', '\u0585': 'o', '\u054d': 'U', '\u057d': 'u', '\u0578': 'n', '\u0570': 'h', '\u0581': 'g',
  '\u0566': 'q', '\u053c': 'L',
  // Cherokee
  '\u13aa': 'A', '\u13f4': 'B', '\u13df': 'C', '\u13a0': 'D', '\u13ac': 'E', '\u13c0': 'G', '\u13bb': 'H',
  '\u13ab': 'J', '\u13e6': 'K', '\u13de': 'L', '\u13b7': 'M', '\u13eb': 'O', '\u13e2': 'P', '\u13a1': 'R',
  '\u13da': 'S', '\u13a2': 'T', '\u13d9': 'V', '\u13b3': 'W', '\u13c3': 'Z', '\u13a5': 'i',
  // Lisu
  '\ua4d0': 'B', '\ua4d1': 'P', '\ua4d3': 'D', '\ua4d4': 'T', '\ua4d6': 'G', '\ua4d7': 'K', '\ua4d9': 'J',
  '\ua4da': 'C', '\ua4dc': 'Z', '\ua4dd': 'F', '\ua4df': 'M', '\ua4e0': 'N', '\ua4e1': 'L', '\ua4e2': 'S',
  '\ua4e3': 'R', '\ua4e6': 'V', '\ua4e7': 'H', '\ua4ea': 'W', '\ua4eb': 'X', '\ua4ec': 'Y', '\ua4ee': 'A',
  '\ua4f0': 'E', '\ua4f2': 'I', '\ua4f3': 'O', '\ua4f4': 'U',
  // Latin
  '\u1d00': 'a', '\u0299': 'b', '\u1d04': 'c', '\u1d05': 'd', '\u1d07': 'e', '\ua730': 'f', '\u0262': 'g',
  '\u029c': 'h', '\u026a': 'i', '\u1d0a': 'j', '\u1d0b': 'k', '\u029f': 'l', '\u1d0d': 'm', '\u0274': 'n',
  '\u1d0f': 'o', '\u1d18': 'p', '\ua7af': 'q', '\u0280': 'r', '\ua731': 's', '\u1d1b': 't', '\u1d1c': 'u',
  '\u1d20': 'v', '\u1d21': 'w', '\u028f': 'y', '\u1d22': 'z', '\u0251': 'a', '\u0261': 'g', '\u0131': 'i',
  '\u0237': 'j', '\u0269': 'i',
}
const LOOKALIKE = new RegExp(`[${Object.keys(LOOKALIKES).join('')}]`, 'gu')

const LATIN = /\p{Script=Latin}/u
const OTHER_ALPHABETS = ['Cyrillic', 'Greek', 'Armenian', 'Cherokee', 'Lisu'].map(
  (script) => new RegExp(`\\p{Script=${script}}`, 'u'),
)

// A letter still not Latin once lookalikes are read
const OTHER_LETTER = /(?![\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}])\p{L}/u

// A Latin word with lookalikes in it ("Fеrn"), or one that mixes two other
// alphabets. A word wholly in one other alphabet is writing in that language,
// even when every letter has a lookalike: Greek "ρακί" is raki. A Latin i or j
// doesn't count, as Ukrainian and Belarusian writers often type one for і,
// and Serbian ones for ј ("кiт").
const isDisguised = (word: string) => {
  const letters = word.replace(/[ijIJ]/g, '')
  return LATIN.test(letters) || OTHER_ALPHABETS.filter((alphabet) => alphabet.test(letters)).length > 1
}

const toLatin = (text: string) => text.replace(LOOKALIKE, (letter) => LOOKALIKES[letter] ?? letter)

const readWord = (word: string) => {
  const latin = toLatin(word)
  return isDisguised(word) && !OTHER_LETTER.test(latin) ? latin : word
}

// A word is letters and their marks, and the digits, @ and $ leetspeak reads
// as letters: "у0u" is one word, not a lone у. Not a ! or |, which also end a
// sentence: Greek "ρακί!Cheers" is two words. Three or more standing alone
// are one word too, as the joined view reads them: "k і l l".
const IN_WORD = '\\p{L}\\p{M}\\p{N}@$'
const WORD = new RegExp(`[${IN_WORD}]+`, 'gu')
const ALONE = `(?<![${IN_WORD}])[\\p{L}\\p{N}@$]\\p{M}*(?![${IN_WORD}])`
const SPACED_OUT = new RegExp(`${ALONE}(?:[^${IN_WORD}]+${ALONE}){2,}`, 'gu')

// Pieces of a word joined by apostrophes, which the word views drop: "k'і'll"
// reads "kіll" there, so it is read whole here too. Not an English 's after a
// word in another language: "ρακί's" is raki's, not one disguised word. Only
// from the start of a word: tried from every letter of a long one, it took
// time with the square of its length.
const GLUED = new RegExp(`(?<![${IN_WORD}])[${IN_WORD}]+(?:'[${IN_WORD}]+)+`, 'gu')
const readGlued = (word: string) => {
  const stem = word.replace(/'s$/i, '')
  return stem !== word && !isDisguised(stem) ? word : readWord(word)
}

// A lone letter beside a Latin word, from an alphabet in which it is no word of
// its own: Greek υ in "υ r". Cyrillic has many one-letter words (у, с, к, о,
// в, а, я, і), and Greek ο and α are words too, so those stay as they are.
const ONE_LETTER_WORD = /[\p{Script=Cyrillic}\u03bf\u03b1\u039f\u0391]/u
const WORDS_AND_GAPS = new RegExp(`([${IN_WORD}]+)`, 'u')
const readLoneLetters = (text: string) => {
  const parts = text.split(WORDS_AND_GAPS)
  const isLone = (part: string, at: number) =>
    at % 2 === 1 && part.replace(MARKS, '').length === 1 && !ONE_LETTER_WORD.test(part)
  const besideLatin = (at: number) => [parts[at - 2], parts[at + 2]].some((word) => word && LATIN.test(word))
  return parts.map((part, at) => (isLone(part, at) && besideLatin(at) ? toLatin(part) : part)).join('')
}

// The text with lookalike letters read as the Latin ones they pass for, in
// each disguised word they spell out in Latin. A word with any other letter
// of its alphabet ("Pаспорт") stays as it is. For matching only, never shown.
// Invisible characters go first, as normalize drops them and joins the word
// back up: one either side of a lookalike must not make it a word of its own.
// Read with each letter's marks split off (NFD), so an accent doesn't hide the
// letter under it. Lone letters go last, beside words already read as Latin.
export const readAsLatin = (text: string) =>
  readLoneLetters(
    text
      .normalize('NFKC')
      .replace(INVISIBLE, '')
      .replace(QUOTES, "'")
      .normalize('NFD')
      .replace(SPACED_OUT, readWord)
      .replace(GLUED, readGlued)
      .replace(WORD, readWord),
  )

export const normalize = (text: string): Normalized => {
  const raw = text.normalize('NFKC').replace(INVISIBLE, '').replace(QUOTES, "'").replace(/\u3002/g, '.').toLowerCase()
  const digits = raw.replace(OTHER_DIGIT, asciiDigit)
  const prose = digits.replace(DISTANCE, (_, wish?: string) => wish ?? ' ')
  const words = wordsOf(prose)
  const joined = words.replace(/\b(?:\p{L} ){2,}\p{L}\b/gu, (run) => run.replace(/ /g, ''))
  const unmarked = wordsOf(prose.replace(WORD_AT, '$1').replace(/[!|$]+/g, ' '))
  const folded = wordsOf(prose, { fold: (t) => foldLeet(t.replace(BANG_END, '$1 ')) })
  const leet = wordsOf(prose, { fold: foldLeet })
  const squeezed = wordsOf(prose, { runs: '$1' })
  const loose = prose.split(CLAUSE_END)
  const tight = loose.flatMap((clause) => clause.split(TIGHT_END))
  const clauses = [...new Set([...loose, ...tight].map((clause) => wordsOf(clause)).filter(Boolean))].join('\n')
  return { raw, digits, words, joined, unmarked, folded, leet, squeezed, clauses }
}
