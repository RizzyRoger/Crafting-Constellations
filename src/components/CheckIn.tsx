import { addDoc, collection, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { describeError } from '../lib/callables'
import { CHECKIN_GROUP, CHECKIN_QUESTIONS, checkInBody, checkInTitle, isToday, type CheckInId } from '../lib/checkin'
import { db } from '../lib/firebase'
import { useDocData, useQueryData } from '../lib/live'
import type { Post } from '../lib/types'
import { ConfirmEmail } from './ConfirmEmail'

const empty = (): Record<CheckInId, string> => ({ feeling: '', mind: '', steps: '' })

// Three questions, one post a day in the Daily check-in group
export const CheckIn = ({ prompt = false, onLater }: { prompt?: boolean; onLater?: () => void }) => {
  const { uid, claims } = useMe()
  const verified = claims.emailVerified
  const membership = useDocData<{ uid: string }>(`groups/${CHECKIN_GROUP}/members/${uid}`)
  const latest = useQueryData<Post>(membership.data ? `checkin|${uid}` : null, () =>
    query(collection(db, `groups/${CHECKIN_GROUP}/posts`), where('authorUid', '==', uid), orderBy('createdAt', 'desc'), limit(1)),
  )
  const today = latest.data.find((post) => isToday(post.createdAt))
  const [answers, setAnswers] = useState(empty)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (membership.loading || !membership.data || latest.loading) return null
  if (prompt && today) return null

  const ready = CHECKIN_QUESTIONS.every((q) => answers[q.id].trim().length > 0)

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || sending) return
    setSending(true)
    setError(null)
    try {
      await addDoc(collection(db, `groups/${CHECKIN_GROUP}/posts`), {
        authorUid: uid,
        title: checkInTitle(),
        body: checkInBody(answers),
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setAnswers(empty())
    } catch (e) {
      setError(describeError(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="checkin section" aria-labelledby="checkin-title">
      <div className="section__head">
        <h2 id="checkin-title">Daily check-in</h2>
        {prompt && onLater && (
          <button type="button" className="link-btn" onClick={onLater}>
            Not now
          </button>
        )}
      </div>
      {today ? (
        <p className="pencil note">
          You already wrote today.{' '}
          <Link to={`/groups/${CHECKIN_GROUP}/posts/${today.id}`}>Read it</Link>
        </p>
      ) : !verified ? (
        <ConfirmEmail />
      ) : (
        <form className="form" onSubmit={(event) => void send(event)}>
          {CHECKIN_QUESTIONS.map((q) => (
            <div className="field" key={q.id}>
              <label htmlFor={`checkin-${q.id}`}>{q.label}</label>
              <textarea
                id={`checkin-${q.id}`}
                rows={2}
                maxLength={1000}
                value={answers[q.id]}
                onChange={(event) => setAnswers((prev) => ({ ...prev, [q.id]: event.target.value }))}
                required
              />
            </div>
          ))}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="act act--wash" disabled={!ready || sending} style={{ justifySelf: 'start' }}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      )}
    </section>
  )
}
