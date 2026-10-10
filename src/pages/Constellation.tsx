import { collection, collectionGroup, orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { useMe } from '../auth/AuthProvider'
import { PageHead } from '../components/PageHead'
import { Quiet } from '../components/Quiet'
import { ConstellationList } from '../constellation/ConstellationList'
import { ConstellationMap } from '../constellation/ConstellationMap'
import { PersonSheet } from '../constellation/PersonSheet'
import { db } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import type { Connection, Constellation as ConstellationDoc, Group, Profile } from '../lib/types'

type View = 'chart' | 'list'

export const Constellation = () => {
  const { uid, claims } = useMe()
  const [view, setView] = useState<View>('chart')
  const [selected, setSelected] = useState<string | null>(null)

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

  const person = selected ? peopleById.get(selected) : undefined
  const connectionWith = (other: string) => (other === uid ? undefined : connections.data.find((c) => c.uids.includes(other)))
  const groupsOf = (other: string) => groups.data.filter((g) => memberships.some((m) => m.uid === other && m.groupId === g.id))

  // Everyone's accepted friendships, plus my own pending requests (dashed)
  const lines = useMemo(
    () => [
      ...friendships.data.map((f) => ({ id: f.id, uids: f.uids, status: 'accepted' as const })),
      ...connections.data.filter((c) => c.status === 'pending').map((c) => ({ id: c.id, uids: c.uids, status: 'pending' as const })),
    ],
    [friendships.data, connections.data],
  )

  const loading = constellations.loading || groups.loading || people.loading
  const incoming = connections.data.filter((c) => c.status === 'pending' && c.recipient === uid)

  return (
    <>
      <PageHead
        title="Your constellation"
        kicker="Constellation — PB29 / PBk6"
        lede="Groups are drawn as circles, people as small washes. Lines are people who have connected. Choose anyone to see what you can do."
      />

      {incoming.length > 0 && (
        <p className="banner pencil" style={{ marginBottom: 20 }}>
          {incoming.length === 1 ? 'Someone wants to connect with you.' : `${incoming.length} people want to connect with you.`}{' '}
          <button type="button" className="link-btn" onClick={() => setSelected(incoming[0].requester)}>
            See who
          </button>
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="View">
        {(['chart', 'list'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
            {v === 'chart' ? 'Chart' : 'List'}
          </button>
        ))}
      </div>

      {loading ? (
        <Quiet>Laying out the sheet…</Quiet>
      ) : (
        <div className="constellation">
          {view === 'chart' ? (
            <ConstellationMap
              constellations={constellations.data}
              groups={groups.data}
              memberships={memberships}
              people={visiblePeople}
              lines={lines}
              me={uid}
              myGroupIds={myGroupIds}
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <ConstellationList
              constellations={constellations.data}
              groups={groups.data}
              memberships={memberships}
              people={peopleById}
              myGroupIds={myGroupIds}
              me={uid}
              onSelect={setSelected}
            />
          )}

          {person && (
            <PersonSheet
              key={person.id}
              person={person}
              me={uid}
              verified={claims.emailVerified}
              connection={connectionWith(person.id)}
              groups={groupsOf(person.id)}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}
    </>
  )
}
