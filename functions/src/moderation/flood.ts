// A person may publish at a human pace. Past this, the next notes wait for a moderator.
export const FLOOD_WINDOW_MS = 10 * 60 * 1000
export const FLOOD_MAX = 8
// Only to bound the log: far above any burst, so trimming doesn't drop stamps a late note still needs
export const FLOOD_LOG_MAX = 500

// `writtenAt` is the note's own time, not when it is judged: after downtime a backlog is
// judged late and in any order. So only notes written before it count against it, and the
// log keeps every stamp within the window of the newest one, not the last ones judged.
export const applyFlood = (previous: unknown, writtenAt: number) => {
  const known = Array.isArray(previous) ? previous.filter((stamp): stamp is number => typeof stamp === 'number') : []
  const prior = known.filter((stamp) => stamp <= writtenAt && writtenAt - stamp < FLOOD_WINDOW_MS)
  const latest = known.reduce((newest, stamp) => Math.max(newest, stamp), writtenAt)
  const stamps = [...known, writtenAt]
    .filter((stamp) => latest - stamp < FLOOD_WINDOW_MS)
    .sort((a, b) => a - b)
    .slice(-FLOOD_LOG_MAX)
  return { flooded: prior.length >= FLOOD_MAX, stamps }
}
