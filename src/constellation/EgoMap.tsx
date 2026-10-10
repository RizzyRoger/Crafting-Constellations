import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Profile } from '../lib/types'
import { layoutEgo, type EgoTie } from './egoLayout'

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

export const EgoMap = ({ me, people, friendships, pending, blocked, sharedGroups, selected, onSelect }: EgoMapProps) => {
  const ref = useRef<HTMLDivElement>(null)
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
  const at = useMemo(() => new Map(layout?.nodes.map((n) => [n.uid, n]) ?? []), [layout])

  const activate = (uid: string) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(uid)
    }
  }

  const label = (uid: string) => (uid === me ? 'you' : (byId.get(uid)?.penName ?? 'someone'))

  return (
    <figure className="ego" ref={ref}>
      {layout && (
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height={layout.height} role="group" aria-label="People connected to you">
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
          {layout.nodes.map((node) => (
            <g
              key={node.uid}
              className={node.uid === selected ? 'ego__node is-selected' : 'ego__node'}
              tabIndex={0}
              role="button"
              aria-label={label(node.uid)}
              aria-pressed={node.uid === selected}
              onClick={() => onSelect(node.uid)}
              onKeyDown={activate(node.uid)}
            >
              <circle cx={node.x} cy={node.y} r={node.r} />
              <text x={node.x} y={node.y + node.r + 16} textAnchor="middle">
                {label(node.uid)}
              </text>
            </g>
          ))}
        </svg>
      )}
      <figcaption className="ego__note">
        Dots are larger when you share more groups. Lines are your direct ties, and your friends’ own. A friend’s friend is on the chart so you can see them — they connect with you first.
      </figcaption>
    </figure>
  )
}
