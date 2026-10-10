import { collection, collectionGroup, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { Quiet } from '../components/Quiet'
import { ConstellationList } from '../constellation/ConstellationList'
import { EgoMap } from '../constellation/EgoMap'
import { canReachOutTo, type EgoTie } from '../constellation/egoLayout'
import { PersonSheet } from '../constellation/PersonSheet'
import { db } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import type { Connection, Constellation as ConstellationDoc, Group, Profile } from '../lib/types'

type View = 'chart' | 'list'

const asTie = (id: string, uids: string[]): EgoTie | null => (uids.length === 2 ? { id, uids: [uids[0], uids[1]] } : null)

export const Constellation = () => {
  const { uid, claims } = useMe()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('chart')
  const [selected, setSelected] = useState<string | null>(params.get('person'))

  useEffect(() => {
    const requested = params.get('person')
    if (requested) setSelected(requested)
  }, [params])

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

  const friendshipTies = useMemo(
    () => friendships.data.flatMap((f) => { const tie = asTie(f.id, f.uids ?? []); return tie ? [tie] : [] }),
    [friendships.data],
  )
  const pendingTies = useMemo(
    () => connections.data.filter((c) => c.status === 'pending').flatMap((c) => { const tie = asTie(c.id, c.uids ?? []); return tie ? [tie] : [] }),
    [connections.data],
  )
  const blocked = useMemo(
    () => connections.data.filter((c) => c.status === 'blocked').map((c) => c.uids.find((id) => id !== uid) ?? '').filter(Boolean),
    [connections.data, uid],
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
  const incoming = connections.data.filter((c) => c.status === 'pending' && c.recipient === uid)
  const loading = constellations.loading || groups.loading || people.loading || friendships.loading

  const closeSheet = () => {
    setSelected(null)
    if (params.get('person')) {
      const next = new URLSearchParams(params)
      next.delete('person')
      setParams(next, { replace: true })
    }
  }

  return (
    <>
      <h1 className="visually-hidden">Your constellation</h1>

      {incoming.length > 0 && (
        <p className="banner pencil" style={{ marginBottom: 20 }}>
          {incoming.length === 1 ? 'Someone wants to connect with you.' : `${incoming.length} people want to connect with you.`}{' '}
          <button type="button" className="link-btn" onClick={() => setSelected(incoming[0].requester)}>
            See who
          </button>
        </p>
      )}

      <div className="view-switch" role="tablist" aria-label="View">
        {(['chart', 'list'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
            {v === 'chart' ? 'Chart' : 'List'}
          </button>
        ))}
      </div>

      {loading ? (
        <Quiet>Laying out the chart…</Quiet>
      ) : (
        <div className="constellation">
          {view === 'chart' ? (
            <EgoMap
              me={uid}
              people={visiblePeople}
              friendships={friendshipTies}
              pending={pendingTies}
              blocked={blocked}
              sharedGroups={sharedGroups}
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
              canReachOut={canReachOutTo(uid, person.id, friendshipTies, pendingTies, blocked)}
              onClose={closeSheet}
            />
          )}
        </div>
      )}
    </>
  )
}
