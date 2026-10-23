import { describe, expect, it, vi } from 'vitest'
import { arrivalNote, nextArrivals, showsSupport, type Arrival, type Seen } from './arrivals'
import { mergeLive } from './live'
import type { Message } from './types'

vi.mock('./firebase', () => ({ db: {} }))

const at = (ms: number) => ({ toMillis: () => ms })
const msg = (id: string, authorUid: string, ms: number | null, text = `words ${id}`, extra: Partial<Arrival> = {}): Arrival => ({
  id,
  authorUid,
  createdAt: ms === null ? null : at(ms),
  text,
  ...(authorUid === 'me' ? {} : { author: { penName: `Pen ${authorUid}` } }),
  ...extra,
})

type Step = { items: Arrival[]; opening: boolean }

// Feed renders through in order, as the conversation would, and keep each step's result
const steps = (feed: Step[], me = 'me') => {
  let seen: Seen = null
  return feed.map(({ items, opening }) => {
    const next = nextArrivals(seen, items, opening, me)
    seen = next.seen
    return next
  })
}
const play = (feed: Step[], me = 'me') => steps(feed, me).map(({ fresh }) => fresh.map((item) => item.id))
const say = (feed: Step[], me = 'me') => steps(feed, me).map((next) => arrivalNote(next, me))

const history = [msg('h1', 'sam', 1), msg('h2', 'ana', 2), msg('h3', 'me', 3)]
const heavy = (id: string, ms: number) => msg(id, 'me', ms, 'I cannot do this', { status: 'held', heldReason: 'crisis' })

// useLiveContent's two lists (published, and mine) landing one at a time, merged as it
// merges them. A conversation opens until each has answered from the server: an answer
// from the cache shows, but can hold only what the other list brought there
const row = (id: string, authorUid: string, ms: number, extra: Partial<Arrival> = {}) =>
  ({ path: `groups/g/messages/${id}`, status: 'published', ...msg(id, authorUid, ms, `words ${id}`, extra) }) as Message
const open = (landings: { pub?: Message[]; mine?: Message[]; cached?: boolean }[], max: number): Step[] => {
  let pub: Message[] | undefined
  let mine: Message[] | undefined
  let synced = { pub: false, mine: false }
  return landings.map((landing) => {
    pub = landing.pub ?? pub
    mine = landing.mine ?? mine
    synced = {
      pub: synced.pub || (Boolean(landing.pub) && !landing.cached),
      mine: synced.mine || (Boolean(landing.mine) && !landing.cached),
    }
    return { items: mergeLive(pub ?? [], mine ?? [], { direction: 'asc', max }), opening: !synced.pub || !synced.mine }
  })
}

describe('nextArrivals', () => {
  it('says nothing about the history a conversation opens with', () => {
    expect(play([{ items: [], opening: true }, { items: history, opening: false }])).toEqual([[], []])
  })

  it('says nothing when the history was already there on the first render', () => {
    expect(play([{ items: history, opening: false }])).toEqual([[]])
  })

  it('says nothing while it opens in two batches, published first and mine after', () => {
    const published = [msg('h1', 'sam', 1), msg('h2', 'ana', 2)]
    expect(
      play([
        { items: [], opening: true },
        { items: published, opening: true },
        { items: history, opening: false },
      ]),
    ).toEqual([[], [], []])
  })

  it('tells of a message from someone else that arrives once it is open', () => {
    expect(
      play([
        { items: [], opening: true },
        { items: history, opening: false },
        { items: [...history, msg('n1', 'sam', 4)], opening: false },
      ]),
    ).toEqual([[], [], ['n1']])
  })

  it('tells of the first message in a conversation that opened empty', () => {
    expect(
      play([
        { items: [], opening: false },
        { items: [msg('n1', 'sam', 4)], opening: false },
      ]),
    ).toEqual([[], ['n1']])
  })

  it('says nothing of my own writing, pending or published', () => {
    const pending = msg('n1', 'me', null, 'hi', { status: 'pending' })
    const published = msg('n1', 'me', 4, 'hi', { status: 'published' })
    expect(
      say([
        { items: history, opening: false },
        { items: [...history, pending], opening: false },
        { items: [...history, published], opening: false },
      ]),
    ).toEqual([null, null, null])
  })

  it('says nothing when a message it has already seen only changes', () => {
    const changed = [msg('h1', 'sam', 1, 'edited'), ...history.slice(1)]
    expect(
      play([
        { items: history, opening: false },
        { items: changed, opening: false },
      ]),
    ).toEqual([[], []])
  })

  it('says nothing of an older message sliding back into a full window', () => {
    const window = [msg('h2', 'ana', 2), msg('h3', 'sam', 3), msg('h4', 'ana', 4)]
    // h3 withdrawn: the query's limit lets h1, from before the window, back in at the top
    const backfilled = [msg('h1', 'sam', 1), msg('h2', 'ana', 2), msg('h4', 'ana', 4)]
    expect(
      play([
        { items: window, opening: false },
        { items: backfilled, opening: false },
      ]),
    ).toEqual([[], []])
  })

  it('tells of a held message published late, among ones already seen', () => {
    const late = [msg('h1', 'sam', 1), msg('late', 'ana', 1.5), ...history.slice(1)]
    expect(
      play([
        { items: history, opening: false },
        { items: late, opening: false },
      ]),
    ).toEqual([[], ['late']])
  })

  it('treats another conversation opening in the same place as history again', () => {
    const other = [msg('o1', 'kit', 10), msg('o2', 'kit', 11)]
    expect(
      play([
        { items: history, opening: false },
        { items: [], opening: true },
        { items: other, opening: false },
        { items: [...other, msg('o3', 'kit', 12)], opening: false },
      ]),
    ).toEqual([[], [], [], ['o3']])
  })
})

// The chat list used to be live, so the crisis card on a message was read out as it came
// up. It isn't now, so the announcer has to say so itself
describe('support lines', () => {
  it('follows where Item shows a crisis card', () => {
    expect(showsSupport(heavy('n1', 4), 'me')).toBe(true)
    expect(showsSupport(msg('n1', 'me', 4, 'x', { status: 'held', heldReason: 'review' }), 'me')).toBe(false)
    expect(showsSupport(msg('n1', 'me', 4, 'x', { status: 'published', crisis: true }), 'me')).toBe(true)
    expect(showsSupport(msg('n1', 'sam', 4, 'x', { status: 'published', crisis: true }), 'me')).toBe(true)
    expect(showsSupport(msg('n1', 'sam', 4, 'x', { status: 'published' }), 'me')).toBe(false)
  })

  it('tells me when what I just wrote is held because it sounds heavy', () => {
    const pending = msg('n1', 'me', 4, 'I cannot do this', { status: 'pending' })
    expect(
      say([
        { items: history, opening: false },
        { items: [...history, pending], opening: false },
        { items: [...history, heavy('n1', 4)], opening: false },
      ]),
    ).toEqual([null, null, 'Support lines are beside what you wrote'])
  })

  it('tells me when what I wrote in private is delivered with support lines', () => {
    const pending = msg('n1', 'me', 4, 'I cannot do this', { status: 'pending' })
    const delivered = { ...pending, status: 'published', crisis: true }
    expect(
      say([
        { items: history, opening: false },
        { items: [...history, pending], opening: false },
        { items: [...history, delivered], opening: false },
      ]),
    ).toEqual([null, null, 'Support lines are beside what you wrote'])
  })

  it('says nothing when what I wrote is only held for review', () => {
    const held = msg('n1', 'me', 4, 'hmm', { status: 'held', heldReason: 'review' })
    expect(
      say([
        { items: history, opening: false },
        { items: [...history, held], opening: false },
      ]),
    ).toEqual([null, null])
  })

  it('tells of support lines that come with a message from someone else', () => {
    const delivered = msg('n1', 'sam', 4, 'it is too much', { status: 'published', crisis: true })
    expect(
      say([
        { items: history, opening: false },
        { items: [...history, delivered], opening: false },
      ]),
    ).toEqual([null, 'New message from Pen sam, with support lines: it is too much'])
  })

  it('says nothing of support lines already there when it opens, or once said', () => {
    const opened = [...history, heavy('h4', 4), msg('h5', 'sam', 5, 'x', { status: 'published', crisis: true })]
    expect(
      say([
        { items: [], opening: true },
        { items: opened, opening: false },
        { items: [...opened], opening: false },
      ]),
    ).toEqual([null, null, null])
  })

  it('says nothing of my held writing when the list of mine opens after the rest, and still tells of what I write next', () => {
    // The published window answers first and puts my published ones in the cache. The list
    // of mine answers from there with only those, then the server's answer brings what I
    // wrote before that is still held, and only that ends the opening
    const published = [row('p2', 'me', 2), row('p3', 'sam', 3), row('p4', 'me', 4), row('p5', 'ana', 5), row('p6', 'sam', 6)]
    const before = [row('p1', 'me', 1), published[0], published[2], row('h1', 'me', 5.5, { status: 'held', heldReason: 'crisis' })]
    const written = row('n1', 'me', 7, { status: 'pending' })
    expect(
      say([
        { items: [], opening: true },
        ...open(
          [
            { pub: published },
            { mine: [published[0], published[2]], cached: true },
            { mine: before },
            { mine: [...before, written] },
            { mine: [...before, { ...written, status: 'held', heldReason: 'crisis' }] },
          ],
          5,
        ),
      ]),
    ).toEqual([null, null, null, null, null, 'Support lines are beside what you wrote'])
  })

  it('says nothing of writing of mine that turns up already held, as from another tab', () => {
    expect(
      say([
        { items: history, opening: false },
        { items: [...history, heavy('n1', 4)], opening: false },
      ]),
    ).toEqual([null, null])
  })

  it('says nothing of an older one with support lines sliding back into a full window', () => {
    const window = [msg('h2', 'ana', 2), msg('h3', 'sam', 3)]
    const backfilled = [heavy('h1', 1), msg('h2', 'ana', 2)]
    expect(
      say([
        { items: window, opening: false },
        { items: backfilled, opening: false },
      ]),
    ).toEqual([null, null])
  })
})

describe('arrivalNote', () => {
  it('says nothing when nothing is new', () => {
    expect(arrivalNote({ fresh: [], support: [] }, 'me')).toBeNull()
  })

  it('reads one message with who wrote it, and nothing of its buttons', () => {
    expect(arrivalNote({ fresh: [msg('n1', 'sam', 4, 'thinking of you')], support: [] }, 'me')).toBe(
      'New message from Pen sam: thinking of you',
    )
  })

  it('reads the words alone when there is no name to give', () => {
    expect(arrivalNote({ fresh: [{ ...msg('n1', 'sam', 4, 'hello'), author: undefined }], support: [] }, 'me')).toBe('New message: hello')
  })

  it('counts several that land at once rather than reading them all', () => {
    const fresh = [msg('n1', 'sam', 4), msg('n2', 'ana', 5), msg('n3', 'sam', 6)]
    expect(arrivalNote({ fresh, support: [] }, 'me')).toBe('3 new messages')
    expect(arrivalNote({ fresh, support: [fresh[1]] }, 'me')).toBe('3 new messages, with support lines')
  })

  it('puts my support lines first when someone writes at the same moment', () => {
    const mine = heavy('n1', 4)
    expect(arrivalNote({ fresh: [msg('n2', 'sam', 5, 'here')], support: [mine] }, 'me')).toBe(
      'Support lines are beside what you wrote. New message from Pen sam: here',
    )
  })
})
