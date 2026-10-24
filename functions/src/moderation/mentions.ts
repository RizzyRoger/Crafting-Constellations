// @mentions: "@Pen Name" in writing, matched against the people picked for it.
// Pen names are letters (with their combining marks), numbers, spaces and
// . ' - (see penName.ts), so a name may hold spaces; it ends where the next
// character can't continue a word. A vowel sign (Hindi, Tamil, Thai) is a mark
// that continues one; the selector or keycap after an emoji is a mark that
// doesn't.
// Shared: functions decide who is pinged, the client draws the highlight.

// Must match firestore.rules (mentions list on new writing)
export const MAX_MENTIONS = 10

export interface Mentioned {
  uid: string
  penName: string
}

export interface MentionSegment {
  text: string
  uid?: string
}

const WORD = /[\p{L}\p{N}]|(?!\p{Default_Ignorable_Code_Point})[\p{Mn}\p{Mc}]/u

const continuesWord = (char: string | undefined) => char !== undefined && WORD.test(char)

// `@name` starting at `at` (the @), as a whole name, any case
const mentionAt = (text: string, at: number, penName: string) => {
  if (text[at] !== '@' || continuesWord(text[at - 1])) return false
  const end = at + 1 + penName.length
  return text.slice(at + 1, end).toLowerCase() === penName.toLowerCase() && !continuesWord(text[end])
}

export const hasMention = (text: string, penName: string) => {
  if (!penName) return false
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    if (mentionAt(text, at, penName)) return true
  }
  return false
}

// Text cut into plain runs and mentions; longer names win ("@Quiet Heron" over "@Quiet")
export const splitMentions = (text: string, people: readonly Mentioned[]): MentionSegment[] => {
  const names = [...people].filter((p) => p.penName).sort((a, b) => b.penName.length - a.penName.length)
  if (names.length === 0) return text ? [{ text }] : []

  const segments: MentionSegment[] = []
  let plainFrom = 0
  let at = text.indexOf('@')
  while (at !== -1) {
    const person = names.find((p) => mentionAt(text, at, p.penName))
    if (person) {
      if (at > plainFrom) segments.push({ text: text.slice(plainFrom, at) })
      const end = at + 1 + person.penName.length
      segments.push({ text: text.slice(at, end), uid: person.uid })
      plainFrom = end
      at = text.indexOf('@', end)
    } else {
      at = text.indexOf('@', at + 1)
    }
  }
  if (plainFrom < text.length) segments.push({ text: text.slice(plainFrom) })
  return segments
}

// Who the words really mention, by the same rule the drawing uses, so a pick
// whose name only starts a longer one ("@Quiet" in "@Quiet Heron") is left out
export const mentionedIn = (text: string, people: readonly Mentioned[]) =>
  new Set(splitMentions(text, people).flatMap((s) => (s.uid ? [s.uid] : [])))
