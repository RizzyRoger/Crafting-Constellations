import { FieldValue } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { db, snapshotOf } from './app.js'

// gRPC status for create() on a document that is already there
const ALREADY_EXISTS = 6

// Accepted connections are public on the constellation ("who is friends with
// who"); requests and blocks stay private to the two people. Events can come
// late, out of order or retried, so this mirrors the connection as it is now,
// read in the transaction: a block made meanwhile lands after this write, and
// its own event takes the line away.
export const mirrorFriendshipOf = (pairId: string) =>
  db.runTransaction(async (tx) => {
    const connection = (await tx.get(db.doc(`connections/${pairId}`))).data()
    const ref = db.doc(`friendships/${pairId}`)
    if (connection?.status === 'accepted') {
      tx.set(ref, { uids: connection.uids, since: connection.updatedAt ?? FieldValue.serverTimestamp() })
    } else {
      tx.delete(ref)
    }
  })

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

// Retried when a run fails: both steps are safe to repeat, and a dropped run would leave a
// blocked pair's line on the constellation (and an acceptance unannounced) until the next change
export const mirrorFriendship = onDocumentWritten({ document: 'connections/{pairId}', retry: true }, async (event) => {
  await mirrorFriendshipOf(event.params.pairId)
  await noticeOnAccept(event.params.pairId, event.data?.before.data()?.status, event.data?.after.data())
})
