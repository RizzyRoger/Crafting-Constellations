import { FieldValue } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { db, NOT_FOUND } from './app.js'

const existed = (snap: { exists: boolean } | undefined) => Number(snap?.exists ?? false)
const published = (snap: { data: () => FirebaseFirestore.DocumentData | undefined } | undefined) =>
  Number(snap?.data()?.status === 'published')

// update, never set: a late delete-trigger must not resurrect a removed parent
const bump = async (path: string, field: string, delta: number) => {
  if (delta === 0) return
  await db
    .doc(path)
    .update({ [field]: FieldValue.increment(delta) })
    .catch((error: { code?: number }) => {
      if (error.code !== NOT_FOUND) throw error
    })
}

export const countMembers = onDocumentWritten('groups/{gid}/members/{uid}', async (event) => {
  const delta = existed(event.data?.after) - existed(event.data?.before)
  await bump(`groups/${event.params.gid}`, 'memberCount', delta)
})

export const countLikes = onDocumentWritten('groups/{gid}/posts/{pid}/likes/{uid}', async (event) => {
  const delta = existed(event.data?.after) - existed(event.data?.before)
  await bump(`groups/${event.params.gid}/posts/${event.params.pid}`, 'likeCount', delta)
})

// Only published comments count, so publish / approve / remove / withdraw all land here
export const countComments = onDocumentWritten('groups/{gid}/posts/{pid}/comments/{cid}', async (event) => {
  const delta = published(event.data?.after) - published(event.data?.before)
  await bump(`groups/${event.params.gid}/posts/${event.params.pid}`, 'commentCount', delta)
})
