import { FieldValue } from 'firebase-admin/firestore'
import { defineList } from 'firebase-functions/params'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { auth, db, logAction, NOT_FOUND } from './app.js'
import { checkPenName, suggestPenName } from './moderation/index.js'
import { callable } from './options.js'

const ADMIN_EMAILS = defineList('ADMIN_EMAILS', { default: [] })

const requireAdmin = (request: CallableRequest) => {
  if (request.auth?.token.admin !== true) throw new HttpsError('permission-denied', 'Admins only.')
  return request.auth.uid
}

const str = (value: unknown, name: string, max = 200) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new HttpsError('invalid-argument', name)
  }
  return value.trim()
}

// Claims are merged, never replaced: setCustomUserClaims overwrites everything
const mergeClaims = async (uid: string, patch: Record<string, unknown>) => {
  const current = (await auth.getUser(uid)).customClaims ?? {}
  await auth.setCustomUserClaims(uid, { ...current, ...patch })
}

// The writer may have deleted their account, and the item with it, since it was queued
const missing = (error: { code?: number }) => {
  if (error.code === NOT_FOUND) return true
  throw error
}

const notify = (uid: string, type: string, extra: Record<string, unknown> = {}) =>
  db.collection(`users/${uid}/notices`).add({ type, ...extra, createdAt: FieldValue.serverTimestamp(), seen: false })

// Reset a reported profile to a quiet generated name and clear the note
const resetProfile = (uid: string, now: FieldValue) =>
  db.runTransaction(async (tx) => {
    const profile = (await tx.get(db.doc(`users/${uid}`))).data()
    let name = suggestPenName()
    for (let i = 0; i < 8 && (await tx.get(db.doc(`penNames/${name.toLowerCase()}`))).exists; i++) {
      name = `${suggestPenName()} ${Math.floor(Math.random() * 90 + 10)}`
    }
    if (profile?.penNameLower) tx.delete(db.doc(`penNames/${profile.penNameLower}`))
    tx.set(db.doc(`penNames/${name.toLowerCase()}`), { uid })
    tx.update(db.doc(`users/${uid}`), { penName: name, penNameLower: name.toLowerCase(), note: '', updatedAt: now })
  })

// ---------- review queue ----------

export const approveContent = onCall<{ queueId: string }>(callable(), async (request) => {
  const actor = requireAdmin(request)
  const queueRef = db.doc(`modQueue/${str(request.data?.queueId, 'queueId', 1500)}`)

  await db.runTransaction(async (tx) => {
    const queued = (await tx.get(queueRef)).data()
    if (!queued) throw new HttpsError('not-found', 'queue item')
    const now = FieldValue.serverTimestamp()
    if (queued.kind !== 'profile') {
      const contentRef = db.doc(queued.contentPath)
      const content = (await tx.get(contentRef)).data()
      if (content && ['held', 'pending'].includes(content.status)) {
        tx.update(contentRef, { status: 'published', publishedAt: now })
        if (queued.kind === 'dm') {
          tx.set(db.doc(`dms/${queued.pairId}`), { uids: String(queued.pairId).split('_'), lastMessageAt: now, lastAuthorUid: queued.authorUid }, { merge: true })
        }
      }
    }
    tx.update(queueRef, { state: 'resolved', resolution: 'approved', resolvedBy: actor, resolvedAt: now, updatedAt: now })
  })

  await logAction(actor, 'approveContent', request.data.queueId)
  return { ok: true }
})

export const removeContent = onCall<{ queueId: string; note?: string }>(callable(), async (request) => {
  const actor = requireAdmin(request)
  const queueRef = db.doc(`modQueue/${str(request.data?.queueId, 'queueId', 1500)}`)
  const queued = (await queueRef.get()).data()
  if (!queued) throw new HttpsError('not-found', 'queue item')
  const now = FieldValue.serverTimestamp()

  const removal =
    queued.kind === 'profile'
      ? resetProfile(queued.authorUid, now)
      : db.doc(queued.contentPath).update({ status: 'removed', removedBy: actor, removedAt: now })
  const gone = await removal.then(() => false, missing)

  await queueRef.update({ state: 'resolved', resolution: 'removed', resolvedBy: actor, resolvedAt: now, updatedAt: now })
  if (!gone) await notify(queued.authorUid, 'removed', { contentPath: queued.contentPath })
  await logAction(actor, 'removeContent', request.data.queueId, { note: request.data.note ?? '' })
  return { ok: true }
})

// ---------- people ----------

export const banUser = onCall<{ uid: string; reason: string; hideContent?: boolean }>(callable(), async (request) => {
  const actor = requireAdmin(request)
  const uid = str(request.data?.uid, 'uid', 128)
  const reason = str(request.data?.reason, 'reason', 500)
  if (uid === actor) throw new HttpsError('failed-precondition', 'You cannot ban yourself.')
  const target = await auth.getUser(uid)
  if (target.customClaims?.admin === true) throw new HttpsError('failed-precondition', 'Remove admin first.')

  const now = FieldValue.serverTimestamp()
  await db.doc(`bans/${uid}`).set({ uid, reason, bannedBy: actor, createdAt: now })
  await mergeClaims(uid, { banned: true })
  await auth.updateUser(uid, { disabled: true })
  await auth.revokeRefreshTokens(uid)
  await db.doc(`users/${uid}`).set({ banned: true, updatedAt: now }, { merge: true })

  const writer = db.bulkWriter()
  const memberships = await db.collectionGroup('members').where('uid', '==', uid).get()
  memberships.docs.forEach((d) => writer.delete(d.ref))

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
  const actor = requireAdmin(request)
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
    const actor = requireAdmin(request)
    const uid = str(request.data?.uid, 'uid', 128)
    const decision = request.data?.decision
    if (!['approve', 'deny', 'revoke'].includes(decision)) throw new HttpsError('invalid-argument', 'decision')
    const note = typeof request.data.note === 'string' ? request.data.note.slice(0, 500) : ''
    const appRef = db.doc(`proApplications/${uid}`)
    if (!(await appRef.get()).exists) throw new HttpsError('not-found', 'application')

    const now = FieldValue.serverTimestamp()
    const status = decision === 'approve' ? 'approved' : decision === 'deny' ? 'denied' : 'revoked'
    await appRef.update({ status, reviewedAt: now, reviewedBy: actor, reviewNote: note })

    const pro = decision === 'approve'
    await mergeClaims(uid, { pro })
    await db.doc(`users/${uid}`).set({ pro, ...(pro ? { proSince: now } : {}), updatedAt: now }, { merge: true })
    if (decision !== 'revoke') await notify(uid, pro ? 'proApproved' : 'proDenied', { note })

    await logAction(actor, 'reviewProfessional', uid, { decision })
    return { ok: true }
  },
)

export const setAdmin = onCall<{ uid: string; admin: boolean }>(callable(), async (request) => {
  const actor = requireAdmin(request)
  const uid = str(request.data?.uid, 'uid', 128)
  if (uid === actor && request.data.admin === false) throw new HttpsError('failed-precondition', 'Ask another admin.')
  await mergeClaims(uid, { admin: request.data.admin === true })
  await logAction(actor, 'setAdmin', uid, { admin: request.data.admin === true })
  return { ok: true }
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
  const actor = requireAdmin(request)
  const name = str(request.data?.name, 'name', 60)
  const description = typeof request.data.description === 'string' ? request.data.description.slice(0, 280) : ''
  const constellationId = str(request.data?.constellationId, 'constellationId', 80)
  const constellation = (await db.doc(`constellations/${constellationId}`).get()).data()
  if (!constellation) throw new HttpsError('not-found', 'constellation')
  if (!checkPenName(name).ok) throw new HttpsError('invalid-argument', 'name')

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
