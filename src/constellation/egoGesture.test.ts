import { describe, expect, it } from 'vitest'
import { click, dragOf, forgetGone, holdsPage, IDLE, lift, markDragged, pressDot, type Gesture } from './egoGesture'

// The pointer events EgoMap feeds in, in order. A touch drag ends in 'up' with no click;
// a mouse drag ends in 'up' and then a click on the dot it held
type Step =
  | { down: string; at?: [number, number] }
  | { move: [number, number] }
  | { up: true }
  | { click: string }

const POINTER = 1

// Wired as EgoMap wires it: down presses, a move far enough marks the drag, up lifts, click asks
const run = (steps: Step[]) => {
  let gesture: Gesture = IDLE
  const opened: string[] = []
  for (const step of steps) {
    if ('down' in step) {
      const [x, y] = step.at ?? [100, 100]
      gesture = pressDot({ uid: step.down, pointerId: POINTER, x, y })
    } else if ('move' in step) {
      const uid = dragOf(gesture, POINTER, step.move[0], step.move[1], gesture.dragged !== null)
      if (uid) gesture = markDragged(gesture, uid)
    } else if ('up' in step) {
      gesture = lift(gesture)
    } else {
      const result = click(gesture, step.click)
      gesture = result.gesture
      if (result.opens) opened.push(step.click)
    }
  }
  return { gesture, opened }
}

describe('ego gesture', () => {
  it('opens a friend on a tap', () => {
    expect(run([{ down: 'friend' }, { up: true }, { click: 'friend' }]).opened).toEqual(['friend'])
  })

  it('treats a wobble under the drag distance as a tap', () => {
    expect(run([{ down: 'friend' }, { move: [102, 101] }, { up: true }, { click: 'friend' }]).opened).toEqual(['friend'])
  })

  it('does not open the person when the click ends a drag of their dot', () => {
    expect(run([{ down: 'friend' }, { move: [140, 120] }, { up: true }, { click: 'friend' }]).opened).toEqual([])
  })

  it('opens your own dot on the first tap after a touch drag that ended with no click', () => {
    // Your own dot has no pointer handlers, so nothing presses it before its click
    expect(run([{ down: 'friend' }, { move: [140, 120] }, { up: true }, { click: 'me' }]).opened).toEqual(['me'])
  })

  it('opens the next person tapped after a touch drag', () => {
    const steps: Step[] = [{ down: 'a' }, { move: [140, 120] }, { up: true }]
    expect(run([...steps, { down: 'b' }, { up: true }, { click: 'b' }]).opened).toEqual(['b'])
    expect(run([...steps, { down: 'a' }, { up: true }, { click: 'a' }]).opened).toEqual(['a'])
  })

  it('spends the drag mark on the next click, wherever it lands', () => {
    const { gesture } = run([{ down: 'a' }, { move: [140, 120] }, { up: true }, { click: 'me' }])
    expect(gesture.dragged).toBeNull()
  })

  it('ignores moves from another pointer', () => {
    const pressed = pressDot({ uid: 'a', pointerId: POINTER, x: 0, y: 0 })
    expect(dragOf(pressed, POINTER + 1, 50, 50, false)).toBeNull()
    expect(dragOf(IDLE, POINTER, 50, 50, false)).toBeNull()
  })

  it('holds the page still only while a dot is pressed', () => {
    expect(holdsPage(IDLE)).toBe(false)
    expect(holdsPage(run([{ down: 'a' }]).gesture)).toBe(true)
    expect(holdsPage(run([{ down: 'a' }, { move: [140, 120] }]).gesture)).toBe(true)
    expect(holdsPage(run([{ down: 'a' }, { move: [140, 120] }, { up: true }]).gesture)).toBe(false)
  })
})

// A live change can take the pressed dot off the chart mid-press, and its lift then lands nowhere
describe('a pressed dot leaving the chart', () => {
  const pressed = run([{ down: 'b' }, { move: [140, 120] }]).gesture
  const hold = { uid: 'b', x: 140, y: 120 }
  const without = (gone: string) => (uid: string) => uid !== gone

  it('ends the press and the drag, so the page scrolls again and the drag stops stepping', () => {
    const kept = forgetGone(pressed, hold, without('b'))
    expect(holdsPage(kept.gesture)).toBe(false)
    expect(kept.hold).toBeNull()
  })

  it('ends a press that was still a tap', () => {
    const tapping = run([{ down: 'b' }]).gesture
    expect(holdsPage(forgetGone(tapping, null, without('b')).gesture)).toBe(false)
  })

  it('leaves them be while the dot is still there', () => {
    const kept = forgetGone(pressed, hold, without('c'))
    expect(kept.gesture).toBe(pressed)
    expect(kept.hold).toBe(hold)
  })

  it('still opens the next person tapped', () => {
    expect(click(forgetGone(pressed, hold, without('b')).gesture, 'me').opens).toBe(true)
  })
})
