import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from './firebase'
import type { Content } from './types'

// Pending writes have no server time yet; estimate so they sort where they belong
const withId = <T>(snap: QueryDocumentSnapshot | DocumentSnapshot) =>
  ({ id: snap.id, path: snap.ref.path, ...snap.data({ serverTimestamps: 'estimate' }) }) as T

export interface Live<T> {
  data: T
  loading: boolean
  error: Error | null
}

export interface LiveDoc<T> extends Live<T | null> {
  // true while the latest state is only a local, unconfirmed write
  pending: boolean
}

export interface LiveRows<T> extends Live<T[]> {
  // true once the server has answered (or refused), and stays true offline. The first
  // answer can come from the cache, holding only what other listens happened to bring
  synced: boolean
}

// State keeps the key it answered. A route param can change the key while the last
// answer is still held, and that answer is about something else
type Answered<S> = S & { key: string | null }

// Shared by every hook while it has nothing, so frozen
const NONE = Object.freeze([]) as never[]

// One live document; `path` null means "not yet" (e.g. waiting for auth)
export const useDocData = <T>(path: string | null): LiveDoc<T> => {
  const [state, setState] = useState<Answered<LiveDoc<T>>>({ key: null, data: null, loading: false, error: null, pending: false })

  useEffect(() => {
    if (!path) {
      setState({ key: null, data: null, loading: false, error: null, pending: false })
      return
    }
    return onSnapshot(
      doc(db, path),
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          key: path,
          data: snap.exists() ? withId<T>(snap) : null,
          loading: false,
          error: null,
          pending: snap.metadata.hasPendingWrites,
        }),
      (error) => setState({ key: path, data: null, loading: false, error, pending: false }),
    )
  }, [path])

  // Another path's document is another thing (Back to a group I'm not in must not
  // read as the one I am in), so nothing shows until this one's comes
  return state.key === path ? state : { data: null, loading: Boolean(path), error: null, pending: false }
}

// One query's latest rows, with the key they answered
const useRows = <T>(key: string | null, build: () => Query) => {
  const [state, setState] = useState<Answered<LiveRows<T>>>({ key: null, data: [], loading: false, error: null, synced: false })

  useEffect(() => {
    if (!key) {
      setState({ key: null, data: [], loading: false, error: null, synced: false })
      return
    }
    // This listen's own: whether it has answered yet, and whether the server has
    let answered = false
    let synced = false
    return onSnapshot(
      build(),
      // Metadata too, only to hear the server answer after the cache did
      { includeMetadataChanges: true },
      (snap) => {
        const changed = !answered || snap.docChanges().length > 0
        const heard = synced || !snap.metadata.fromCache
        // Only metadata, and not the server's first answer: nothing to show
        if (!changed && heard === synced) return
        answered = true
        synced = heard
        if (changed) setState({ key, data: snap.docs.map((d) => withId<T>(d)), loading: false, error: null, synced: heard })
        // The same rows, so nothing built from them changes
        else setState((last) => ({ ...last, synced: heard }))
      },
      (error) => setState({ key, data: [], loading: false, error, synced: true }),
    )
    // build is derived from key by the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

// This key's rows, or none yet: never the last key's
const current = <T>(state: Answered<LiveRows<T>>, key: string | null): LiveRows<T> =>
  state.key === key ? state : { data: NONE, loading: Boolean(key), error: null, synced: false }

// One live query; `key` must change whenever the query changes
export const useQueryData = <T>(key: string | null, build: () => Query): Live<T[]> => {
  const state = useRows<T>(key, build)
  // A new key says loading at once but keeps the last rows until its own come, so search
  // results don't blank between keystrokes. Read them as this key's only once loaded
  if (key && state.key !== key) return { data: state.data, loading: true, error: null }
  return current(state, key)
}

const HIDDEN = new Set(['removed', 'withdrawn'])

const millis = (c: Content) => c.createdAt?.toMillis() ?? Date.now()

// Once the published window is full, my published items from before it stay out: nobody
// else's writing from their time is there, so they'd read as a run of mine nobody
// answered. My pending and held writing always shows
export const mergeLive = <T extends Content>(
  published: T[],
  mine: T[],
  { direction, max }: { direction: 'asc' | 'desc'; max: number },
): T[] => {
  const since = published.length >= max ? Math.min(...published.map(millis)) : -Infinity
  const byId = new Map<string, T>()
  published.forEach((item) => byId.set(item.id, item))
  mine.filter((item) => item.status !== 'published' || millis(item) >= since).forEach((item) => byId.set(item.id, item))
  const items = [...byId.values()].filter((item) => !HIDDEN.has(item.status))
  return items.sort((a, b) => (direction === 'asc' ? millis(a) - millis(b) : millis(b) - millis(a)))
}

// Rules only allow two shapes of read: published items, or my own items.
// Listen to both and merge, so my pending/held writing shows in place.
export const useLiveContent = <T extends Content>(
  collectionPath: string | null,
  me: string | null,
  { direction = 'desc', max = 50 }: { direction?: 'asc' | 'desc'; max?: number } = {},
): LiveRows<T> => {
  const key = collectionPath && me ? `${collectionPath}|${me}|${max}` : null
  const pubKey = key && `pub|${key}`
  const mineKey = key && `mine|${key}`
  const pubRows = useRows<T>(pubKey, () =>
    query(collection(db, collectionPath!), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(max)),
  )
  const mineRows = useRows<T>(mineKey, () =>
    query(collection(db, collectionPath!), where('authorUid', '==', me!), orderBy('createdAt', 'desc'), limit(20)),
  )
  // Only this collection's rows: the last one's are another conversation
  const published = current(pubRows, pubKey)
  const mine = current(mineRows, mineKey)

  const data = useMemo(() => mergeLive(published.data, mine.data, { direction, max }), [published.data, mine.data, direction, max])

  return {
    data,
    loading: published.loading || mine.loading,
    error: published.error ?? mine.error,
    // Apart from loading, so offline the cache's rows still show. Until both lists have
    // heard from the server, what's here can be only the part the other one brought
    synced: published.synced && mine.synced,
  }
}
