import { Link } from 'react-router-dom'
import type { Constellation, Group, Membership, Profile } from '../lib/types'

interface ListProps {
  constellations: Constellation[]
  groups: Group[]
  memberships: Membership[]
  people: Map<string, Profile>
  myGroupIds: Set<string>
  me: string
  onSelect: (uid: string) => void
}

// The same chart as plain text, for screen readers and small screens
export const ConstellationList = ({ constellations, groups, memberships, people, myGroupIds, me, onSelect }: ListProps) => (
  <div className="stack" style={{ gap: 32 }}>
    {constellations.map((c) => (
      <section key={c.id} className="stack" aria-labelledby={`c-${c.id}`}>
        <div className="section__head">
          <h2 id={`c-${c.id}`}>{c.name}</h2>
          {c.description && <span className="code">{c.description}</span>}
        </div>
        <ul className="ruled-list">
          {groups
            .filter((g) => g.constellationId === c.id)
            .map((g) => {
              const members = memberships.filter((m) => m.groupId === g.id).map((m) => people.get(m.uid)).filter((p): p is Profile => Boolean(p))
              return (
                <li key={g.id} className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <Link to={`/groups/${g.id}`} className="post__title">
                      {g.name}
                    </Link>
                    <span className="meta">
                      {members.length} {members.length === 1 ? 'person' : 'people'}
                      {myGroupIds.has(g.id) ? ' · you’re here' : ''}
                    </span>
                  </div>
                  {g.description && <p className="pencil note">{g.description}</p>}
                  <div className="row" style={{ gap: '4px 14px' }}>
                    {members.map((p) => (
                      <button key={p.id} type="button" className="link-btn" onClick={() => onSelect(p.id)}>
                        {p.id === me ? `${p.penName} (you)` : p.penName}
                        {p.pro ? ' · licensed' : ''}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
        </ul>
      </section>
    ))}
  </div>
)
