// A person may write at a human pace. Past it, the next notes wait for a moderator. A note is
// held once any one of its pace's limits is reached.
export type FloodLimit = { windowMs: number; max: number }
export type Pace = { log: 'stamps' | 'talkStamps'; limits: readonly FloodLimit[]; repeats?: 'talkRepeats' }

// Posts: eight in ten minutes
export const POST_PACE: Pace = { log: 'stamps', limits: [{ windowMs: 10 * 60_000, max: 8 }] }
// Talk (group talk, private notes and chats) and replies under a post send a line per Enter, so a
// quiet conversation runs to many short lines. A flood comes faster than anyone types, keeps a fast
// pace up for long, or says the same thing over and over in one place.
export const TALK_PACE: Pace = {
  log: 'talkStamps',
  limits: [
    { windowMs: 60_000, max: 20 },
    { windowMs: 10 * 60_000, max: 60 },
  ],
  repeats: 'talkRepeats',
}
const TALK_KINDS = ['groupMessage', 'dm', 'chatMessage', 'comment']
// Each pace keeps its own log, so talk doesn't use up the posts' limit, nor posts the talk's
export const paceOf = (kind: string) => (TALK_KINDS.includes(kind) ? TALK_PACE : POST_PACE)

// The same line in one place: the 21st in ten minutes waits. Someone thanking each person who
// wrote, a reply at a time, says the same thanks again and again, though seldom to more than
// twenty people in ten minutes; a flood of copies keeps on
export const REPEAT_LIMIT: FloodLimit = { windowMs: 10 * 60_000, max: 20 }
// Shorter lines ('ok', 'yes', 'thank you') come up again and again in any conversation
export const REPEAT_MIN_LETTERS = 12

// Notes written this soon after one count against it too: a burst's triggers run side by side and
// retry, in no fixed order, and its notes judged first would otherwise see none before them. A
// short limit looks a quarter of its window ahead, so quick typing judged late isn't counted twice
export const FLOOD_SKEW_MS = 60_000
// Only to bound the log: far above any burst, so trimming doesn't drop stamps a late note still needs
export const FLOOD_LOG_MAX = 500

// `writtenAt` is the note's own time, not when it is judged: after downtime a backlog is
// judged late and in any order. So the notes written in the window before it count against it,
// and those written just after it, so a burst is held the same in any order while a slow
// backlog's later notes don't count.
const countsAgainst = (writtenAt: number, windowMs: number) => (at: number) =>
  writtenAt - windowMs < at && at <= writtenAt + Math.min(FLOOD_SKEW_MS, windowMs / 4)

// The log keeps every entry within `keepMs` of the newest one, not the last ones judged
const trimmed = <T>(entries: T[], atOf: (entry: T) => number, keepMs: number) => {
  const latest = Math.max(...entries.map(atOf))
  return entries
    .filter((entry) => latest - atOf(entry) < keepMs)
    .sort((a, b) => atOf(a) - atOf(b))
    .slice(-FLOOD_LOG_MAX)
}

export const applyFlood = (previous: unknown, writtenAt: number, limits: readonly FloodLimit[]) => {
  const known = Array.isArray(previous) ? previous.filter((stamp): stamp is number => typeof stamp === 'number') : []
  const flooded = limits.some(({ windowMs, max }) => known.filter(countsAgainst(writtenAt, windowMs)).length >= max)
  const keepMs = Math.max(...limits.map(({ windowMs }) => windowMs))
  return { flooded, stamps: trimmed([...known, writtenAt], (stamp) => stamp, keepMs) }
}

// A line's fingerprint (FNV-1a) in the place it was written, from its letters and numbers: case,
// marks and spacing don't make a line new, but a new reading ('at 90', then 'at 88') does. The
// log keeps no words. None for a short line, measured in letters alone.
export const repeatKey = (place: string, text: string) => {
  const folded = text.normalize('NFKC').toLowerCase()
  if (folded.replace(/[^\p{L}]+/gu, '').length < REPEAT_MIN_LETTERS) return undefined
  const line = folded.replace(/[^\p{L}\p{N}]+/gu, '')
  return Array.from(`${place}\n${line}`).reduce((hash, char) => Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619), 2166136261) >>> 0
}

type Said = { at: number; key: number }
const isSaid = (entry: unknown): entry is Said =>
  typeof (entry as Said | null)?.at === 'number' && typeof (entry as Said | null)?.key === 'number'

// Counted by when each line was written, as applyFlood counts, so a burst of copies is held in
// any order, and a longer run in the order it was written
export const applyRepeats = (previous: unknown, writtenAt: number, key: number | undefined) => {
  const known = Array.isArray(previous) ? previous.filter(isSaid) : []
  const { windowMs, max } = REPEAT_LIMIT
  // A short line isn't counted, but the log still ages by it
  if (key === undefined) return { repeated: false, said: known.filter(({ at }) => writtenAt - at < windowMs) }
  const repeated = known.filter((line) => line.key === key && countsAgainst(writtenAt, windowMs)(line.at)).length >= max
  return { repeated, said: trimmed([...known, { at: writtenAt, key }], ({ at }) => at, windowMs) }
}

// Judges a note by its writer's logs (rateLimits/{uid}): whether it waits, and the logs to merge
// back. `place` is the collection it was written in, so news sent to each group isn't a repeat
export const judgePace = (kind: string, logs: Record<string, unknown> | undefined, note: { writtenAt: number; place: string; text: string }) => {
  const pace = paceOf(kind)
  const { flooded, stamps } = applyFlood(logs?.[pace.log], note.writtenAt, pace.limits)
  if (!pace.repeats) return { flooded, repeated: false, logs: { [pace.log]: stamps } }
  const { repeated, said } = applyRepeats(logs?.[pace.repeats], note.writtenAt, repeatKey(note.place, note.text))
  return { flooded, repeated, logs: { [pace.log]: stamps, [pace.repeats]: said } }
}
