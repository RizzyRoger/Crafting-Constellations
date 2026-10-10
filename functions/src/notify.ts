import { FieldValue, type DocumentData, type Transaction } from 'firebase-admin/firestore'
import { db, kindOf, pairIdOf, queueIdFor, textOf } from './app.js'
import type { Mentioned } from './moderation/index.js'
import { commentRecipient, pickMentioned, requestedMentions, type Reader } from './notifyPolicy.js'

export interface NoticeWrite {
  path: string
  data: DocumentData
}

export interface PlannedNotices {
  mentioned: Mentioned[]
  writes: NoticeWrite[]
}

export const NO_NOTICES: PlannedNotices = { mentioned: [], writes: [] }

// Who a piece of writing pings as it is published: people picked with @ who
// can read it, and the post's writer for a comment. Reads only, so it runs
// inside the publishing transaction ahead of its writes. Notices hold no copy
// of the words: the page reads them live, so withdrawn writing is gone there too.
// `contentAt` (the writing's own time) lets it ask for them as "published, at
// this time" — a query the rules always allow, unlike reading the document.
export const planNotices = async (tx: Transaction, path: string, data: DocumentData, actor: DocumentData): Promise<PlannedNotices> => {
  const kind = kindOf(path)
  if (kind !== 'post' && kind !== 'comment' && kind !== 'groupMessage' && kind !== 'chatMessage') return NO_NOTICES

  const authorUid: string = data.authorUid
  const [, placeId, , postId] = path.split('/')
  const inChat = kind === 'chatMessage'
  const requested = requestedMentions(data.mentions, authorUid)

  const [chat, post] = await Promise.all([
    inChat ? tx.get(db.doc(`chats/${placeId}`)) : undefined,
    kind === 'comment' ? tx.get(db.doc(`groups/${placeId}/posts/${postId}`)) : undefined,
  ])
  const postAuthorUid: string | undefined = post?.data()?.authorUid
  const uids = [...new Set([...requested, ...(postAuthorUid ? [postAuthorUid] : [])])].filter((uid) => uid !== authorUid)
  if (uids.length === 0) return NO_NOTICES

  // Per person: profile, the connection with the writer (for blocks), and membership in a group
  const chatUids: string[] = chat?.data()?.uids ?? []
  const per = inChat ? 2 : 3
  const snaps = await tx.getAll(
    ...uids.flatMap((uid) => [
      db.doc(`users/${uid}`),
      db.doc(`connections/${pairIdOf(authorUid, uid)}`),
      ...(inChat ? [] : [db.doc(`groups/${placeId}/members/${uid}`)]),
    ]),
  )
  const readers = new Map<string, Reader>(
    uids.map((uid, i) => {
      const [profile, connection, member] = snaps.slice(i * per, i * per + per)
      return [
        uid,
        {
          uid,
          penName: profile.data()?.penName,
          banned: profile.data()?.banned === true,
          canRead: inChat ? chatUids.includes(uid) : member.exists,
          blocked: connection.data()?.status === 'blocked',
        },
      ]
    }),
  )

  const mentioned = pickMentioned(textOf(data), requested, readers)
  const commented = postAuthorUid ? commentRecipient(readers.get(postAuthorUid), authorUid, mentioned) : null
  // One notice per person per piece of writing: ids are fixed, so a retry can't double them
  const notice = (type: 'mention' | 'comment', uid: string): NoticeWrite => ({
    path: `users/${uid}/notices/${type}~${queueIdFor(path)}`,
    data: {
      type,
      contentPath: path,
      ...(data.createdAt ? { contentAt: data.createdAt } : {}),
      actorUid: authorUid,
      actor,
      createdAt: FieldValue.serverTimestamp(),
      seen: false,
    },
  })

  return {
    mentioned,
    writes: [...mentioned.map((m) => notice('mention', m.uid)), ...(commented ? [notice('comment', commented)] : [])],
  }
}

export const applyNotices = (tx: Transaction, planned: PlannedNotices) =>
  planned.writes.forEach((write) => tx.set(db.doc(write.path), write.data))
