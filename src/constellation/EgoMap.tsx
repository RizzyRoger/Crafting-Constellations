import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Profile } from '../lib/types'
import { layoutEgo, type EgoTie } from './egoLayout'
import { atRest, holdAt, settle, startSim, stepSim, type Hold, type Sim } from './egoPhysics'

interface EgoMapProps {
  me: string
  people: Profile[]
  friendships: EgoTie[]
  pending: EgoTie[]
  blocked: string[]
  sharedGroups: Record<string, number>
  selected: string | null
  onSelect: (uid: string) => void
}

// Less movement than this is a tap that opens the person, not a drag
const DRAG_FROM_PX = 4
// About half a label's width per letter at 15px, to keep names inside the chart's edges
const HALF_LETTER = 4.2

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const EgoMap = ({ me, people, friendships, pending, blocked, sharedGroups, selected, onSelect }: EgoMapProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const height = Math.max(520, Math.round(width * 0.72))
  const layout = useMemo(
    () => (width > 0 ? layoutEgo({ width, height, me, friendships, pending, blocked, sharedGroups }) : null),
    [width, height, me, friendships, pending, blocked, sharedGroups],
  )
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  // The animation steps `sim`; `frame` is what's drawn. Both start settled from the layout.
  const sim = useRef<Sim | null>(null)
  const [frame, setFrame] = useState<Sim | null>(null)
  const hold = useRef<Hold | null>(null)
  const press = useRef<{ uid: string; pointerId: number; x: number; y: number } | null>(null)
  // The last press became a drag: its click must not open the person
  const dragged = useRef(false)
  const loop = useRef<number | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  useEffect(() => {
    if (!layout) return
    sim.current = startSim(layout, me, sim.current)
    setFrame(sim.current)
  }, [layout, me])

  useEffect(
    () => () => {
      if (loop.current !== null) cancelAnimationFrame(loop.current)
    },
    [],
  )

  // Step while someone holds a dot or anything is still moving, then stop
  const animate = () => {
    if (loop.current !== null) return
    const tick = () => {
      if (!sim.current) {
        loop.current = null
        return
      }
      sim.current = stepSim(sim.current, hold.current)
      setFrame(sim.current)
      loop.current = hold.current || !atRest(sim.current) ? requestAnimationFrame(tick) : null
    }
    loop.current = requestAnimationFrame(tick)
  }

  const toChart = (event: PointerEvent) => {
    const matrix = svg.current?.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }

  const grab = (uid: string) => (event: PointerEvent<SVGGElement>) => {
    if (event.button !== 0) return
    try {
      // Keep the moves coming to this dot even when the pointer outruns it
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // The pointer is already gone (lifted, or not a live pointer); moves still arrive while it's over the dot
    }
    press.current = { uid, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    dragged.current = false
  }

  const move = (event: PointerEvent<SVGGElement>) => {
    const pressed = press.current
    if (!pressed || pressed.pointerId !== event.pointerId) return
    if (!hold.current && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_FROM_PX) return
    const at = toChart(event)
    if (!at) return
    if (!hold.current) setDragging(pressed.uid)
    dragged.current = true
    hold.current = { uid: pressed.uid, ...at }
    if (sim.current) {
      sim.current = holdAt(sim.current, hold.current)
      setFrame(sim.current)
    }
    animate()
  }

  const release = (event: PointerEvent<SVGGElement>) => {
    if (press.current?.pointerId !== event.pointerId) return
    press.current = null
    if (!hold.current) return
    hold.current = null
    setDragging(null)
    // Reduced motion: no drifting afterwards, just the new rest
    if (reducedMotion() && sim.current) {
      sim.current = settle(sim.current)
      setFrame(sim.current)
    }
    animate()
  }

  const select = (uid: string) => () => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    onSelect(uid)
  }

  const activate = (uid: string) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(uid)
    }
  }

  const at = useMemo(() => new Map(frame?.nodes.map((n) => [n.uid, n]) ?? []), [frame])
  const label = (uid: string) => (uid === me ? 'you' : (byId.get(uid)?.penName ?? 'someone'))
  const labelX = (x: number, text: string, chartWidth: number) => {
    const half = text.length * HALF_LETTER + 4
    return Math.min(chartWidth - half, Math.max(half, x))
  }

  return (
    <figure className="ego" ref={ref}>
      {layout && frame && (
        <svg ref={svg} viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height={layout.height} role="group" aria-label="People connected to you">
          {layout.edges.map((edge) => {
            const a = at.get(edge.a)
            const b = at.get(edge.b)
            if (!a || !b) return null
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={edge.dashed ? 'ego__line ego__line--pending' : 'ego__line'}
              />
            )
          })}
          {frame.nodes.map((node) => {
            const mine = node.uid === me
            const classes = ['ego__node', node.uid === selected && 'is-selected', !mine && 'is-draggable', dragging === node.uid && 'is-dragging']
            return (
              <g
                key={node.uid}
                className={classes.filter(Boolean).join(' ')}
                tabIndex={0}
                role="button"
                aria-label={label(node.uid)}
                aria-pressed={node.uid === selected}
                onClick={select(node.uid)}
                onKeyDown={activate(node.uid)}
                // You stay in the middle; everyone else can be dragged
                {...(mine ? {} : { onPointerDown: grab(node.uid), onPointerMove: move, onPointerUp: release, onPointerCancel: release })}
              >
                {!mine && <circle cx={node.x} cy={node.y} r={node.r + 12} className="ego__hit" />}
                <circle cx={node.x} cy={node.y} r={node.r} className="ego__dot" />
                <text x={labelX(node.x, label(node.uid), layout.width)} y={node.y + node.r + 16} textAnchor="middle">
                  {label(node.uid)}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      <figcaption className="ego__note">
        Dots are larger when you share more groups. Lines are your direct ties, and your friends’ own. A friend’s friend sits one step further out — choose anyone to reach out, or drag them to move the chart around you.
      </figcaption>
    </figure>
  )
}
