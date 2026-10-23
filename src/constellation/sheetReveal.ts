// From this width the person sheet floats over the chart's corner (app.css). Narrower, it opens
// under a chart at least 520px tall, out of sight
export const SHEET_FLOATS = '(min-width: 1200px)'

// How to bring a sheet that just opened into view: not at all where it floats in sight,
// otherwise to the nearest edge, gently unless motion is reduced
export const revealSheet = (floats: boolean, reducedMotion: boolean): ScrollIntoViewOptions | null =>
  floats ? null : { block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' }

// Navigation state for choosing someone. Choosing whoever is open already leaves the address as
// it was, so this is how the page tells it was a choice and brings their sheet up again
export const CHOOSE = { reveal: true }

// The navigation that last chose someone. A new one brings the open sheet into view again;
// others, like switching views, keep the last one, so they don't pull the page down to the sheet
export const lastChoice = (previous: string, location: { key: string; state: unknown }) =>
  (location.state as { reveal?: unknown } | null)?.reveal === true ? location.key : previous
