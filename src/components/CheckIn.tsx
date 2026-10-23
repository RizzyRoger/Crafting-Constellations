import { collection, doc, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useMatch } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { describeError } from '../lib/callables'
import { CHECKIN_GROUP, CHECKIN_QUESTIONS, checkInBody, checkInTitle, promptHides, todaysCheckIn, type CheckInId } from '../lib/checkin'
import { db } from '../lib/firebase'
import { standingIn } from '../lib/groupStanding'
import { useDocData, useQueryData } from '../lib/live'
import type { Post } from '../lib/types'
import { ConfirmEmail } from './ConfirmEmail'
import { CrisisCard } from './CrisisCard'
import { StatusNote } from './StatusNote'

const empty = (): Record<CheckInId, string> => ({ feeling: '', mind: '', steps: '' })

// What's typed in the box, and the one sent from it: known before it's written, since it shows at
// once. The shell keeps the prompt's, so both outlast the pages that leave the prompt out
export const useCheckInDraft = () => {
  const [answers, setAnswers] = useState(empty)
  const [sent, setSent] = useState<string | null>(null)
  return { answers, setAnswers, sent, setSent }
}

export type CheckInDraft = ReturnType<typeof useCheckInDraft>

// Three questions, one post a day in the Daily check-in group
export const CheckIn = ({ prompt = false, onLater, draft }: { prompt?: boolean; onLater?: () => void; draft?: CheckInDraft }) => {
  const { uid, claims } = useMe()
  const verified = claims.emailVerified
  const membership = useDocData<{ uid: string }>(`groups/${CHECKIN_GROUP}/members/${uid}`)
  // Members only, so it opens once the server has the membership: the shell's join is local at first
  const member = standingIn(membership, false) === 'member'
  // A few, not one: a withdrawn or removed check-in doesn't count, and an earlier one today still does
  const latest = useQueryData<Post>(member ? `checkin|${uid}` : null, () =>
    query(collection(db, `groups/${CHECKIN_GROUP}/posts`), where('authorUid', '==', uid), orderBy('createdAt', 'desc'), limit(5)),
  )
  const today = todaysCheckIn(latest.data)
  const own = useCheckInDraft()
  const { answers, setAnswers, sent, setSent } = draft ?? own
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // Only this box's own send moves focus: one the shell brings back with it leaves focus be
  const sentHere = useRef(false)
  const justSent = today !== undefined && today.id === sent
  // The check-in's own page shows the resources with it, so the box leaves them to it
  const page = useMatch('/groups/:groupId/posts/:postId')
  const onItsPage = today !== undefined && page?.params.groupId === CHECKIN_GROUP && page.params.postId === today.id

  // Send goes with the form, so focus comes to the heading rather than falling out of the page
  useEffect(() => {
    if (!justSent || !sentHere.current) return
    sentHere.current = false
    heading.current?.focus()
  }, [justSent])

  if (!member || latest.loading) return null
  // Unread, it can't tell whether today's is written, so above pages it says nothing
  if (prompt && (latest.error || promptHides(today, sent))) return null

  const ready = CHECKIN_QUESTIONS.every((q) => answers[q.id].trim().length > 0)

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || sending) return
    const post = doc(collection(db, `groups/${CHECKIN_GROUP}/posts`))
    setSending(true)
    setError(null)
    setSent(post.id)
    sentHere.current = true
    try {
      await setDoc(post, {
        authorUid: uid,
        title: checkInTitle(),
        body: checkInBody(answers),
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setAnswers(empty())
    } catch (e) {
      setSent(null)
      sentHere.current = false
      setError(describeError(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="checkin section" aria-labelledby="checkin-title">
      <div className="section__head">
        <h2 id="checkin-title" ref={heading} tabIndex={-1}>
          Daily check-in
        </h2>
        {prompt && onLater && (
          <button type="button" className="link-btn" onClick={onLater}>
            {today ? 'Done' : 'Not now'}
          </button>
        )}
      </div>
      {/* Mounted from the start: screen readers often skip a polite region that arrives already holding its news */}
      <div className="stack live" aria-live="polite">
        {today && (
          <>
            <p className="pencil note">
              {justSent ? 'Sent to Daily check-in.' : 'You already wrote today.'} <StatusNote item={today} />{' '}
              <Link to={`/groups/${CHECKIN_GROUP}/posts/${today.id}`}>Read it</Link>
            </p>
            {today.status === 'held' && today.heldReason === 'crisis' && !onItsPage && <CrisisCard audience="writer" held={!today.undelivered} />}
          </>
        )}
      </div>
      {latest.error ? (
        <p className="pencil note">Today’s check-in can’t be opened just now. Try again in a little while.</p>
      ) : today ? null : !verified ? (
        <ConfirmEmail />
      ) : (
        <form className="form" onSubmit={(event) => void send(event)}>
          {/* Everyone is put in the group, so this is said before anyone writes, and heard with each answer */}
          <p id="checkin-who" className="hint">
            Your answers become a post in <Link to={`/groups/${CHECKIN_GROUP}`}>Daily check-in</Link>, under your pen name. Everyone
            here is in that group, so anyone can read it and reply.
          </p>
          {CHECKIN_QUESTIONS.map((q) => (
            <div className="field" key={q.id}>
              <label htmlFor={`checkin-${q.id}`}>{q.label}</label>
              <textarea
                id={`checkin-${q.id}`}
                rows={2}
                maxLength={1000}
                aria-describedby="checkin-who"
                value={answers[q.id]}
                onChange={(event) => setAnswers((prev) => ({ ...prev, [q.id]: event.target.value }))}
                required
              />
            </div>
          ))}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button
              type="submit"
              className="act act--wash"
              disabled={!ready || sending}
              aria-describedby={ready ? undefined : 'checkin-ready'}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
            {!ready && (
              <span id="checkin-ready" className="hint">
                Answer all three to send.
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
