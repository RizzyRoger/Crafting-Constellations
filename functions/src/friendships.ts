import { FieldValue } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { db, snapshotOf } from './app.js'

// gRPC status for create() on a document that is already there
const ALREADY_EXISTS = 6

// Accepted connections are public on the constellation ("who is friends with
// who"); requests and blocks stay private to the two people.
export const mirrorFriendshipOf = async (pairId: string, after: FirebaseFirestore.DocumentData | undefined) => {
  const ref = db.doc(`friendships/${pairId}`)
  if (after?.status === 'accepted') {
    await ref.set({ uids: after.uids, since: after.updatedAt ?? FieldValue.serverTimestamp() })
  } else {
    await ref.delete()
  }
}

// The person who reached out hears when a request is accepted. The id names
// that acceptance, so a retry can't add a second notice or mark it unread again.
export const noticeOnAccept = async (pairId: string, before: string | undefined, after: FirebaseFirestore.DocumentData | undefined) => {
  if (before !== 'pending' || after?.status !== 'accepted') return
  const requester: string = after.requester
  const recipient: string = after.recipient
  const [requesterSnap, recipientSnap] = await db.getAll(db.doc(`users/${requester}`), db.doc(`users/${recipient}`))
  if (!requesterSnap.exists || !recipientSnap.exists) return

  const acceptedAt: number = after.updatedAt?.toMillis?.() ?? 0
  await db
    .doc(`users/${requester}/notices/accepted~${pairId}~${acceptedAt}`)
    .create({
      type: 'accepted',
      actorUid: recipient,
      actor: snapshotOf(recipient, recipientSnap.data()),
      createdAt: FieldValue.serverTimestamp(),
      seen: false,
    })
    .catch((error: { code?: number }) => {
      if (error.code !== ALREADY_EXISTS) throw error
    })
}

export const mirrorFriendship = onDocumentWritten('connections/{pairId}', async (event) => {
  const after = event.data?.after.data()
  await mirrorFriendshipOf(event.params.pairId, after)
  await noticeOnAccept(event.params.pairId, event.data?.before.data()?.status, after)
})
