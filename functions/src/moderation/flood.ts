// A person may publish at a human pace. Past this, the next notes wait for a moderator.
export const FLOOD_WINDOW_MS = 10 * 60 * 1000
export const FLOOD_MAX = 8

export const applyFlood = (previous: unknown, now: number) => {
  const prior = Array.isArray(previous)
    ? previous.filter((stamp): stamp is number => typeof stamp === 'number' && now - stamp < FLOOD_WINDOW_MS)
    : []
  return { flooded: prior.length >= FLOOD_MAX, stamps: [...prior, now].slice(-20) }
}
