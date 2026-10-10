import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

initializeApp()

export const db = getFirestore()
export const auth = getAuth()
export const storage = getStorage()

// gRPC status for a missing document (update() on a deleted doc)
export const NOT_FOUND = 5

// Audit log: who did what to whom (ids only)
export const logAction = (actorUid: string, action: string, target: string, details: Record<string, unknown> = {}) =>
  db.collection('adminActions').add({ actorUid, action, target, details, at: FieldValue.serverTimestamp() })

// The nine pigments of the source sheet (mirrors src/wash/pigments.ts)
export const PIGMENTS = ['paynesBlue', 'graphite', 'fresco', 'paynes', 'titanium', 'caliente', 'neutral', 'cool', 'warm'] as const

export type ContentKind = 'post' | 'comment' | 'groupMessage' | 'dm' | 'profile'

// groups/g/posts/p, groups/g/posts/p/comments/c, groups/g/messages/m, dms/a_b/messages/m, users/u
export const kindOf = (path: string): ContentKind | null => {
  const s = path.split('/')
  if (s[0] === 'users' && s.length === 2) return 'profile'
  if (s[0] === 'dms' && s[2] === 'messages' && s.length === 4) return 'dm'
  if (s[0] === 'groups' && s[2] === 'messages' && s.length === 4) return 'groupMessage'
  if (s[0] === 'groups' && s[2] === 'posts' && s.length === 4) return 'post'
  if (s[0] === 'groups' && s[2] === 'posts' && s[4] === 'comments' && s.length === 6) return 'comment'
  return null
}

export const queueIdFor = (path: string) => path.replaceAll('/', '~')

export const textOf = (data: FirebaseFirestore.DocumentData | undefined) =>
  [data?.title, data?.body ?? data?.text].filter((v): v is string => typeof v === 'string').join('\n')
