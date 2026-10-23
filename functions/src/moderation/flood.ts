// A person may publish at a human pace. Past this, the next notes wait for a moderator.
export const FLOOD_WINDOW_MS = 10 * 60 * 1000
export const FLOOD_MAX = 8
// Notes written this soon after one count against it too: a burst's triggers run side by side and
// retry, in no fixed order, and its notes judged first would otherwise see none before them
export const FLOOD_SKEW_MS = 60_000
// Only to bound the log: far above any burst, so trimming doesn't drop stamps a late note still needs
export const FLOOD_LOG_MAX = 500

// `writtenAt` is the note's own time, not when it is judged: after downtime a backlog is
// judged late and in any order. So the notes written in the window before it count against it,
// and those written within FLOOD_SKEW_MS after it, so a burst is held the same in any order while
// a slow backlog's later notes don't count. The log keeps every stamp within the window of the
// newest one, not the last ones judged.
export const applyFlood = (previous: unknown, writtenAt: number) => {
  const known = Array.isArray(previous) ? previous.filter((stamp): stamp is number => typeof stamp === 'number') : []
  const near = known.filter((stamp) => writtenAt - FLOOD_WINDOW_MS < stamp && stamp <= writtenAt + FLOOD_SKEW_MS)
  const latest = known.reduce((newest, stamp) => Math.max(newest, stamp), writtenAt)
  const stamps = [...known, writtenAt]
    .filter((stamp) => latest - stamp < FLOOD_WINDOW_MS)
    .sort((a, b) => a - b)
    .slice(-FLOOD_LOG_MAX)
  return { flooded: near.length >= FLOOD_MAX, stamps }
}
