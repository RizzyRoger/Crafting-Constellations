import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db } from './app.js'
import { checkPenName } from './moderation/index.js'

export const MAX_CHAT_PEOPLE = 20

const pairIdOf = (a: string, b: string) => [a, b].sort().join('_')

// A small private chat among people the creator is already connected with.
// Members are fixed here; each can leave on their own (see firestore.rules).
export const createChat = onCall<{ name: string; uids: string[] }>(async (request) => {
  const me = request.auth?.uid
  if (!me) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (request.auth?.token.email_verified !== true) throw new HttpsError('permission-denied', 'Confirm your email first.')
  if ((await db.doc(`bans/${me}`).get()).exists) throw new HttpsError('permission-denied', 'This account is paused.')

  const name = checkPenName(typeof request.data?.name === 'string' ? request.data.name : '')
  if (!name.ok) throw new HttpsError('invalid-argument', 'name', { problem: name.problem })

  const raw: unknown = request.data?.uids
  const others = Array.isArray(raw)
    ? [...new Set(raw.filter((uid): uid is string => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && uid !== me))]
    : []
  if (others.length === 0 || others.length > MAX_CHAT_PEOPLE - 1) throw new HttpsError('invalid-argument', 'uids')

  const connections = await db.getAll(...others.map((uid) => db.doc(`connections/${pairIdOf(me, uid)}`)))
  if (connections.some((snap) => snap.data()?.status !== 'accepted')) {
    throw new HttpsError('failed-precondition', 'Only people you are connected with.')
  }

  const ref = db.collection('chats').doc()
  await ref.set({
    name: name.value,
    uids: [me, ...others],
    createdBy: me,
    createdAt: FieldValue.serverTimestamp(),
    lastMessageAt: null,
  })
  return { ok: true, id: ref.id }
})
