import { FieldValue } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { db } from './app.js'

// Accepted connections are public on the constellation ("who is friends with
// who"); requests and blocks stay private to the two people.
export const mirrorFriendship = onDocumentWritten('connections/{pairId}', async (event) => {
  const after = event.data?.after.data()
  const ref = db.doc(`friendships/${event.params.pairId}`)
  if (after?.status === 'accepted') {
    await ref.set({ uids: after.uids, since: after.updatedAt ?? FieldValue.serverTimestamp() })
  } else {
    await ref.delete()
  }
})
