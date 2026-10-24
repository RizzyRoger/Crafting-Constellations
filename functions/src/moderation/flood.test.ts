import { describe, expect, it } from 'vitest'
import { applyFlood, applyRepeats, FLOOD_LOG_MAX, FLOOD_SKEW_MS, judgePace, paceOf, POST_PACE, REPEAT_LIMIT, repeatKey, TALK_PACE, type FloodLimit } from './flood'

const POSTS = POST_PACE.limits
const TALK = TALK_PACE.limits
const [{ windowMs: FLOOD_WINDOW_MS, max: FLOOD_MAX }] = POSTS
const now = 1_000_000

// Notes judged one after another in this order, as the backend catches up; the ones held
const held = (order: number[], limits: readonly FloodLimit[] = POSTS) =>
  order.reduce<{ log: unknown; held: number[] }>(
    ({ log, held }, writtenAt) => {
      const next = applyFlood(log, writtenAt, limits)
      return { log: next.stamps, held: next.flooded ? [...held, writtenAt] : held }
    },
    { log: undefined, held: [] },
  ).held

// Notes written `gaps` seconds apart
const spaced = (gaps: number[]) => gaps.reduce<number[]>((lines, gap) => [...lines, (lines.length > 0 ? lines[lines.length - 1] : now) + gap * 1000], [])

// Every seventh note, wrapping round: each one once, for any count seven doesn't divide
const scattered = <T>(written: T[]) => written.map((_, i) => written[(i * 7) % written.length])

describe('write flood', () => {
  it('allows a short run of notes', () => {
    const stamps = Array.from({ length: FLOOD_MAX - 1 }, (_, i) => now - i * 1000)
    expect(applyFlood(stamps, now, POSTS).flooded).toBe(false)
  })

  it('holds the note that crosses the limit', () => {
    const stamps = Array.from({ length: FLOOD_MAX }, (_, i) => now - i * 1000)
    const next = applyFlood(stamps, now, POSTS)
    expect(next.flooded).toBe(true)
    expect(next.stamps).toHaveLength(FLOOD_MAX + 1)
  })

  it('forgets notes older than the window', () => {
    const stale = Array.from({ length: FLOOD_MAX }, () => now - FLOOD_WINDOW_MS - 1)
    expect(applyFlood(stale, now, POSTS).flooded).toBe(false)
  })

  it('ignores a missing or junk log', () => {
    expect(applyFlood(undefined, now, POSTS).flooded).toBe(false)
    expect(applyFlood(['nope', now], now, POSTS).stamps).toEqual([now, now])
  })

  it('counts notes written well after this one as no flood of its own, however late it is judged', () => {
    const later = Array.from({ length: FLOOD_MAX }, (_, i) => now + FLOOD_SKEW_MS + (i + 1) * 1000)
    expect(applyFlood(later, now, POSTS).flooded).toBe(false)
  })

  it('counts the notes of its own burst judged before it, even ones written just after it', () => {
    const later = Array.from({ length: FLOOD_MAX }, (_, i) => now + (i + 1) * 1000)
    expect(applyFlood(later, now, POSTS).flooded).toBe(true)
  })

  it('keeps every stamp in the window when an older note is judged last', () => {
    const later = Array.from({ length: 60 }, (_, i) => now + (i + 1) * 1000)
    expect(applyFlood(later, now, POSTS).stamps).toEqual([now, ...later])
  })

  it('keeps the newest stamps once the log is full', () => {
    const later = Array.from({ length: FLOOD_LOG_MAX }, (_, i) => now + (i + 1) * 1000)
    expect(applyFlood(later, now, POSTS).stamps).toEqual(later)
  })

  it('judges a slow backlog as it was written, in any order', () => {
    // Twelve notes three minutes apart, written while the backend was off
    const written = Array.from({ length: 12 }, (_, i) => now + i * 3 * 60_000)
    const shuffled = [5, 0, 11, 3, 8, 1, 10, 6, 2, 9, 4, 7].map((i) => written[i])
    expect(held(written)).toEqual([])
    expect(held([...written].reverse())).toEqual([])
    expect(held(shuffled)).toEqual([])
  })

  it('still holds a real burst judged in the order it was written', () => {
    const written = Array.from({ length: 12 }, (_, i) => now + i * 10_000)
    expect(held(written)).toEqual(written.slice(FLOOD_MAX))
  })

  it('holds a burst judged out of order just as much', () => {
    // Sixty notes a second apart, judged in two batches of thirty, each newest first
    const written = Array.from({ length: 60 }, (_, i) => now + i * 1000)
    const first = written.slice(0, 30).reverse()
    const second = written.slice(30).reverse()
    expect(held([...first, ...second])).toEqual([...first.slice(FLOOD_MAX), ...second])
  })

  it('publishes the same few of a burst whatever order its triggers run in', () => {
    // Forty notes from a script, 50ms apart; triggers run side by side and retry, in no fixed order
    const written = Array.from({ length: 40 }, (_, i) => now + i * 50)
    const shuffled = [17, 3, 38, 0, 25, 9, 31, 12, 6, 22, 39, 1, 28, 15, 34, 4, 20, 10, 36, 7, 27, 2, 33, 14, 24, 8, 37, 19, 5, 30, 11, 26, 16, 35, 13, 29, 23, 32, 18, 21].map((i) => written[i])
    for (const order of [written, [...written].reverse(), shuffled]) {
      expect(held(order)).toEqual(order.slice(FLOOD_MAX))
    }
  })
})


describe('talk flood', () => {
  it('paces talk and replies as texting and posts more slowly, each in its own log', () => {
    expect(['groupMessage', 'dm', 'chatMessage', 'comment'].map(paceOf)).toEqual([TALK_PACE, TALK_PACE, TALK_PACE, TALK_PACE])
    expect(paceOf('post')).toEqual(POST_PACE)
    expect(TALK_PACE.log).not.toBe(POST_PACE.log)
  })

  it('never holds a conversation at texting pace, in any order', () => {
    // Forty lines, one every 15 to 30 seconds: well over ten minutes of talk
    const written = spaced(Array.from({ length: 40 }, (_, i) => 15 + ((i * 7) % 16)))
    for (const order of [written, [...written].reverse(), scattered(written)]) {
      expect(held(order, TALK)).toEqual([])
    }
  })

  it('never holds someone replying under their own post once a minute for a quarter of an hour', () => {
    const post = applyFlood(undefined, now, paceOf('post').limits)
    expect(post.flooded).toBe(false)
    const replies = Array.from({ length: 15 }, (_, i) => now + (i + 1) * 60_000)
    expect(held(replies, paceOf('comment').limits)).toEqual([])
  })

  it('lets a quick run of lines through, as when news comes, and the talk after it', () => {
    // Fifteen lines three seconds apart, then a line every twenty seconds for ten minutes
    const written = spaced([...Array<number>(15).fill(3), ...Array<number>(30).fill(20)])
    for (const order of [written, scattered(written)]) {
      expect(held(order, TALK)).toEqual([])
    }
  })

  it('never holds quick typing judged late and out of order', () => {
    // Thirty lines four seconds apart: lines written up to a minute later mustn't count against a minute's limit
    const written = Array.from({ length: 30 }, (_, i) => now + i * 4000)
    for (const order of [written, [...written].reverse(), scattered(written)]) {
      expect(held(order, TALK)).toEqual([])
    }
  })

  it('still holds talk faster than anyone types, whatever order it is judged in', () => {
    // Sixty lines from a script, 50ms apart
    const written = Array.from({ length: 60 }, (_, i) => now + i * 50)
    for (const order of [written, [...written].reverse(), scattered(written)]) {
      expect(held(order, TALK)).toEqual(order.slice(20))
    }
  })

  it('holds talk that keeps up a fast pace past ten minutes', () => {
    // A line every eight seconds: under the minute's limit, but the 61st in ten minutes is held
    const written = Array.from({ length: 80 }, (_, i) => now + i * 8000)
    expect(held(written, TALK)).toEqual(written.slice(60))
  })

  it('keeps talk stamps for its longest window', () => {
    const earlier = Array.from({ length: 5 }, (_, i) => now - (6 - i) * 60_000)
    expect(applyFlood(earlier, now, TALK).stamps).toEqual([...earlier, now])
  })
})

type Line = { at: number; text: string; place?: string; kind?: string }

// Lines judged in this order, their logs merged back as content.ts does; the ones held
const judged = (lines: Line[]) =>
  lines.reduce<{ logs: Record<string, unknown>; held: Line[] }>(
    ({ logs, held }, line) => {
      const next = judgePace(line.kind ?? 'groupMessage', logs, { writtenAt: line.at, place: line.place ?? 'groups/g/messages', text: line.text })
      return { logs: { ...logs, ...next.logs }, held: next.flooded || next.repeated ? [...held, line] : held }
    },
    { logs: {}, held: [] },
  )

const CONVERSATION = [
  'Still in the waiting room.',
  'They said another hour at least.',
  'Dad is asleep now, finally.',
  'Thank you for staying up with me.',
  'The nurse came by again.',
  'Coffee from the machine is awful.',
  'She squeezed my hand!',
  'Going to try to rest a bit.',
]

describe('repeated lines', () => {
  const { max: REPEAT_MAX } = REPEAT_LIMIT
  // The same line every ten seconds, give or take its case, punctuation and emoji
  const pasted = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      at: now + i * 10_000,
      text: ['Everyone, look at my page right now.', 'EVERYONE look at my page RIGHT NOW!!', 'everyone look at my page right now 🙂'][i % 3],
    }))
  const THREAD = 'groups/g/posts/p/comments'

  it('holds the same line said over and over in one place, past twenty in ten minutes', () => {
    const copies = pasted(60)
    expect(REPEAT_MAX).toBe(20)
    expect(judged(copies).held).toEqual(copies.slice(REPEAT_MAX))
    // Judged out of order, a copy judged late sees only those written within a minute after it
    expect(judged(scattered(copies)).held.length).toBeGreaterThanOrEqual(20)
  })

  it('keeps holding it for as long as it goes on', () => {
    // Half an hour of it: under any pace, but twenty copies are all that go out
    expect(judged(pasted(180)).held).toHaveLength(180 - REPEAT_MAX)
  })

  it('forgets lines said more than ten minutes ago', () => {
    const earlier = pasted(REPEAT_MAX).map((line) => ({ ...line, at: line.at - 11 * 60_000 }))
    expect(judged([...earlier, { at: now, text: 'Everyone, look at my page right now.' }]).held).toEqual([])
  })

  it('never counts short lines, however often they come', () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ at: now + i * 10_000, text: ['ok', 'Yes!', 'Thank you ❤️'][i % 3] }))
    expect(judged(lines).held).toEqual([])
  })

  it('never holds a varied conversation', () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ at: now + i * 15_000, text: CONVERSATION[i % CONVERSATION.length] }))
    for (const order of [lines, [...lines].reverse(), scattered(lines)]) {
      expect(judged(order).held).toEqual([])
    }
  })

  it('never holds the same thanks to a few people, or news sent to each place', () => {
    const thanks = 'Thank you so much for being there for us.'
    const inTalk = Array.from({ length: 5 }, (_, i) => ({ at: now + i * 20_000, text: thanks }))
    const toEach = Array.from({ length: 12 }, (_, i) => ({ at: now + i * 20_000, text: thanks, kind: 'dm', place: `dms/a_${i}/messages` }))
    const news = Array.from({ length: 12 }, (_, i) => ({ at: now + i * 5000, text: 'Surgery went well, she is in recovery.', place: `groups/g${i}/messages` }))
    expect(judged([...inTalk, ...toEach, ...news]).held).toEqual([])
  })

  it('never holds thanks to each person who wrote, a reply at a time under their own post', () => {
    for (const thanks of ['Thank you so much ❤️', 'Thanks so much!', 'Thank you, love you all', 'Thank you so much for being there for us.']) {
      const reply = (at: number) => ({ at, text: thanks, kind: 'comment', place: THREAD })
      // Twenty well-wishers half a minute apart, in any order
      const twenty = Array.from({ length: REPEAT_MAX }, (_, i) => reply(now + i * 30_000))
      for (const order of [twenty, [...twenty].reverse(), scattered(twenty)]) {
        expect(judged(order).held).toEqual([])
      }
      // A reply every half minute, for as long as the thanks go on
      expect(judged(Array.from({ length: 60 }, (_, i) => reply(now + i * 30_000))).held).toEqual([])
    }
  })

  it('never holds updates that differ only in their numbers', () => {
    // A caregiver reading out the monitor to her brother every twenty seconds for ten minutes
    const readings = Array.from({ length: 30 }, (_, i) => ({ at: now + i * 20_000, text: `Her oxygen is at ${88 + (i % 5)} now`, kind: 'dm', place: 'dms/a_b/messages' }))
    for (const order of [readings, [...readings].reverse(), scattered(readings)]) {
      expect(judged(order).held).toEqual([])
    }
  })

  it('reads a reply thread as one place', () => {
    const replies = pasted(REPEAT_MAX + 2).map((line) => ({ ...line, kind: 'comment', place: THREAD }))
    expect(judged(replies).held).toEqual(replies.slice(REPEAT_MAX))
  })

  it('tells lines apart by their letters and numbers, and their length by letters alone', () => {
    const key = (text: string) => repeatKey('dms/a_b/messages', text)
    expect(key('EVERYONE look at my page RIGHT NOW!!')).toBe(key('Everyone, look at my page right now.'))
    expect(key('Her oxygen is at 90 now')).not.toBe(key('Her oxygen is at 88 now'))
    expect(key('Her oxygen is at ９０ now')).toBe(key('Her oxygen is at 90 now'))
    expect(key('Bed 12, room 3456789')).toBeUndefined()
  })

  it('keeps no words in the log', () => {
    const { logs } = judged(pasted(3))
    expect(JSON.stringify(logs)).not.toMatch(/look|page|everyone/i)
    expect(repeatKey('groups/g/messages', 'Everyone, look at my page right now.')).toEqual(expect.any(Number))
    expect(repeatKey('groups/g/messages', 'thank you')).toBeUndefined()
  })

  it('lets lines leave the log ten minutes after the newest, short lines too', () => {
    const key = repeatKey('groups/g/messages', 'Everyone, look at my page right now.')
    const said = [{ at: now - 11 * 60_000, key }, { at: now - 60_000, key }, { at: now + 5000, key }]
    expect(applyRepeats(said, now, undefined)).toEqual({ repeated: false, said: said.slice(1) })
    const { logs } = judged([...pasted(3), { at: now + 30 * 60_000, text: 'ok' }])
    expect(logs.talkRepeats).toEqual([])
  })

  it('ignores a missing or junk log', () => {
    const key = repeatKey('groups/g/messages', 'Everyone, look at my page right now.')
    expect(applyRepeats(undefined, now, key)).toEqual({ repeated: false, said: [{ at: now, key }] })
    expect(applyRepeats(['nope', { at: 'x', key }], now, key).said).toEqual([{ at: now, key }])
  })

  it('leaves posts to their own log', () => {
    expect(Object.keys(judgePace('post', undefined, { writtenAt: now, place: 'groups/g/posts', text: 'Update.' }).logs)).toEqual(['stamps'])
  })
})
