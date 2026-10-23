import { FieldValue, type DocumentData, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { defineList } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { approvalOf, leftAsIs, moderatorNote, outcomeOf, removalOf, type Outcome, type Removal } from './adminPolicy.js'
import { auth, db, logAction, NOT_FOUND, snapshotOf } from './app.js'
import { checkPenName, suggestPenName } from './moderation/index.js'
import { applyNotices, planNotices } from './notify.js'
import { callable } from './options.js'

const ADMIN_EMAILS = defineList('ADMIN_EMAILS', { default: [] })

// The token says what the role was when it was made, up to an hour ago: a moderator whose role
// was removed since still holds one that says admin, so ask Auth too
const requireAdmin = async (request: CallableRequest) => {
  if (request.auth?.token.admin !== true) throw new HttpsError('permission-denied', 'Admins only.')
  const { uid } = request.auth
  if ((await auth.getUser(uid)).customClaims?.admin !== true) throw new HttpsError('permission-denied', 'Admins only.')
  return uid
}

const str = (value: unknown, name: string, max = 200) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new HttpsError('invalid-argument', name)
  }
  return value.trim()
}

// Claims are merged, never replaced: setCustomUserClaims overwrites everything. Gives the claims before
const mergeClaims = async (uid: string, patch: Record<string, unknown>) => {
  const current = (await auth.getUser(uid)).customClaims ?? {}
  await auth.setCustomUserClaims(uid, { ...current, ...patch })
  return current
}

const notice = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra, createdAt: FieldValue.serverTimestamp(), seen: false })

const notify = (uid: string, type: string, extra: Record<string, unknown> = {}) => db.collection(`users/${uid}/notices`).add(notice(type, extra))

// Reset a reported profile to a quiet generated name and clear the note. The old
// name is retired, not freed, so nobody can take it again, the person included.
// The retired record is the name alone: account deletion leaves it, and nothing
// in it points back at them. Gives the new name, or null when the account is gone.
const resetProfile = async (tx: Transaction, uid: string, now: FieldValue) => {
  const profile = (await tx.get(db.doc(`users/${uid}`))).data()
  if (!profile) return null
  let name = suggestPenName()
  for (let i = 0; i < 8 && (await tx.get(db.doc(`penNames/${name.toLowerCase()}`))).exists; i++) {
    name = `${suggestPenName()} ${Math.floor(Math.random() * 90 + 10)}`
  }
  if (profile.penNameLower) tx.set(db.doc(`penNames/${profile.penNameLower}`), { retired: true })
  tx.set(db.doc(`penNames/${name.toLowerCase()}`), { uid })
  tx.update(db.doc(`users/${uid}`), { penName: name, penNameLower: name.toLowerCase(), note: '', updatedAt: now })
  return name
}

const ignoreMissing = (error: { code?: number }) => {
  if (error.code !== NOT_FOUND) throw error
}

// Writing keeps the name it went out with, but a reset is there to take the name
// out of view: put the new one on everything they wrote (held writing too, so
// approving it later can't bring the old one back) and on the notices they caused
const renameWriting = async (uid: string, penName: string) => {
  const [writing, notices] = await Promise.all([
    Promise.all(['posts', 'comments', 'messages'].map((group) => db.collectionGroup(group).where('authorUid', '==', uid).get())),
    db.collectionGroup('notices').where('actorUid', '==', uid).get(),
  ])
  // Writing still pending has no name on it yet, and takes the new one as it goes out
  const stale = (snapshot: string) => (d: QueryDocumentSnapshot) => {
    const shown = d.get(`${snapshot}.penName`)
    return typeof shown === 'string' && shown !== penName
  }
  const writer = db.bulkWriter()
  const results = [
    ...writing.flatMap((s) => s.docs).filter(stale('author')).map((d) => writer.update(d.ref, { 'author.penName': penName })),
    ...notices.docs.filter(stale('actor')).map((d) => writer.update(d.ref, { 'actor.penName': penName })),
  ].map((result) => result.catch(ignoreMissing)) // deleted meanwhile, with someone else's account
  await writer.close()
  await Promise.all(results)
}

// ---------- review queue ----------

// Approve and Remove answer with what came of them, for the moderator's page (see Outcome)

// Approve queued writing that is still held or waiting, and say what came of it
const approveHeld = async (tx: Transaction, queued: DocumentData, now: FieldValue): Promise<Outcome> => {
  const contentRef = db.doc(queued.contentPath)
  const content = (await tx.get(contentRef)).data()
  if (!content || !['held', 'pending'].includes(content.status)) return leftAsIs(content?.status)
  // Every read goes before the first write: whether it can still reach its readers, then who it pings
  const [connection, chat] = await Promise.all([
    queued.kind === 'dm' ? tx.get(db.doc(`connections/${queued.pairId}`)) : undefined,
    queued.kind === 'chatMessage' ? tx.get(db.doc(`chats/${queued.chatId}`)) : undefined,
  ])
  const approval = approvalOf({
    kind: queued.kind,
    authorUid: content.authorUid,
    publishedAt: content.publishedAt,
    connectionStatus: connection?.data()?.status,
    chatUids: chat?.data()?.uids,
  })
  if (approval === 'restore') tx.update(contentRef, { status: 'published' })
  if (approval !== 'publish') return outcomeOf(approval)

  // Writing held before it went out pings nobody until now
  const notices = await planNotices(tx, queued.contentPath, content, content.author ?? snapshotOf(content.authorUid, undefined))
  tx.update(contentRef, {
    status: 'published',
    publishedAt: now,
    ...(notices.mentioned.length > 0 ? { mentioned: notices.mentioned } : {}),
  })
  applyNotices(tx, notices)
  if (queued.kind === 'dm') {
    tx.set(db.doc(`dms/${queued.pairId}`), { uids: String(queued.pairId).split('_'), lastMessageAt: now, lastAuthorUid: queued.authorUid }, { merge: true })
  }
  if (queued.kind === 'chatMessage') {
    tx.update(db.doc(`chats/${queued.chatId}`), { lastMessageAt: now, lastAuthorUid: queued.authorUid })
  }
  return outcomeOf(approval)
}

export const approveContent = onCall<{ queueId: string }>(callable(), async (request) => {
  const actor = await requireAdmin(request)
  const queueRef = db.doc(`modQueue/${str(request.data?.queueId, 'queueId', 1500)}`)

  // As with Remove, a second moderator (or a retry) finds the entry resolved and changes nothing
  const outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
    const queued = (await tx.get(queueRef)).data()
    if (!queued) throw new HttpsError('not-found', 'queue item')
    if (queued.state !== 'open') return 'already-resolved'
    const now = FieldValue.serverTimestamp()
    const outcome = queued.kind === 'profile' ? 'kept' : await approveHeld(tx, queued, now)
    // A note that can no longer reach its readers stays held, and still leaves the queue
    const resolution = outcome === 'undelivered' ? 'approved-undelivered' : 'approved'
    tx.update(queueRef, { state: 'resolved', resolution, resolvedBy: actor, resolvedAt: now, updatedAt: now })
    return outcome
  })

  if (outcome !== 'already-resolved') await logAction(actor, 'approveContent', request.data.queueId, { outcome })
  return { ok: true, outcome }
})

// Take down queued writing, or reset a queued profile, as Remove says. A reset
// also gives the new name, for the writing the person already has out.
const takeDown = async (tx: Transaction, queued: DocumentData, actor: string, now: FieldValue): Promise<{ removal: Removal; penName?: string }> => {
  if (queued.kind === 'profile') {
    const penName = await resetProfile(tx, queued.authorUid, now)
    return penName ? { removal: 'remove', penName } : { removal: 'gone' }
  }
  const contentRef = db.doc(queued.contentPath)
  const removal = removalOf((await tx.get(contentRef)).data()?.status)
  if (removal === 'remove') tx.update(contentRef, { status: 'removed', removedBy: actor, removedAt: now })
  return { removal }
}

export const removeContent = onCall<{ queueId: string; note?: string }>(callable(), async (request) => {
  const actor = await requireAdmin(request)
  const queueRef = db.doc(`modQueue/${str(request.data?.queueId, 'queueId', 1500)}`)
  const note = moderatorNote(request.data?.note)

  // One transaction, so a second moderator (or a retry) finds the entry resolved and does nothing twice
  const done = await db.runTransaction(async (tx) => {
    const queued = (await tx.get(queueRef)).data()
    if (!queued) throw new HttpsError('not-found', 'queue item')
    if (queued.state !== 'open') return null
    const now = FieldValue.serverTimestamp()
    const { removal, penName } = await takeDown(tx, queued, actor, now)
    tx.update(queueRef, { state: 'resolved', resolution: removal === 'withdrawn' ? 'withdrawn' : 'removed', resolvedBy: actor, resolvedAt: now, updatedAt: now })
    // Only the writer of something a moderator took down hears about it
    if (removal === 'remove') {
      tx.set(db.collection(`users/${queued.authorUid}/notices`).doc(), notice('removed', { contentPath: queued.contentPath, ...(note ? { note } : {}) }))
    }
    return { removal, authorUid: queued.authorUid as string, penName }
  })

  if (!done) return { ok: true, outcome: 'already-resolved' }
  await logAction(actor, 'removeContent', request.data.queueId, { note, removal: done.removal })
  // Once the reset is in: writing that goes out from then on takes the new name itself
  if (done.penName) await renameWriting(done.authorUid, done.penName)
  return { ok: true, outcome: outcomeOf(done.removal) }
})

// ---------- people ----------

export const banUser = onCall<{ uid: string; reason: string; hideContent?: boolean }>(callable(), async (request) => {
  const actor = await requireAdmin(request)
  const uid = str(request.data?.uid, 'uid', 128)
  const reason = str(request.data?.reason, 'reason', 500)
  if (uid === actor) throw new HttpsError('failed-precondition', 'You cannot ban yourself.')
  const target = await auth.getUser(uid)
  if (target.customClaims?.admin === true) throw new HttpsError('failed-precondition', 'Remove admin first.', { problem: 'admin' })

  const now = FieldValue.serverTimestamp()
  await db.doc(`bans/${uid}`).set({ uid, reason, bannedBy: actor, createdAt: now })
  await mergeClaims(uid, { banned: true })
  await auth.updateUser(uid, { disabled: true })
  await auth.revokeRefreshTokens(uid)
  await db.doc(`users/${uid}`).set({ banned: true, updatedAt: now }, { merge: true })

  const writer = db.bulkWriter()
  const memberships = await db.collectionGroup('members').where('uid', '==', uid).get()
  memberships.docs.forEach((d) => writer.delete(d.ref))
  const chats = await db.collection('chats').where('uids', 'array-contains', uid).get()
  chats.docs.forEach((d) => writer.update(d.ref, { uids: FieldValue.arrayRemove(uid) }))

  if (request.data.hideContent) {
    for (const group of ['posts', 'comments', 'messages']) {
      const items = await db.collectionGroup(group).where('authorUid', '==', uid).get()
      items.docs
        .filter((d) => ['published', 'pending', 'held'].includes(d.data().status))
        .forEach((d) => writer.update(d.ref, { status: 'removed', removedBy: actor, removedAt: now }))
    }
  }
  await writer.close()

  await logAction(actor, 'banUser', uid, { reason, hideContent: Boolean(request.data.hideContent) })
  return { ok: true }
})

export const unbanUser = onCall<{ uid: string }>(callable(), async (request) => {
  const actor = await requireAdmin(request)
  const uid = str(request.data?.uid, 'uid', 128)
  await db.doc(`bans/${uid}`).delete()
  await mergeClaims(uid, { banned: false })
  await auth.updateUser(uid, { disabled: false })
  await db.doc(`users/${uid}`).set({ banned: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  await logAction(actor, 'unbanUser', uid)
  return { ok: true }
})

export const reviewProfessional = onCall<{ uid: string; decision: 'approve' | 'deny' | 'revoke'; note?: string }>(
  callable(),
  async (request) => {
    const actor = await requireAdmin(request)
    const uid = str(request.data?.uid, 'uid', 128)
    const decision = request.data?.decision
    if (!['approve', 'deny', 'revoke'].includes(decision)) throw new HttpsError('invalid-argument', 'decision')
    const note = typeof request.data.note === 'string' ? request.data.note.slice(0, 500) : ''
    const appRef = db.doc(`proApplications/${uid}`)
    const applied = (await appRef.get()).exists
    // Seeded or hand-set pros never applied, but their mark can still be taken away
    if (!applied && decision !== 'revoke') throw new HttpsError('not-found', 'application')
    // The profile write below merges, so never let it make a profile for someone who has none
    if (!applied && !(await db.doc(`users/${uid}`).get()).exists) throw new HttpsError('not-found', 'profile')

    const now = FieldValue.serverTimestamp()
    const status = decision === 'approve' ? 'approved' : decision === 'deny' ? 'denied' : 'revoked'
    if (applied) await appRef.update({ status, reviewedAt: now, reviewedBy: actor, reviewNote: note })

    const pro = decision === 'approve'
    await mergeClaims(uid, { pro })
    await db.doc(`users/${uid}`).set({ pro, ...(pro ? { proSince: now } : {}), updatedAt: now }, { merge: true })
    if (decision !== 'revoke') await notify(uid, pro ? 'proApproved' : 'proDenied', { note })

    await logAction(actor, 'reviewProfessional', uid, { decision })
    return { ok: true }
  },
)

export const setAdmin = onCall<{ uid: string; admin: boolean }>(callable(), async (request) => {
  const actor = await requireAdmin(request)
  const uid = str(request.data?.uid, 'uid', 128)
  if (uid === actor && request.data.admin === false) throw new HttpsError('failed-precondition', 'Ask another admin.')
  const admin = request.data.admin === true
  const was = (await mergeClaims(uid, { admin })).admin === true
  // Their tokens say admin until they expire, up to an hour, and the rules can't be told sooner.
  // Functions ask Auth (requireAdmin), and their sessions end as a ban's do: each device signs in again
  if (was && !admin) await auth.revokeRefreshTokens(uid)
  await logAction(actor, 'setAdmin', uid, { admin })
  // Whether they had the role before, which the page has no other way to know
  return { ok: true, was }
})

// First admin: a verified account whose email is listed in ADMIN_EMAILS
export const bootstrapAdmin = onCall(callable(), async (request) => {
  const token = request.auth?.token
  if (!request.auth || token?.email_verified !== true || typeof token.email !== 'string') {
    throw new HttpsError('permission-denied', 'Verify your email first.')
  }
  const allowed = ADMIN_EMAILS.value().map((e) => e.trim().toLowerCase())
  if (!allowed.includes(token.email.toLowerCase())) throw new HttpsError('permission-denied', 'Not on the admin list.')
  await mergeClaims(request.auth.uid, { admin: true })
  await logAction(request.auth.uid, 'bootstrapAdmin', request.auth.uid)
  return { ok: true }
})

// ---------- groups ----------

export const createGroup = onCall<{ name: string; constellationId: string; description?: string }>(callable(), async (request) => {
  const actor = await requireAdmin(request)
  const name = str(request.data?.name, 'name', 60)
  const description = typeof request.data.description === 'string' ? request.data.description.slice(0, 280) : ''
  const constellationId = str(request.data?.constellationId, 'constellationId', 80)
  const constellation = (await db.doc(`constellations/${constellationId}`).get()).data()
  if (!constellation) throw new HttpsError('not-found', 'constellation')
  // Named like a chat: a group can't pass for a person ("Night-shift nurses")
  if (!checkPenName(name, { chat: true }).ok) throw new HttpsError('invalid-argument', 'name')

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'group'
  const ref = db.collection('groups').doc(`${slug}-${Math.random().toString(36).slice(2, 6)}`)
  await ref.set({
    name,
    description,
    constellationId,
    constellationName: constellation.name,
    memberCount: 0,
    createdBy: actor,
    createdAt: FieldValue.serverTimestamp(),
    synthetic: false,
  })
  await logAction(actor, 'createGroup', ref.id)
  return { ok: true, id: ref.id }
})
