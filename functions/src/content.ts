import { FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { db, kindOf, queueIdFor, snapshotOf, textOf, type ContentKind } from './app.js'
import { judgePace } from './moderation/flood.js'
import { moderate } from './moderation/index.js'
import { applyNotices, NO_NOTICES, planNotices } from './notify.js'

// Every new piece of writing arrives `pending`. This decides, once:
// - clean                 → published, with the author's name + licensed mark attached
// - crisis in a DM / chat → published with `crisis: true` (everyone in it sees resources), queued at priority 2
// - crisis elsewhere      → held for a person to read; the author sees resources
// - anything else flagged → held, queued for review
// - DM, no longer connected → held, marked `undelivered` for its writer (and queued if flagged)
// - author banned or gone → removed (gone: deleted their account while this was in flight)
// Whatever is delivered pings the people picked with @ and, for a comment, the post's writer.
export const handleNewContent = async (ref: DocumentReference) => {
  const kind = kindOf(ref.path)
  if (!kind || kind === 'profile') return

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.data()
    if (!data || data.status !== 'pending') return

    const authorUid: string = data.authorUid
    const segments = ref.path.split('/')
    const pairId = kind === 'dm' ? segments[1] : undefined
    const chatId = kind === 'chatMessage' ? segments[1] : undefined
    const rateRef = db.doc(`rateLimits/${authorUid}`)
    const [userSnap, banSnap, rateSnap, connection] = await Promise.all([
      tx.get(db.doc(`users/${authorUid}`)),
      tx.get(db.doc(`bans/${authorUid}`)),
      tx.get(rateRef),
      pairId ? tx.get(db.doc(`connections/${pairId}`)) : undefined,
    ])
    const now = FieldValue.serverTimestamp()
    // Paced by when it was written (createdAt is the server's time, held by the rules), so a
    // backlog the local backend catches up on after downtime isn't taken for a burst
    const writtenAt: number = data.createdAt?.toMillis?.() ?? Date.now()
    const text = textOf(data)
    // Talk and replies are paced as texting, posts more slowly, each in its own log
    const paced = judgePace(kind, rateSnap.data(), { writtenAt, place: ref.parent.path, text })

    if (banSnap.exists || !userSnap.exists) {
      tx.update(ref, { status: 'removed', removedBy: 'automod', removedAt: now })
      return
    }

    const author = snapshotOf(authorUid, userSnap.data())

    const privateThread = kind === 'dm' || kind === 'chatMessage'
    const verdict = moderate(text, { context: privateThread ? 'private' : 'public' })
    const floodHold = (paced.flooded || paced.repeated) && verdict.action === 'publish' && !verdict.crisis
    const action = floodHold ? 'hold' : verdict.action
    const categories = floodHold ? [...verdict.categories, 'spam'] : verdict.categories
    const floodTerm = paced.flooded ? 'too many notes' : 'the same note again'
    const matches = floodHold ? [...verdict.matches, { category: 'spam' as const, term: floodTerm }] : verdict.matches
    const crisisOnly = verdict.crisis && verdict.categories.every((c) => c === 'selfHarm')
    // A note was written while the two were connected, but may have waited since (the backend
    // off, a retry): as with Approve, it goes out only while they still are. A chat line still
    // goes out after its writer leaves: leaving is theirs, and a goodbye sent just before should land
    const reachable = !pairId || connection?.data()?.status === 'accepted'
    const deliver = reachable && (action === 'publish' || (privateThread && crisisOnly))

    // Its reads go before any write (a transaction rule), so the logs are set after, merged to
    // keep the other pace's
    const notices = deliver ? await planNotices(tx, ref.path, data, author) : NO_NOTICES
    tx.set(rateRef, { ...paced.logs, updatedAt: now }, { merge: true })

    if (deliver) {
      tx.update(ref, {
        status: 'published',
        publishedAt: now,
        author,
        ...(verdict.crisis ? { crisis: true } : {}),
        ...(notices.mentioned.length > 0 ? { mentioned: notices.mentioned } : {}),
      })
      applyNotices(tx, notices)
      if (pairId) {
        tx.set(db.doc(`dms/${pairId}`), { uids: pairId.split('_'), lastMessageAt: now, lastAuthorUid: authorUid }, { merge: true })
      }
      if (chatId) tx.update(db.doc(`chats/${chatId}`), { lastMessageAt: now, lastAuthorUid: authorUid })
    } else {
      tx.update(ref, {
        status: 'held',
        // Why a person will read it; clean writing that only can't reach them has none
        ...(action === 'hold' ? { heldReason: verdict.crisis ? 'crisis' : 'review' } : {}),
        // Its writer sees it won't arrive
        ...(reachable ? {} : { undelivered: true }),
        author,
      })
    }

    if (action === 'hold') {
      tx.set(db.doc(`modQueue/${queueIdFor(ref.path)}`), {
        contentPath: ref.path,
        kind,
        ...(pairId ? { pairId } : chatId ? { chatId } : { groupId: segments[1] }),
        authorUid,
        authorPenName: author.penName,
        snapshot: { ...(data.title ? { title: data.title } : {}), text: data.body ?? data.text ?? '' },
        automod: { categories, crisis: verdict.crisis, matches, version: verdict.version },
        delivered: deliver,
        priority: verdict.crisis ? 2 : 1,
        state: 'open',
        createdAt: now,
        updatedAt: now,
      })
    }

    if (verdict.crisis) {
      tx.set(db.collection(`users/${authorUid}/notices`).doc(), {
        type: 'crisis',
        contentPath: ref.path,
        createdAt: now,
        seen: false,
      })
    }
  })
}

const OPTIONS = { retry: true } as const

const trigger = (document: string) =>
  onDocumentCreated({ document, ...OPTIONS }, async (event) => {
    if (event.data) await handleNewContent(event.data.ref)
  })

export const moderatePost = trigger('groups/{gid}/posts/{pid}')
export const moderateComment = trigger('groups/{gid}/posts/{pid}/comments/{cid}')
export const moderateGroupMessage = trigger('groups/{gid}/messages/{mid}')
export const moderateDm = trigger('dms/{pairId}/messages/{mid}')
export const moderateChatMessage = trigger('chats/{chatId}/messages/{mid}')

export type { ContentKind }
