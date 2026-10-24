import { MAX_MENTIONS, mentionedIn } from '@moderation'

export interface MentionQuery {
  // index of the @
  start: number
  query: string
}

// A vowel sign continues a word and an emoji's selector or keycap doesn't, as
// in functions' mentions.ts
const WORD = /[\p{L}\p{N}]|(?!\p{Default_Ignorable_Code_Point})[\p{Mn}\p{Mc}]/u

// The @name being typed at the caret: an @ that starts a word, then up to a
// pen name's length on one line. Pen names hold single spaces, so those count.
export const mentionQuery = (text: string, caret: number): MentionQuery | null => {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf('@')
  if (start === -1 || (start > 0 && WORD.test(before[start - 1]))) return null
  const query = before.slice(start + 1)
  if (query.length > 32 || /\n|\s{2}|^\s/.test(query)) return null
  return { start, query }
}

// Put "@Pen Name " where the query was, caret after it
export const insertMention = (text: string, start: number, caret: number, penName: string) => {
  const after = text.slice(caret)
  const typed = `@${penName}${after.startsWith(' ') ? '' : ' '}`
  return { text: text.slice(0, start) + typed + after, caret: start + `@${penName} `.length }
}

// Names that start with the query first, then names with a word that does; alphabetical within each
export const matchPeople = <T extends { penName: string }>(people: readonly T[], query: string, max = 6): T[] => {
  // Read the way saved names are tidied (tidyPenName): a phone types "O’Neil" with a curly
  // apostrophe. Not trimmed, so the space after a whole name still closes the list
  const q = query.normalize('NFKC').replace(/[\u2018\u2019]/g, "'").replace(/[\u2010\u2011]/g, '-').toLowerCase()
  const rank = (name: string) => {
    const lower = name.toLowerCase()
    if (lower.startsWith(q)) return 0
    return lower.split(/[\s.'-]+/).some((word) => word.startsWith(q)) ? 1 : -1
  }
  return people
    .map((person) => ({ person, rank: rank(person.penName) }))
    .filter((match) => match.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.person.penName.localeCompare(b.person.penName))
    .slice(0, max)
    .map((match) => match.person)
}

// The picks (uid to pen name) whose @name is still in the words
export const picksIn = (text: string, picked: ReadonlyMap<string, string>): ReadonlyMap<string, string> => {
  const named = mentionedIn(text, [...picked].map(([uid, penName]) => ({ uid, penName })))
  return new Map([...picked].filter(([uid]) => named.has(uid)))
}

// The picked people whose @name is still in the words, as the server will check
export const keptMentions = (text: string, picked: ReadonlyMap<string, string>) => [...picksIn(text, picked).keys()].slice(0, MAX_MENTIONS)

// A key the IME is using: still composing, or (Safari) the Enter that confirmed
// it, which arrives just after compositionend with keyCode 229
export const imeKey = (e: { isComposing: boolean; keyCode: number }) => e.isComposing || e.keyCode === 229
