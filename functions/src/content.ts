import { FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { db, kindOf, queueIdFor, textOf, type ContentKind } from './app.js'
import { applyFlood } from './moderation/flood.js'
import { moderate } from './moderation/index.js'

// Every new piece of writing arrives `pending`. This decides, once:
// - clean                 → published, with the author's name + licensed mark attached
// - crisis in a DM        → published with `crisis: true` (both people see resources), queued at priority 2
// - crisis elsewhere      → held for a person to read; the author sees resources
// - anything else flagged → held, queued for review
// - author banned         → removed
export const handleNewContent = async (ref: DocumentReference) => {
  const kind = kindOf(ref.path)
  if (!kind || kind === 'profile') return

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.data()
    if (!data || data.status !== 'pending') return

    const authorUid: string = data.authorUid
    const rateRef = db.doc(`rateLimits/${authorUid}`)
    const [userSnap, banSnap, rateSnap] = await Promise.all([
      tx.get(db.doc(`users/${authorUid}`)),
      tx.get(db.doc(`bans/${authorUid}`)),
      tx.get(rateRef),
    ])
    const now = FieldValue.serverTimestamp()
    const { flooded, stamps } = applyFlood(rateSnap.data()?.stamps, Date.now())

    if (banSnap.exists) {
      tx.update(ref, { status: 'removed', removedBy: 'automod', removedAt: now })
      return
    }

    tx.set(rateRef, { stamps, updatedAt: now })

    const profile = userSnap.data()
    const author = {
      penName: profile?.penName ?? 'Someone',
      avatarSeed: profile?.avatarSeed ?? authorUid,
      pigment: profile?.pigment ?? 'paynesBlue',
      pro: profile?.pro === true,
      ...(profile?.synthetic ? { synthetic: true } : {}),
    }

    const text = textOf(data)
    const verdict = moderate(text, { context: kind === 'dm' ? 'private' : 'public' })
    const floodHold = flooded && verdict.action === 'publish' && !verdict.crisis
    const action = floodHold ? 'hold' : verdict.action
    const categories = floodHold ? [...verdict.categories, 'spam'] : verdict.categories
    const matches = floodHold ? [...verdict.matches, { category: 'spam' as const, term: 'too many notes' }] : verdict.matches
    const crisisOnly = verdict.crisis && verdict.categories.every((c) => c === 'selfHarm')
    const deliver = action === 'publish' || (kind === 'dm' && crisisOnly)
    const segments = ref.path.split('/')
    const pairId = kind === 'dm' ? segments[1] : undefined

    if (deliver) {
      tx.update(ref, { status: 'published', publishedAt: now, author, ...(verdict.crisis ? { crisis: true } : {}) })
      if (pairId) {
        tx.set(db.doc(`dms/${pairId}`), { uids: pairId.split('_'), lastMessageAt: now, lastAuthorUid: authorUid }, { merge: true })
      }
    } else {
      tx.update(ref, { status: 'held', heldReason: verdict.crisis ? 'crisis' : 'review', author })
    }

    if (action === 'hold') {
      tx.set(db.doc(`modQueue/${queueIdFor(ref.path)}`), {
        contentPath: ref.path,
        kind,
        ...(kind === 'dm' ? { pairId } : { groupId: segments[1] }),
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

export type { ContentKind }
