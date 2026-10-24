import { focusForNow } from '../lib/focusForNow'

// How to bring a sheet that just opened into view. Narrower than 1200px it opens under a chart at
// least 520px tall; wider, it floats at the top of the chart or list, which may be scrolled well
// past (app.css). Only to the nearest edge, so a sheet already in sight stays put, and gently
// unless motion is reduced
export const revealSheet = (reducedMotion: boolean): ScrollIntoViewOptions => ({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })

// Whether the sheet may come up yet. The groups chart is only as tall as its layout, which waits for
// its width to be measured, so a sheet coming up with the page (a reload, Back) would be brought
// into view under the chart's 300px placeholder and then pushed far out of sight as it grows. The
// friends chart holds its room from the start and the list needs none. Once it may, it stays so: a
// view switch that took an open sheet down would bring it up again, pulling the page to it
export const sheetMayOpen = (already: boolean, { loading, view, chartLaidOut }: { loading: boolean; view: string; chartLaidOut: boolean }) =>
  already || (!loading && (view !== 'groups' || chartLaidOut))

// What gets focus back when the sheet closes: the star, dot or name that chose this person, which
// has focus as the sheet comes up. Focus that's nowhere (the search result that chose them is
// gone) or already in the sheet leaves the last one standing
export const openerOf = <T>(last: T | null, active: T | null, { body, sheet }: { body: T; sheet: { contains: (node: T) => boolean } }) =>
  active && active !== body && !sheet.contains(active) ? active : last

// Closing goes back to it while it's still on the page, otherwise to the chart, so the next Tab
// carries on from there rather than from the top of the page. The chart takes focus for that move
// only: left focusable, a click on its text would send the next Tab back to its top
export const focusOnClose = <T extends { isConnected: boolean; focus: () => void }>(opener: T | null, chart: HTMLElement | null) =>
  opener?.isConnected ? opener : chart && { focus: () => focusForNow(chart) }

// Navigation state for choosing someone. Choosing whoever is open already leaves the address as
// it was, so this is how the page tells it was a choice and brings their sheet up again
export const CHOOSE = { reveal: true }

// The navigation that last chose someone. A new one brings the open sheet into view again;
// others, like switching views, keep the last one, so they don't pull the page down to the sheet
export const lastChoice = (previous: string, location: { key: string; state: unknown }) =>
  (location.state as { reveal?: unknown } | null)?.reveal === true ? location.key : previous
