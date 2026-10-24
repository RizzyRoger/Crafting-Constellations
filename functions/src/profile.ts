import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { auth, db, PIGMENTS } from './app.js'
import { userOrNone } from './localBackendPolicy.js'
import { checkPenName, moderate, suggestPenName, tidyPenName } from './moderation/index.js'
import { callable } from './options.js'
import { mayRelease } from './profilePolicy.js'

interface SaveProfileInput {
  penName?: string
  note?: string
  pigment?: string
}

const pickFreeName = async () => {
  for (let i = 0; i < 12; i++) {
    const name = i < 6 ? suggestPenName() : `${suggestPenName()} ${Math.floor(Math.random() * 90 + 10)}`
    const taken = await db.doc(`penNames/${name.toLowerCase()}`).get()
    if (!taken.exists) return name
  }
  throw new HttpsError('resource-exhausted', 'Could not find a free pen name. Try one of your own.')
}

// The only writer of users/{uid}: validates, moderates, and keeps names unique
export const saveProfile = onCall<SaveProfileInput>(callable(), async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')
  const [ban, user] = await Promise.all([db.doc(`bans/${uid}`).get(), userOrNone(auth.getUser(uid))])
  if (ban.exists) throw new HttpsError('permission-denied', 'This account is paused.')
  // A token outlives the account it was made for, up to an hour: ask Auth, as the local backend
  // does, so a tab left open after deleting the account can't make it a profile again
  if (!user || user.disabled) throw new HttpsError('unauthenticated', 'Sign in first.')

  const input = request.data ?? {}
  const userRef = db.doc(`users/${uid}`)
  // Only to know whether to pick them a name: the transaction reads the profile itself
  const hasProfile = (await userRef.get()).exists

  let penName: string | undefined
  if (typeof input.penName === 'string') {
    const check = checkPenName(input.penName)
    if (!check.ok) throw new HttpsError('invalid-argument', 'pen-name', { problem: check.problem })
    penName = check.value
  } else if (!hasProfile) {
    penName = await pickFreeName()
  }

  let note: string | undefined
  let crisis = false
  if (typeof input.note === 'string') {
    const tidy = input.note.trim()
    if (tidy.length > 160) throw new HttpsError('invalid-argument', 'note', { problem: 'length' })
    const verdict = moderate(tidy, { context: 'public' })
    if (verdict.crisis) crisis = true
    else if (verdict.action === 'hold') throw new HttpsError('invalid-argument', 'note', { problem: 'unkind' })
    else note = tidy
  }

  if (input.pigment !== undefined && !(PIGMENTS as readonly string[]).includes(input.pigment)) {
    throw new HttpsError('invalid-argument', 'pigment')
  }

  const saved = await db.runTransaction(async (tx) => {
    // Read here, not before: a moderator's reset that lands first is seen (or makes this
    // retry), so the name it left them is the one a rename frees, never the one it retired
    const current = (await tx.get(userRef)).data()
    const lower = penName ? tidyPenName(penName).toLowerCase() : undefined
    const nameRef = lower ? db.doc(`penNames/${lower}`) : undefined
    const oldLower = typeof current?.penNameLower === 'string' ? current.penNameLower : undefined
    const oldRef = nameRef && oldLower && oldLower !== lower ? db.doc(`penNames/${oldLower}`) : undefined
    const [claim, oldClaim] = await Promise.all([nameRef, oldRef].map(async (ref) => (ref ? (await tx.get(ref)).data() : undefined)))
    // A name a moderator retired (Reset profile) has no owner, and nobody gets it back
    if (claim?.retired === true) throw new HttpsError('invalid-argument', 'pen-name', { problem: 'unkind' })
    if (claim?.uid && claim.uid !== uid) throw new HttpsError('already-exists', 'pen-name', { problem: 'taken' })

    if (oldRef && mayRelease(oldClaim, uid)) tx.delete(oldRef)
    if (nameRef) tx.set(nameRef, { uid })

    const now = FieldValue.serverTimestamp()
    tx.set(
      userRef,
      {
        ...(penName ? { penName, penNameLower: lower } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(input.pigment ? { pigment: input.pigment } : {}),
        ...(current
          ? {}
          : { pro: false, banned: false, synthetic: false, avatarSeed: uid, pigment: input.pigment ?? 'paynesBlue', note: note ?? '', createdAt: now }),
        updatedAt: now,
      },
      { merge: true },
    )
    return penName ?? current?.penName
  })

  return { ok: true, crisis, penName: saved }
})
