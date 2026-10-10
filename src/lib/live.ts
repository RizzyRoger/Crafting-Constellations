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

// One live document; `path` null means "not yet" (e.g. waiting for auth)
export const useDocData = <T>(path: string | null): LiveDoc<T> => {
  const [state, setState] = useState<LiveDoc<T>>({ data: null, loading: Boolean(path), error: null, pending: false })

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null, pending: false })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    return onSnapshot(
      doc(db, path),
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          data: snap.exists() ? withId<T>(snap) : null,
          loading: false,
          error: null,
          pending: snap.metadata.hasPendingWrites,
        }),
      (error) => setState({ data: null, loading: false, error, pending: false }),
    )
  }, [path])

  return state
}

// One live query; `key` must change whenever the query changes
export const useQueryData = <T>(key: string | null, build: () => Query): Live<T[]> => {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: Boolean(key), error: null })

  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    return onSnapshot(
      build(),
      (snap) => setState({ data: snap.docs.map((d) => withId<T>(d)), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    )
    // build is derived from key by the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

const HIDDEN = new Set(['removed', 'withdrawn'])

const millis = (c: Content) => c.createdAt?.toMillis() ?? Date.now()

// Rules only allow two shapes of read: published items, or my own items.
// Listen to both and merge, so my pending/held writing shows in place.
export const useLiveContent = <T extends Content>(
  collectionPath: string | null,
  me: string | null,
  { direction = 'desc', max = 50 }: { direction?: 'asc' | 'desc'; max?: number } = {},
): Live<T[]> => {
  const key = collectionPath && me ? `${collectionPath}|${me}|${max}` : null
  const published = useQueryData<T>(key && `pub|${key}`, () =>
    query(collection(db, collectionPath!), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(max)),
  )
  const mine = useQueryData<T>(key && `mine|${key}`, () =>
    query(collection(db, collectionPath!), where('authorUid', '==', me!), orderBy('createdAt', 'desc'), limit(20)),
  )

  const data = useMemo(() => {
    const byId = new Map<string, T>()
    published.data.forEach((item) => byId.set(item.id, item))
    mine.data.forEach((item) => byId.set(item.id, item))
    const items = [...byId.values()].filter((item) => !HIDDEN.has(item.status))
    return items.sort((a, b) => (direction === 'asc' ? millis(a) - millis(b) : millis(b) - millis(a)))
  }, [published.data, mine.data, direction])

  return { data, loading: published.loading || mine.loading, error: published.error ?? mine.error }
}
