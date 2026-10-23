import { checkPenName, PEN_NAME_HINTS, type PenNameProblem } from '@moderation'
import { FirebaseError } from 'firebase/app'
import { collection, query, where } from 'firebase/firestore'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { PageHead } from '../components/PageHead'
import { Who } from '../components/Who'
import { createChat, describeError, problemOf } from '../lib/callables'
import { db } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import { otherInPair } from '../lib/pair'
import type { Connection, Profile } from '../lib/types'
import { HEAD_DESCENDING } from '../wash/strokes'

// Matches functions/src/chats.ts
const MAX_CHAT_PEOPLE = 20

// Chat names pass the pen-name checks in their chat form, as functions/src/chats.ts
// does, so the hint matches the server; some hints read differently
const NAME_HINTS: Record<PenNameProblem, string> = {
  ...PEN_NAME_HINTS,
  mixed: 'Keep each word to one alphabet, so no letter can pass for another.',
  contact: 'No emails or long numbers.',
  reserved: 'Choose a name that doesn’t suggest a title or role.',
}

const errorText = (error: unknown) => {
  const problem = problemOf(error)
  if (problem && problem in NAME_HINTS) return NAME_HINTS[problem as PenNameProblem]
  if (error instanceof FirebaseError && error.code === 'functions/failed-precondition') return 'You can only add people you’re connected with.'
  return describeError(error)
}

// Start a private group chat with people you're already connected with
export const NewChat = () => {
  const { uid, claims } = useMe()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connections = useQueryData<Connection>(`connections|${uid}`, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const byId = new Map(people.data.map((p) => [p.id, p]))
  const friends = connections.data
    .filter((c) => c.status === 'accepted')
    .map((c) => byId.get(otherInPair(c.id, uid)))
    .filter((p): p is Profile => Boolean(p) && !p!.banned)
    .sort((a, b) => a.penName.localeCompare(b.penName))

  const check = checkPenName(name, { chat: true })
  const hint = name.trim() && !check.ok ? NAME_HINTS[check.problem] : null
  const full = picked.length >= MAX_CHAT_PEOPLE - 1

  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  const start = async (event: FormEvent) => {
    event.preventDefault()
    if (!check.ok || picked.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const { id } = await createChat({ name: check.value, uids: picked })
      navigate(`/chats/${id}`)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  const head = (
    <PageHead
      title="A private group chat"
      kicker="Private chat"
      lede="Bring a few of the people you’re connected with into one conversation. Only they can read it."
      strokes={HEAD_DESCENDING}
      seed={53}
    />
  )

  if (!claims.emailVerified) {
    return (
      <>
        {head}
        <div className="banner">
          <p className="pencil note">Private chats open once your email is confirmed.</p>
          <Link to="/verify" className="act act--wash" style={{ justifySelf: 'start' }}>
            Confirm email
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      {head}
      <form className="form" onSubmit={(e) => void start(e)}>
        <div className="field">
          <label htmlFor="chat-name">Name</label>
          <input id="chat-name" value={name} maxLength={40} placeholder="Tuesday dinners" onChange={(e) => setName(e.target.value)} aria-describedby="chat-name-hint" />
          <span id="chat-name-hint" className="hint">
            {hint ?? 'Everyone in the chat sees this name.'}
          </span>
        </div>

        <fieldset className="stack" style={{ gap: 10, border: 0, padding: 0, margin: 0 }}>
          <legend className="code">People ({picked.length} of up to {MAX_CHAT_PEOPLE - 1})</legend>
          {connections.loading || people.loading ? (
            <p className="meta">Finding your people…</p>
          ) : friends.length === 0 ? (
            <p className="pencil note">
              You can add people once you’re connected. Reach out from your <Link to="/constellation">constellation</Link> first.
            </p>
          ) : (
            friends.map((p) => (
              <label key={p.id} className="row" style={{ gap: 10 }}>
                <input type="checkbox" checked={picked.includes(p.id)} disabled={!picked.includes(p.id) && full} onChange={() => toggle(p.id)} />
                <Who person={{ ...p, avatarSeed: p.avatarSeed || p.id }} />
              </label>
            ))
          )}
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className="row">
          <button type="submit" className="act act--wash" disabled={busy || !check.ok || picked.length === 0}>
            {busy ? 'Starting…' : 'Start chat'}
          </button>
        </div>
      </form>
    </>
  )
}
