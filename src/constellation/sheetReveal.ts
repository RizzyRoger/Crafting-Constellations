// How to bring a sheet that just opened into view. Narrower than 1200px it opens under a chart at
// least 520px tall; wider, it floats at the top of the chart or list, which may be scrolled well
// past (app.css). Only to the nearest edge, so a sheet already in sight stays put, and gently
// unless motion is reduced
export const revealSheet = (reducedMotion: boolean): ScrollIntoViewOptions => ({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })

// What gets focus back when the sheet closes: the star, dot or name that chose this person, which
// has focus as the sheet comes up. Focus that's nowhere (the search result that chose them is
// gone) or already in the sheet leaves the last one standing
export const openerOf = <T>(last: T | null, active: T | null, { body, sheet }: { body: T; sheet: { contains: (node: T) => boolean } }) =>
  active && active !== body && !sheet.contains(active) ? active : last

// Closing goes back to it while it's still on the page, otherwise to the chart, so the next Tab
// carries on from there rather than from the top of the page
export const focusOnClose = <T extends { isConnected: boolean }>(opener: T | null, chart: T | null) => (opener?.isConnected ? opener : chart)

// Navigation state for choosing someone. Choosing whoever is open already leaves the address as
// it was, so this is how the page tells it was a choice and brings their sheet up again
export const CHOOSE = { reveal: true }

// The navigation that last chose someone. A new one brings the open sheet into view again;
// others, like switching views, keep the last one, so they don't pull the page down to the sheet
export const lastChoice = (previous: string, location: { key: string; state: unknown }) =>
  (location.state as { reveal?: unknown } | null)?.reveal === true ? location.key : previous
