// Text normalisation for matching. Several views of the same text, and a
// pattern that matches any one of them counts:
// - raw:   NFKC + lowercase, invisible characters stripped, for links,
//          emails and phone numbers. An ideographic full stop is a dot, as
//          it is in a browser's address bar ("evil。com")
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
const MARKS = /\p{M}+/gu

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

export const normalize = (text: string): Normalized => {
  const raw = text.normalize('NFKC').replace(INVISIBLE, '').replace(/[\u2018\u2019\u02bc`´]/g, "'").replace(/\u3002/g, '.').toLowerCase()
  const prose = raw.replace(DISTANCE, (_, wish?: string) => wish ?? ' ')
  const words = wordsOf(prose)
  const joined = words.replace(/\b(?:\p{L} ){2,}\p{L}\b/gu, (run) => run.replace(/ /g, ''))
  const unmarked = wordsOf(prose.replace(WORD_AT, '$1').replace(/[!|$]+/g, ' '))
  const folded = wordsOf(prose, { fold: (t) => foldLeet(t.replace(BANG_END, '$1 ')) })
  const leet = wordsOf(prose, { fold: foldLeet })
  const squeezed = wordsOf(prose, { runs: '$1' })
  const loose = prose.split(CLAUSE_END)
  const tight = loose.flatMap((clause) => clause.split(TIGHT_END))
  const clauses = [...new Set([...loose, ...tight].map((clause) => wordsOf(clause)).filter(Boolean))].join('\n')
  return { raw, words, joined, unmarked, folded, leet, squeezed, clauses }
}
