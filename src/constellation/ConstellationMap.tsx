import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Profile } from '../lib/types'
import { layoutConstellation, NODE, starDisc, type LayoutInput } from './layout'
import { useBlotUrls } from './useBlotUrls'

interface MapProps extends Omit<LayoutInput, 'width' | 'people'> {
  people: Profile[]
  lines: { id: string; uids: [string, string]; status: 'accepted' | 'pending' }[]
  me: string
  myGroupIds: Set<string>
  selected: string | null
  onSelect: (uid: string) => void
}

// Groups are pencil circles, people are wash blots, friendships are pencil lines
export const ConstellationMap = ({ constellations, groups, memberships, people, lines: friendLines, me, myGroupIds, selected, onSelect }: MapProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width / 40) * 40))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const peopleIds = useMemo(() => people.map((p) => p.id), [people])
  const layout = useMemo(
    () => (width > 0 ? layoutConstellation({ width, constellations, groups, memberships, people: peopleIds }) : null),
    [width, constellations, groups, memberships, peopleIds],
  )
  const urls = useBlotUrls(people, NODE)
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const at = useMemo(() => new Map(layout?.people.map((p) => [p.uid, p]) ?? []), [layout])

  // Memberships beyond a person's home circle are faint dotted ties
  const groupAt = useMemo(() => new Map(layout?.groups.map((g) => [g.id, g]) ?? []), [layout])
  const ties = (layout?.people ?? []).flatMap((p) =>
    p.groupIds
      .map((gid) => groupAt.get(gid))
      .filter((g): g is NonNullable<typeof g> => Boolean(g) && g!.id !== p.home)
      .map((g) => ({ key: `${p.uid}-${g.id}`, x1: p.x, y1: p.y, x2: g.x, y2: g.y })),
  )

  const lines = friendLines
    .filter((c) => at.has(c.uids[0]) && at.has(c.uids[1]))
    .map((c) => ({ ...c, a: at.get(c.uids[0])!, b: at.get(c.uids[1])!, mine: c.uids.includes(me) }))

  const activate = (uid: string) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(uid)
    }
  }

  return (
    <div ref={ref} className="chart">
      {layout && (
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width="100%"
          height={layout.height}
          role="group"
          aria-label="Constellation chart. Use the list view for the same information as text."
        >
          {layout.regions.map((r) => (
            <g key={r.id} className="chart__region">
              <text x={r.x + 8} y={r.y + 22} className="chart__constellation" style={{ fontSize: Math.max(14, Math.min(19, r.w / 17)) }}>
                {r.name}
              </text>
              <line x1={r.x + 8} x2={r.x + Math.min(r.w - 24, 220)} y1={r.y + 30} y2={r.y + 30} className="chart__rule" />
            </g>
          ))}

          {layout.groups.map((g) => (
            <g key={g.id} className={`chart__group ${myGroupIds.has(g.id) ? 'is-mine' : ''}`}>
              <ellipse cx={g.x} cy={g.y} rx={g.r} ry={g.r * 0.92} filter="url(#pencil-soft)" />
              <a
                href={`/groups/${g.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(`/groups/${g.id}`)
                }}
              >
                <text x={g.label.x} y={g.label.y} textAnchor={g.label.anchor} className="chart__group-name">
                  {g.name}
                </text>
              </a>
            </g>
          ))}

          {ties.map((t) => (
            <line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className="chart__tie" />
          ))}

          {lines.map((l) => (
            <line
              key={l.id}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              className={`chart__link ${l.mine ? 'is-mine' : ''} ${l.status === 'pending' ? 'is-pending' : ''}`}
            />
          ))}

          {layout.people.map((p) => {
            const person = byId.get(p.uid)
            if (!person) return null
            const isMe = p.uid === me
            const { size, hit } = starDisc(p.size, isMe)
            const showName = isMe || selected === p.uid || hover === p.uid
            return (
              <g
                key={p.uid}
                transform={`translate(${p.x} ${p.y})`}
                className={`chart__person ${selected === p.uid ? 'is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${person.penName}${person.pro ? ', licensed professional' : ''}${isMe ? ' (you)' : ''}`}
                onClick={() => onSelect(p.uid)}
                onKeyDown={activate(p.uid)}
                onMouseEnter={() => setHover(p.uid)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(p.uid)}
                onBlur={() => setHover(null)}
              >
                <circle r={hit} className="chart__hit" />
                {(isMe || selected === p.uid) && <circle r={size / 2 + 4} className="chart__ring" filter="url(#pencil)" />}
                {person.pro && <circle r={size / 2 + 2} className="chart__pro" />}
                {urls[p.uid] ? (
                  <image href={urls[p.uid]} x={-size / 2} y={-size / 2} width={size} height={size} />
                ) : (
                  <circle r={size / 3} className="chart__dot" />
                )}
                {showName && (
                  <text y={size / 2 + 16} textAnchor="middle" className="chart__name">
                    {isMe ? `${person.penName} (you)` : person.penName}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}

      {layout && layout.loose.length > 0 && (
        <div className="chart__loose">
          <span className="code">Not in a group yet</span>
          <div className="row">
            {layout.loose.map((uid) => {
              const person = byId.get(uid)
              return person ? (
                <button key={uid} type="button" className="link-btn" onClick={() => onSelect(uid)}>
                  {uid === me ? `${person.penName} (you)` : person.penName}
                </button>
              ) : null
            })}
          </div>
        </div>
      )}
    </div>
  )
}
