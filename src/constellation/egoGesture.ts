// Pressing, dragging and clicking a dot on the friends chart, kept apart from the physics so it can be tested

// Less movement than this is a tap that opens the person, not a drag
export const DRAG_FROM_PX = 4

export interface Press {
  uid: string
  pointerId: number
  x: number
  y: number
}

export interface Gesture {
  press: Press | null
  // The dot the last press dragged: the click that ends that drag must not open the person.
  // It names the dot because a touch drag ends with no click at all, so the next click can be
  // anywhere, even on your own dot, which nothing presses first
  dragged: string | null
}

export const IDLE: Gesture = { press: null, dragged: null }

// A pointer goes down on a dot: a new press, not a drag yet
export const pressDot = (press: Press): Gesture => ({ press, dragged: null })

// The dot this move drags: none for another pointer, or while the press is still a tap
export const dragOf = (gesture: Gesture, pointerId: number, x: number, y: number, holding: boolean): string | null => {
  const { press } = gesture
  if (!press || press.pointerId !== pointerId) return null
  if (!holding && Math.hypot(x - press.x, y - press.y) < DRAG_FROM_PX) return null
  return press.uid
}

export const markDragged = (gesture: Gesture, uid: string): Gesture => ({ ...gesture, dragged: uid })

// The pointer lifts or is cancelled. The drag mark stays for the click that may follow
export const lift = (gesture: Gesture): Gesture => ({ ...gesture, press: null })

// A click opens the person unless it ends a drag of that same dot; either way the mark is spent
export const click = (gesture: Gesture, uid: string): { gesture: Gesture; opens: boolean } => ({
  gesture: { ...gesture, dragged: null },
  opens: gesture.dragged !== uid,
})

// While a dot is pressed, a finger's moves belong to the dot, so the page must not pan under them
export const holdsPage = (gesture: Gesture) => gesture.press !== null

// The dot pressed or held has left the chart (that friendship ended, say). The pointer's lift
// can't reach a dot that's gone, so the press and the hold end here, as a lift would end them.
// Otherwise the page stays held still under a finger and a drag keeps stepping
export const forgetGone = <H extends { uid: string }>(gesture: Gesture, hold: H | null, onChart: (uid: string) => boolean) => {
  const pressGone = gesture.press !== null && !onChart(gesture.press.uid)
  const holdGone = hold !== null && !onChart(hold.uid)
  return { gesture: pressGone ? lift(gesture) : gesture, hold: pressGone || holdGone ? null : hold }
}
