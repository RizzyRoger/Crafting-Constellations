import { FieldValue, type DocumentData, type DocumentReference } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { db, kindOf, NOT_FOUND, queueIdFor } from './app.js'
import { holds, nextRound } from './reportPolicy.js'

const couldSee = async (path: string, uid: string) => {
  const s = path.split('/')
  if (s[0] === 'users') return true
  if (s[0] === 'groups') return (await db.doc(`groups/${s[1]}/members/${uid}`).get()).exists
  if (s[0] === 'dms') return s[1].split('_').includes(uid)
  if (s[0] === 'chats') return ((await db.doc(`chats/${s[1]}`).get()).data()?.uids ?? []).includes(uid)
  return false
}

// A report puts the item in the review queue; three distinct people auto-hide it.
// Each moderator decision starts a new round of reports (see nextRound): a report filed
// before the decision never counts again, so running one twice is safe, and those who
// reported it then can queue it again but not hide it again. Who they are is read from the
// reports, never kept on the queue item, so it goes when an account (and its reports) does.
export const handleReport = async (report: DocumentData | undefined) => {
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
    const round = nextRound(queued, { reporterUid: report.reporterUid, reason: report.reason, createdAt: report.createdAt })
    if (!round) return
    // Only writing still up can be hidden. Every report on it, read (before any write) only if
    // holds needs to know who reported it before; select keeps out what they wrote.
    const filed = async () =>
      (await tx.get(db.collection('reports').where('contentPath', '==', path).select('reporterUid', 'createdAt'))).docs.map((doc) => ({
        reporterUid: doc.get('reporterUid'),
        createdAt: doc.get('createdAt'),
      }))
    const hold = kind !== 'profile' && fresh?.status === 'published' && (await holds(round, queued, filed))
    const { reporterUids, reasons } = round
    const now = FieldValue.serverTimestamp()
    const segments = path.split('/')

    tx.set(
      queueRef,
      {
        contentPath: path,
        kind,
        ...(kind === 'dm' ? { pairId: segments[1] } : kind === 'chatMessage' ? { chatId: segments[1] } : kind === 'profile' ? {} : { groupId: segments[1] }),
        authorUid,
        authorPenName: kind === 'profile' ? fresh?.penName ?? '' : fresh?.author?.penName ?? '',
        // The title has a line of its own in the queue, so the text is the words alone
        snapshot: kind === 'profile' ? { title: fresh?.penName ?? '', text: fresh?.note ?? '' } : { ...(fresh?.title ? { title: fresh.title } : {}), text: fresh?.body ?? fresh?.text ?? '' },
        reports: { count: reporterUids.length, reasons, reporterUids },
        priority: round.priority,
        state: 'open',
        createdAt: queued?.createdAt ?? now,
        updatedAt: now,
      },
      { merge: true },
    )

    if (hold) {
      tx.update(contentRef, { status: 'held', heldReason: 'review' })
    }
  })
}

// Each report is handled once, whatever came of it, and handledAt says so. The local backend
// sees every report again when it restarts: one dropped the first time (the writing was already
// hidden, or the reporter couldn't see it) must not count later, once that has changed.
export const handleNewReport = async (ref: DocumentReference, report: DocumentData | undefined) => {
  if (!report || report.handledAt) return
  await handleReport(report)
  // Gone if the reporter has since deleted their account
  await ref.update({ handledAt: FieldValue.serverTimestamp() }).catch((error: { code?: number }) => {
    if (error.code !== NOT_FOUND) throw error
  })
}

export const onReportCreated = onDocumentCreated({ document: 'reports/{rid}', retry: true }, (event) =>
  event.data ? handleNewReport(event.data.ref, event.data.data()) : undefined,
)
