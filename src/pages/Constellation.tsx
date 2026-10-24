import { collection, collectionGroup, orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { Quiet } from '../components/Quiet'
import { ConstellationList } from '../constellation/ConstellationList'
import { ConstellationMap } from '../constellation/ConstellationMap'
import { EgoMap } from '../constellation/EgoMap'
import { chartIsEmpty, type EgoTie } from '../constellation/egoLayout'
import { PersonSheet } from '../constellation/PersonSheet'
import { CHOOSE, sheetMayOpen } from '../constellation/sheetReveal'
import { db } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import { waitingOn, withVisible } from '../lib/people'
import type { Connection, Constellation as ConstellationDoc, Group, Profile } from '../lib/types'
import { Blot } from '../wash/Blot'

type View = 'friends' | 'groups' | 'list'

const VIEWS: { id: View; label: string }[] = [
  { id: 'friends', label: 'Friends' },
  { id: 'groups', label: 'Groups' },
  { id: 'list', label: 'List' },
]

const asTie = (id: string, uids: string[]): EgoTie | null => (uids.length === 2 ? { id, uids: [uids[0], uids[1]] } : null)

const isView = (value: string | null): value is View => value === 'friends' || value === 'groups' || value === 'list'

export const Constellation = () => {
  const { uid, profile, claims } = useMe()
  const [params, setParams] = useSearchParams()
  const requested = params.get('view')
  const view: View = isView(requested) ? requested : 'friends'
  // Whoever the address names is open, so the two always agree: searching for someone already
  // named there still opens them after choosing someone else, and a reload reopens who's on screen
  const selected = params.get('person')

  const setView = (next: View) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'friends') nextParams.delete('view')
    else nextParams.set('view', next)
    setParams(nextParams, { replace: true })
  }

  const selectPerson = (person: string | null) => {
    const nextParams = new URLSearchParams(params)
    if (person) nextParams.set('person', person)
    else nextParams.delete('person')
    // Marked as a choice, so choosing whoever is open already still brings their sheet up
    setParams(nextParams, { replace: true, state: person ? CHOOSE : undefined })
  }

  const constellations = useQueryData<ConstellationDoc>('constellations', () => query(collection(db, 'constellations'), orderBy('order')))
  const groups = useQueryData<Group>('groups', () => collection(db, 'groups'))
  const members = useQueryData<{ id: string; path: string; uid: string }>('all-members', () => collectionGroup(db, 'members'))
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const connections = useQueryData<Connection>(`connections|${uid}`, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )
  const friendships = useQueryData<{ id: string; uids: [string, string] }>('friendships', () => collection(db, 'friendships'))

  const memberships = useMemo(() => members.data.map((m) => ({ groupId: m.path.split('/')[1], uid: m.uid })), [members.data])
  const visiblePeople = useMemo(() => people.data.filter((p) => !p.banned), [people.data])
  const peopleById = useMemo(() => new Map(visiblePeople.map((p) => [p.id, p])), [visiblePeople])
  const myGroupIds = useMemo(() => new Set(memberships.filter((m) => m.uid === uid).map((m) => m.groupId)), [memberships, uid])

  // Only ties among people with a visible profile, so a banned friend isn't a dot that opens nothing
  const friendshipTies = useMemo(
    () => withVisible(friendships.data.flatMap((f) => { const tie = asTie(f.id, f.uids ?? []); return tie ? [tie] : [] }), peopleById, uid),
    [friendships.data, peopleById, uid],
  )
  const pendingTies = useMemo(
    () =>
      withVisible(
        connections.data.filter((c) => c.status === 'pending').flatMap((c) => { const tie = asTie(c.id, c.uids ?? []); return tie ? [tie] : [] }),
        peopleById,
        uid,
      ),
    [connections.data, peopleById, uid],
  )
  const blocked = useMemo(
    () => connections.data.filter((c) => c.status === 'blocked').map((c) => c.uids.find((id) => id !== uid) ?? '').filter(Boolean),
    [connections.data, uid],
  )
  // Everyone's friendships are listened to, so the welcome asks about yours, not the site's
  const alone = useMemo(
    () => chartIsEmpty({ me: uid, friendships: friendshipTies, pending: pendingTies, blocked }),
    [uid, friendshipTies, pendingTies, blocked],
  )
  const sharedGroups = useMemo(() => {
    const mine = new Set(memberships.filter((m) => m.uid === uid).map((m) => m.groupId))
    const counts: Record<string, number> = {}
    for (const membership of memberships) {
      if (mine.has(membership.groupId)) counts[membership.uid] = (counts[membership.uid] ?? 0) + 1
    }
    return counts
  }, [memberships, uid])

  const person = selected ? peopleById.get(selected) : undefined
  const connectionWith = (other: string) => (other === uid ? undefined : connections.data.find((c) => c.uids.includes(other)))
  const groupsOf = (other: string) => groups.data.filter((g) => memberships.some((m) => m.uid === other && m.groupId === g.id))
  const incoming = useMemo(() => waitingOn(connections.data, peopleById, uid), [connections.data, peopleById, uid])
  const waiting = useMemo(() => incoming.map((c) => c.requester), [incoming])
  const loading = constellations.loading || groups.loading || people.loading || friendships.loading || connections.loading

  // A sheet that comes up with the page waits for the groups chart to have its height (sheetReveal)
  const [groupsLaidOut, setGroupsLaidOut] = useState(false)
  const [sheetMay, setSheetMay] = useState(false)
  const mayOpen = sheetMayOpen(sheetMay, { loading, view, chartLaidOut: groupsLaidOut })
  if (mayOpen !== sheetMay) setSheetMay(mayOpen)

  return (
    <>
      <h1 className="visually-hidden">Your constellation</h1>

      {incoming.length > 0 && (
        <p className="banner pencil" style={{ marginBottom: 20 }}>
          {incoming.length === 1 ? 'Someone wants to connect with you.' : `${incoming.length} people want to connect with you.`}{' '}
          <button type="button" className="link-btn" onClick={() => selectPerson(incoming[0].requester)}>
            See who
          </button>
        </p>
      )}

      <div className="view-switch" role="tablist" aria-label="View">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Quiet>Laying out the chart…</Quiet>
      ) : (
        // Not focusable, so a click on its text keeps Tab where the click was. A sheet closing with
        // nothing on the chart to go back to (the rail search chose them) focuses it for that move only
        <div className="constellation">
          {view === 'friends' ? (
            alone ? (
              <ChartWelcome
                seed={profile.avatarSeed || uid}
                pigment={profile.pigment}
                groups={groups.data.filter((group) => !myGroupIds.has(group.id))}
                onGroups={() => setView('groups')}
              />
            ) : (
              <EgoMap
                me={uid}
                people={visiblePeople}
                friendships={friendshipTies}
                pending={pendingTies}
                blocked={blocked}
                waiting={waiting}
                sharedGroups={sharedGroups}
                selected={selected}
                onSelect={selectPerson}
              />
            )
          ) : view === 'groups' ? (
            <ConstellationMap
              constellations={constellations.data}
              groups={groups.data}
              memberships={memberships}
              people={visiblePeople}
              lines={[
                ...friendshipTies.map((tie) => ({ ...tie, status: 'accepted' as const })),
                ...pendingTies.map((tie) => ({ ...tie, status: 'pending' as const })),
              ]}
              me={uid}
              myGroupIds={myGroupIds}
              selected={selected}
              onSelect={selectPerson}
              onLaidOut={setGroupsLaidOut}
            />
          ) : (
            <ConstellationList
              constellations={constellations.data}
              groups={groups.data}
              memberships={memberships}
              people={peopleById}
              myGroupIds={myGroupIds}
              me={uid}
              friendships={friendshipTies}
              pending={pendingTies}
              waiting={waiting}
              blocked={blocked}
              onSelect={selectPerson}
            />
          )}

          {person && mayOpen && (
            <PersonSheet
              key={person.id}
              person={person}
              me={uid}
              verified={claims.emailVerified}
              connection={connectionWith(person.id)}
              groups={groupsOf(person.id)}
              onClose={() => selectPerson(null)}
            />
          )}
        </div>
      )}
    </>
  )
}

const ChartWelcome = ({
  seed,
  pigment,
  groups,
  onGroups,
}: {
  seed: string
  pigment: Profile['pigment']
  groups: Group[]
  onGroups: () => void
}) => (
  <section className="chart-welcome" aria-label="Your chart">
    <Blot seed={seed} pigment={pigment} size={72} />
    <p className="chart-welcome__lead">This chart is yours for now. It fills in as people connect with you.</p>
    {groups.length > 0 && (
      <>
        <h2>Groups you can join</h2>
        <ul className="ruled-list">
          {groups.map((group) => (
            <li key={group.id}>
              <Link to={`/groups/${group.id}`}>{group.name}</Link>
              {group.constellationName && <span className="meta">{group.constellationName}</span>}
            </li>
          ))}
        </ul>
      </>
    )}
    <button type="button" className="link-btn" onClick={onGroups}>
      See the groups chart
    </button>
  </section>
)
