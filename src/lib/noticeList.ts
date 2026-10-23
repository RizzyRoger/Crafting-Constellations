// What the notifications page lists and marks read, kept apart so it can be unit tested.
// The page loads the newest notices, but the rail counts every unseen one, so anything
// unseen past that window has to be listed and cleared too, or the count can never go.

// The parts of a Notice (types.ts) these read; kept structural so tests needn't load Firestore
interface Listed {
  id: string
  createdAt: { toMillis: () => number } | null
}

// Firestore commits at most 500 writes in one batch
export const BATCH_LIMIT = 500

// One not yet given its time is the newest
const millis = (n: Listed) => n.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER

const newestFirst = (a: Listed, b: Listed) => millis(b) - millis(a)

// The newest notices, then unseen ones older than them (at most `extra`, so a long time away
// doesn't open hundreds of rows at once; Mark all read still clears the rest)
export const withUnseen = <T extends Listed>(latest: readonly T[], unseen: readonly T[], extra: number): T[] => {
  const shown = new Set(latest.map((n) => n.id))
  const older = unseen.filter((n) => !shown.has(n.id)).sort(newestFirst).slice(0, extra)
  return [...latest, ...older].sort(newestFirst)
}

// The same items split into runs one batch can take
export const inBatches = <T>(items: readonly T[], size = BATCH_LIMIT): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))
