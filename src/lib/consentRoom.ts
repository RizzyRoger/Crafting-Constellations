// Room at the foot of the page for the counting-consent slip, kept apart so it can be unit tested.
// The slip is fixed over the bottom of every page, and nothing left room for it: on a phone Sign in,
// Google and the send bar sat under it, and the full-height shell couldn't scroll them clear

// The custom property app.css leaves the room by
export const CONSENT_ROOM = '--consent-room'

// What the slip covers at the foot of the screen: its height and the gap under it
export const consentRoom = (height: number, bottom: string) => `${Math.ceil(height + (Number.parseFloat(bottom) || 0))}px`

// A ref for the slip. Keeps the room up to date on the page's root while the slip shows, as it
// reflows with the width and the fonts, and gives it back when the slip goes
export const makeRoomFor = (slip: HTMLElement, root: HTMLElement = document.documentElement) => {
  const measure = () => root.style.setProperty(CONSENT_ROOM, consentRoom(slip.offsetHeight, getComputedStyle(slip).bottom))
  const watch = new ResizeObserver(measure)
  watch.observe(slip)
  // Now, not on the observer's first call a frame later, so the page never paints without it
  measure()
  return () => {
    watch.disconnect()
    root.style.removeProperty(CONSENT_ROOM)
  }
}
