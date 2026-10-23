import { Link } from 'react-router-dom'
import type { Constellation, Group, Membership, Profile } from '../lib/types'
import type { EgoTie } from './egoLayout'
import { andList, listing } from './inWords'

interface ListProps {
  constellations: Constellation[]
  groups: Group[]
  memberships: Membership[]
  people: Map<string, Profile>
  myGroupIds: Set<string>
  me: string
  friendships: EgoTie[]
  pending: EgoTie[]
  waiting: string[]
  blocked: string[]
  onSelect: (uid: string) => void
}

// The same charts as plain text, for screen readers and small screens: who is around you,
// the groups and who is in them, who is in none yet, and who is friends with whom
export const ConstellationList = ({ constellations, groups, memberships, people, myGroupIds, me, friendships, pending, waiting, blocked, onSelect }: ListProps) => {
  const list = listing({ me, people, groups, memberships, friendships, pending, waiting, blocked })
  const name = (uid: string) => (uid === me ? 'you' : (people.get(uid)?.penName ?? 'someone'))
  const star = (p: Profile) => (
    <button key={p.id} type="button" className="link-btn" onClick={() => onSelect(p.id)}>
      {p.id === me ? `${p.penName} (you)` : p.penName}
      {p.pro ? ' · licensed' : ''}
    </button>
  )
  const stars = (uids: string[]) => uids.map((uid) => people.get(uid)).filter((p): p is Profile => Boolean(p)).map(star)
  const around = [
    { label: 'Asked to connect with you', names: stars(list.waiting) },
    { label: 'Friends', names: stars(list.friends) },
    { label: 'You asked to connect', names: stars(list.sent) },
    {
      label: 'Friends’ friends',
      names: list.further.flatMap(({ uid, through }) => {
        const p = people.get(uid)
        return p ? [<span key={uid}>{star(p)} <span className="meta">through {andList(through.map(name))}</span></span>] : []
      }),
    },
  ].filter((part) => part.names.length > 0)

  return (
    <div className="stack" style={{ gap: 32 }}>
      <section className="stack" aria-labelledby="list-around">
        <div className="section__head">
          <h2 id="list-around">People connected to you</h2>
        </div>
        {around.length === 0 ? (
          <p className="pencil note">No friends or requests yet.</p>
        ) : (
          <ul className="ruled-list">
            {around.map((part) => (
              <li key={part.label} className="stack" style={{ gap: 6 }}>
                <span className="code">{part.label}</span>
                <div className="row" style={{ gap: '4px 14px' }}>
                  {part.names}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                      {members.map(star)}
                    </div>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}

      {list.loose.length > 0 && (
        <section className="stack" aria-labelledby="list-loose">
          <div className="section__head">
            <h2 id="list-loose">Not in a group yet</h2>
          </div>
          <div className="row" style={{ gap: '4px 14px' }}>
            {stars(list.loose)}
          </div>
        </section>
      )}

      {list.ties.length > 0 && (
        <section className="stack" aria-labelledby="list-ties">
          <div className="section__head">
            <h2 id="list-ties">Friendships</h2>
          </div>
          <ul className="ruled-list ruled-list--tight">
            {list.ties.flatMap(({ uid, friends }) => {
              const p = people.get(uid)
              return p
                ? [
                    <li key={uid} className="row" style={{ gap: '4px 10px' }}>
                      {star(p)}
                      <span className="meta">friends with {andList(friends.map(name))}</span>
                    </li>,
                  ]
                : []
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
