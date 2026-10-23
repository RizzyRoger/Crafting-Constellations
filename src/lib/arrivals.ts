// What a conversation says out loud. Its history is there to read when someone wants it:
// a live list would read all of it out (and every Withdraw and Report) each time it opens.
// Only what changes after it has opened is news: what someone else writes, and support
// lines coming up beside a message

// The parts of a message this reads
export interface Arrival {
  id: string
  authorUid: string
  createdAt: { toMillis: () => number } | null
  text: string
  author?: { penName: string }
  status?: string
  heldReason?: string
  crisis?: boolean
}

// The ids on screen last time, each with whether support lines were beside it, or null
// while the conversation is still opening
export type Seen = ReadonlyMap<string, boolean> | null

// Not timed yet is newest
const time = (item: Arrival) => item.createdAt?.toMillis() ?? Infinity

// Where Item puts a crisis card: on my writing held because it sounds heavy, or on anything
// delivered marked crisis (the server marks it only in a private conversation)
export const showsSupport = (item: Arrival, me: string) =>
  item.crisis === true || (item.authorUid === me && item.status === 'held' && item.heldReason === 'crisis')

// One step of a conversation. While it opens (or another one does) nothing is news, and
// whatever it opens with is history. After that, new ids from others are news, and so are
// support lines coming up on something already here or with something new, except at the
// old end of the window: something withdrawn lets an older one slide back in
export const nextArrivals = <T extends Arrival>(seen: Seen, items: readonly T[], opening: boolean, me: string) => {
  if (opening) return { seen: null, fresh: [] as T[], support: [] as T[] }
  const next: Seen = new Map(items.map((item) => [item.id, showsSupport(item, me)]))
  if (!seen) return { seen: next, fresh: [] as T[], support: [] as T[] }
  const shown = items.filter((item) => seen.has(item.id)).map(time)
  const oldest = shown.length > 0 ? Math.min(...shown) : -Infinity
  const recent = items.filter((item) => time(item) >= oldest)
  const fresh = recent.filter((item) => !seen.has(item.id) && item.authorUid !== me)
  // My own writing can still turn up already held, as from another tab. That's the server
  // catching up: what I write here shows first as pending
  const support = recent.filter((item) => next.get(item.id) && (seen.has(item.id) ? !seen.get(item.id) : fresh.includes(item)))
  return { seen: next, fresh, support }
}

// One short line: the words and who wrote them, not the buttons around them, and whether
// support lines came with them or came up beside what I wrote
export const arrivalNote = ({ fresh, support }: { fresh: readonly Arrival[]; support: readonly Arrival[] }, me: string) => {
  const help = fresh.some((item) => support.includes(item)) ? ', with support lines' : ''
  const [one] = fresh
  const news =
    fresh.length > 1
      ? `${fresh.length} new messages${help}`
      : one
        ? `New message${one.author ? ` from ${one.author.penName}` : ''}${help}: ${one.text}`
        : null
  const mine = support.some((item) => item.authorUid === me) ? 'Support lines are beside what you wrote' : null
  const lines = [mine, news].filter((line) => line !== null)
  return lines.length > 0 ? lines.join('. ') : null
}
