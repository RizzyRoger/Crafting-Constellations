import type { EgoLayout } from './egoLayout'

// Obsidian-style physics for the ego graph: every line is a spring that wants
// its drawn length, every pair of dots pushes apart, and you stay pinned in
// the middle. Starts from layoutEgo's rings, settled before the first paint;
// a dragged dot follows the pointer, its lines pull their neighbours after it,
// and on release everything drifts to a new rest. Nothing is saved.

export interface SimNode {
  uid: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

export interface SimLink {
  a: string
  b: string
  length: number
}

export interface Sim {
  width: number
  height: number
  me: string
  nodes: SimNode[]
  links: SimLink[]
}

// The dot being dragged, held at the pointer
export interface Hold {
  uid: string
  x: number
  y: number
}

const SPRING = 0.05 // pull per px of stretch along a line
const REPEL = 2400 // push between two dots, falling off with distance squared
const NEAR = 24 * 24 // closer than this pushes no harder, so a dot dropped on another nudges, not flings
const DAMPING = 0.78 // share of speed kept each step
const MAX_SPEED = 24
const REST_SPEED = 0.1 // fastest dot below this (px per frame, too slow to see): at rest
const PAD = 28 // keep dots, and their labels, inside the chart
const SETTLE_STEPS = 1500

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

const inside = (sim: Pick<Sim, 'width' | 'height'>, x: number, y: number) => ({
  x: clamp(x, PAD, sim.width - PAD),
  y: clamp(y, PAD, sim.height - PAD - 18),
})

// Push from every other dot, and the springs of the lines touching this one
const forceOn = (node: SimNode, sim: Sim, at: ReadonlyMap<string, SimNode>) => {
  const push = sim.nodes.reduce(
    (f, other) => {
      if (other === node) return f
      const dx = node.x - other.x
      const dy = node.y - other.y
      const d = Math.max(Math.hypot(dx, dy), 0.01)
      const push = REPEL / Math.max(d * d, NEAR)
      return { x: f.x + (push * dx) / d, y: f.y + (push * dy) / d }
    },
    { x: 0, y: 0 },
  )
  return sim.links.reduce((f, link) => {
    const otherUid = link.a === node.uid ? link.b : link.b === node.uid ? link.a : null
    const other = otherUid ? at.get(otherUid) : undefined
    if (!other) return f
    const dx = other.x - node.x
    const dy = other.y - node.y
    const d = Math.max(Math.hypot(dx, dy), 0.01)
    const pull = SPRING * (d - link.length)
    return { x: f.x + (pull * dx) / d, y: f.y + (pull * dy) / d }
  }, push)
}

export const stepSim = (sim: Sim, hold: Hold | null = null): Sim => {
  const at = new Map(sim.nodes.map((n) => [n.uid, n]))
  const nodes = sim.nodes.map((node) => {
    if (node.uid === sim.me) return { ...node, vx: 0, vy: 0 }
    if (hold && node.uid === hold.uid) return { ...node, ...inside(sim, hold.x, hold.y), vx: 0, vy: 0 }
    const f = forceOn(node, sim, at)
    const vx = (node.vx + f.x) * DAMPING
    const vy = (node.vy + f.y) * DAMPING
    const speed = Math.hypot(vx, vy)
    const scale = speed > MAX_SPEED ? MAX_SPEED / speed : 1
    const free = { x: node.x + vx * scale, y: node.y + vy * scale }
    const kept = inside(sim, free.x, free.y)
    // An edge stops a dot outright: no speed left pressing into it
    return { ...node, ...kept, vx: kept.x === free.x ? vx * scale : 0, vy: kept.y === free.y ? vy * scale : 0 }
  })
  return { ...sim, nodes }
}

// Put the held dot under the pointer now, between frames (a quick flick can end before the next one)
export const holdAt = (sim: Sim, hold: Hold): Sim =>
  hold.uid === sim.me
    ? sim
    : { ...sim, nodes: sim.nodes.map((n) => (n.uid === hold.uid ? { ...n, ...inside(sim, hold.x, hold.y), vx: 0, vy: 0 } : n)) }

export const atRest = (sim: Sim) => sim.nodes.every((n) => Math.hypot(n.vx, n.vy) < REST_SPEED)

// Run without drawing until still (reduced motion, and before the first paint)
export const settle = (sim: Sim, steps = SETTLE_STEPS): Sim => {
  let current = stepSim(sim)
  for (let i = 1; i < steps && !atRest(current); i++) current = stepSim(current)
  return current
}

// From the ring layout, settled. Dots already on the chart (same size) keep
// their place, so a new friend arriving doesn't undo where you dragged others.
export const startSim = (layout: EgoLayout, me: string, previous?: Sim | null): Sim => {
  const kept = previous && previous.width === layout.width && previous.height === layout.height ? previous : null
  const before = new Map(kept?.nodes.map((n) => [n.uid, n]) ?? [])
  const home = new Map(layout.nodes.map((n) => [n.uid, n]))
  const links = layout.edges.flatMap((edge) => {
    const a = home.get(edge.a)
    const b = home.get(edge.b)
    return a && b && edge.a !== edge.b ? [{ a: edge.a, b: edge.b, length: Math.hypot(a.x - b.x, a.y - b.y) }] : []
  })
  const nodes = layout.nodes.map((n) => {
    const was = n.uid === me ? undefined : before.get(n.uid)
    return { uid: n.uid, r: n.r, x: was?.x ?? n.x, y: was?.y ?? n.y, vx: 0, vy: 0 }
  })
  return settle({ width: layout.width, height: layout.height, me, nodes, links })
}
