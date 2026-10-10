import { describe, expect, it } from 'vitest'
import { atRest, holdAt, settle, startSim, stepSim, type Sim } from './egoPhysics'
import { layoutEgo, type EgoTie } from './egoLayout'

const tie = (a: string, b: string): EgoTie => ({ id: `${a}-${b}`, uids: [a, b] })

const layout = layoutEgo({
  width: 800,
  height: 600,
  me: 'me',
  sharedGroups: { a: 2, b: 1 },
  friendships: [tie('me', 'a'), tie('me', 'b'), tie('me', 'c'), tie('a', 'x'), tie('b', 'y')],
  pending: [tie('me', 'p')],
})

const node = (sim: Sim, uid: string) => sim.nodes.find((n) => n.uid === uid)!
const distance = (sim: Sim, a: string, b: string) => Math.hypot(node(sim, a).x - node(sim, b).x, node(sim, a).y - node(sim, b).y)

// Drag `uid` to (x, y) for a while, the way the pointer would hold it
const dragTo = (sim: Sim, uid: string, x: number, y: number, frames = 90) =>
  Array.from({ length: frames }).reduce<Sim>((s) => stepSim(s, { uid, x, y }), sim)

describe('ego physics', () => {
  const start = startSim(layout, 'me')

  it('starts settled, with you in the middle', () => {
    expect(atRest(start)).toBe(true)
    expect(node(start, 'me')).toMatchObject({ x: 400, y: 300 })
  })

  it('keeps friends near their ring and a friend’s friend beyond its friend', () => {
    expect(distance(start, 'me', 'a')).toBeLessThan(distance(start, 'me', 'x'))
    expect(distance(start, 'a', 'x')).toBeLessThan(distance(start, 'b', 'x'))
  })

  it('never moves you, even when someone drags you', () => {
    const dragged = dragTo(start, 'me', 50, 50)
    expect(node(dragged, 'me')).toMatchObject({ x: 400, y: 300 })
  })

  it('holds a dragged dot at the pointer and pulls its friend after it', () => {
    const before = distance(start, 'a', 'x')
    const target = { x: node(start, 'a').x + 160, y: node(start, 'a').y + 40 }
    const dragged = dragTo(start, 'a', target.x, target.y)
    expect(node(dragged, 'a')).toMatchObject(target)
    // x is tied to a, so it follows; c is only tied to you, so it barely moves
    const followed = Math.hypot(node(dragged, 'x').x - node(start, 'x').x, node(dragged, 'x').y - node(start, 'x').y)
    const stayed = Math.hypot(node(dragged, 'c').x - node(start, 'c').x, node(dragged, 'c').y - node(start, 'c').y)
    expect(followed).toBeGreaterThan(40)
    expect(followed).toBeGreaterThan(stayed * 3)
    expect(distance(dragged, 'a', 'x')).toBeLessThan(before + 40)
  })

  it('drifts to a new rest after release, inside the chart', () => {
    const released = settle(dragTo(start, 'b', 760, 40))
    expect(atRest(released)).toBe(true)
    released.nodes.forEach((n) => {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(800)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(600)
    })
  })

  it('puts a held dot under the pointer at once, but never you', () => {
    expect(node(holdAt(start, { uid: 'c', x: 120, y: 90 }), 'c')).toMatchObject({ x: 120, y: 90, vx: 0, vy: 0 })
    expect(holdAt(start, { uid: 'me', x: 120, y: 90 })).toBe(start)
  })

  it('nudges rather than flings when a dot is dropped on you', () => {
    const dropped = holdAt(start, { uid: 'c', x: 404, y: 302 })
    const next = stepSim(dropped)
    // Its line wants its length back (about 10px a frame); uncapped, the push alone hit the 24px speed limit
    const kick = Math.hypot(node(next, 'c').x - 404, node(next, 'c').y - 302)
    expect(kick).toBeLessThan(12)
  })

  it('keeps the chart inside its edges while dragging past them', () => {
    const dragged = dragTo(start, 'c', -500, 2000, 5)
    expect(node(dragged, 'c').x).toBeGreaterThan(0)
    expect(node(dragged, 'c').y).toBeLessThan(600)
  })

  it('keeps where dots were when the people change, and is deterministic', () => {
    const moved = settle(dragTo(start, 'a', 700, 100))
    const again = startSim(layout, 'me', moved)
    expect(distance(again, 'a', 'me')).toBeCloseTo(distance(moved, 'a', 'me'), 0)
    expect(startSim(layout, 'me')).toEqual(start)
  })
})
