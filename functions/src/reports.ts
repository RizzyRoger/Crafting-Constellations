import { FieldValue } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { db, kindOf, queueIdFor, textOf } from './app.js'

const AUTO_HOLD_REPORTERS = 3

const couldSee = async (path: string, uid: string) => {
  const s = path.split('/')
  if (s[0] === 'users') return true
  if (s[0] === 'groups') return (await db.doc(`groups/${s[1]}/members/${uid}`).get()).exists
  if (s[0] === 'dms') return s[1].split('_').includes(uid)
  return false
}

// A report puts the item in the review queue; three distinct people auto-hide it
export const onReportCreated = onDocumentCreated({ document: 'reports/{rid}', retry: true }, async (event) => {
  const report = event.data?.data()
  if (!report) return
  const path: string = report.contentPath
  const kind = kindOf(path)
  if (!kind) return

  const contentRef = db.doc(path)
  const content = (await contentRef.get()).data()
  if (!content) return
  const authorUid: string = kind === 'profile' ? path.split('/')[1] : content.authorUid
  if (authorUid === report.reporterUid) return
  if (kind !== 'profile' && content.status !== 'published') return
  if (!(await couldSee(path, report.reporterUid))) return

  const queueRef = db.doc(`modQueue/${queueIdFor(path)}`)
  await db.runTransaction(async (tx) => {
    const queued = (await tx.get(queueRef)).data()
    const fresh = (await tx.get(contentRef)).data()
    const reporters: string[] = queued?.reports?.reporterUids ?? []
    if (reporters.includes(report.reporterUid)) return
    const reporterUids = [...reporters, report.reporterUid]
    const reasons: string[] = [...new Set([...(queued?.reports?.reasons ?? []), report.reason])]
    const now = FieldValue.serverTimestamp()
    const segments = path.split('/')

    tx.set(
      queueRef,
      {
        contentPath: path,
        kind,
        ...(kind === 'dm' ? { pairId: segments[1] } : kind === 'profile' ? {} : { groupId: segments[1] }),
        authorUid,
        authorPenName: kind === 'profile' ? fresh?.penName ?? '' : fresh?.author?.penName ?? '',
        snapshot: kind === 'profile' ? { title: fresh?.penName ?? '', text: fresh?.note ?? '' } : { ...(fresh?.title ? { title: fresh.title } : {}), text: textOf(fresh) },
        reports: { count: reporterUids.length, reasons, reporterUids },
        priority: reasons.includes('selfHarm') ? 2 : Math.max(queued?.priority ?? 1, 1),
        state: 'open',
        createdAt: queued?.createdAt ?? now,
        updatedAt: now,
      },
      { merge: true },
    )

    if (kind !== 'profile' && reporterUids.length >= AUTO_HOLD_REPORTERS && fresh?.status === 'published') {
      tx.update(contentRef, { status: 'held', heldReason: 'review' })
    }
  })
})
