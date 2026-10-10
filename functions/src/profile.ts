import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db, PIGMENTS } from './app.js'
import { checkPenName, moderate, suggestPenName, tidyPenName } from './moderation/index.js'
import { callable } from './options.js'

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
  if ((await db.doc(`bans/${uid}`).get()).exists) throw new HttpsError('permission-denied', 'This account is paused.')

  const input = request.data ?? {}
  const userRef = db.doc(`users/${uid}`)
  const current = (await userRef.get()).data()

  let penName: string | undefined
  if (typeof input.penName === 'string') {
    const check = checkPenName(input.penName)
    if (!check.ok) throw new HttpsError('invalid-argument', 'pen-name', { problem: check.problem })
    penName = check.value
  } else if (!current) {
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

  await db.runTransaction(async (tx) => {
    const lower = penName ? tidyPenName(penName).toLowerCase() : undefined
    const nameRef = lower ? db.doc(`penNames/${lower}`) : undefined
    const owner = nameRef ? (await tx.get(nameRef)).data()?.uid : undefined
    if (owner && owner !== uid) throw new HttpsError('already-exists', 'pen-name', { problem: 'taken' })

    const oldLower = typeof current?.penNameLower === 'string' ? current.penNameLower : undefined
    if (nameRef && oldLower && oldLower !== lower) tx.delete(db.doc(`penNames/${oldLower}`))
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
  })

  return { ok: true, crisis, penName: penName ?? current?.penName }
})
