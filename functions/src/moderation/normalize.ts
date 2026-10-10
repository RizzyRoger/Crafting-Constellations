// Text normalisation for matching. Three views of the same text:
// - raw:   NFKC + lowercase, for links, emails and phone numbers
// - words: diacritics and invisible characters stripped, leetspeak folded,
//          long letter runs collapsed, punctuation → single spaces
// - joined: runs of spaced-out single letters glued back together
//          ("k i l l" → "kill"), to catch deliberate spacing

const INVISIBLE = /[​-‍⁠﻿­]/g
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

export interface Normalized {
  raw: string
  words: string
  joined: string
}

export const normalize = (text: string): Normalized => {
  const raw = text.normalize('NFKC').replace(INVISIBLE, '').replace(/[\u2018\u2019\u02bc`´]/g, "'").toLowerCase()
  const words = foldLeet(raw.normalize('NFD').replace(MARKS, ''))
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/(\p{L})\1{2,}/gu, '$1$1')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const joined = words.replace(/\b(?:\p{L} ){2,}\p{L}\b/gu, (run) => run.replace(/ /g, ''))
  return { raw, words, joined }
}
