import { FieldValue } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { db } from './app.js'

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

export const mirrorFriendship = onDocumentWritten('connections/{pairId}', (event) =>
  mirrorFriendshipOf(event.params.pairId, event.data?.after.data()),
)
