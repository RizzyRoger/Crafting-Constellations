import { collection } from 'firebase/firestore'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { PageHead } from '../components/PageHead'
import { Quiet } from '../components/Quiet'
import { Talk } from '../components/Talk'
import { Who } from '../components/Who'
import { describeError } from '../lib/callables'
import { db } from '../lib/firebase'
import { useDocData, useQueryData } from '../lib/live'
import { among } from '../lib/people'
import { leaveChat } from '../lib/social'
import type { Chat as ChatDoc, Profile } from '../lib/types'
import { HEAD_DESCENDING } from '../wash/strokes'

// A private group chat: only the people on it can read or write
export const Chat = () => {
  const { chatId = '' } = useParams()
  const { uid, claims } = useMe()
  const navigate = useNavigate()
  const verified = claims.emailVerified
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Listeners close before leaving, so the rules never see a reader they'd reject
  const chat = useDocData<ChatDoc>(verified && !leaving ? `chats/${chatId}` : null)
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const byId = new Map(people.data.map((p) => [p.id, p]))

  if (!verified) {
    return (
      <Quiet>
        Confirm your email to open private chats. <Link to="/verify">Confirm email</Link>
      </Quiet>
    )
  }
  if (leaving) return <Quiet>Leaving the chat…</Quiet>
  if (chat.loading) return <Quiet>Opening…</Quiet>
  if (!chat.data || !chat.data.uids.includes(uid)) return <Quiet>This chat isn’t yours to open.</Quiet>

  const members = chat.data.uids.map((id) => byId.get(id)).filter((p): p is Profile => Boolean(p))

  const leave = async () => {
    setLeaving(true)
    setError(null)
    try {
      await new Promise((r) => setTimeout(r, 0))
      await leaveChat(chatId, uid)
      navigate('/messages')
    } catch (e) {
      setError(describeError(e))
      setLeaving(false)
    }
  }

  return (
    <div className="pane">
      <PageHead
        title={chat.data.name}
        kicker={`Private chat · ${chat.data.uids.length} ${chat.data.uids.length === 1 ? 'person' : 'people'}`}
        lede="Only the people here can read this. Messages are checked like everything else."
        strokes={HEAD_DESCENDING}
        seed={chatId.length * 17}
      >
        <div className="row" style={{ gap: '6px 16px' }}>
          {members.map((p) => (
            <Who key={p.id} person={{ ...p, avatarSeed: p.avatarSeed || p.id }} />
          ))}
        </div>
        <div className="row">
          <button type="button" className="link-btn" onClick={() => void leave()}>
            Leave chat
          </button>
        </div>
      </PageHead>

      {error && <p className="error">{error}</p>}

      <Talk
        path={`chats/${chatId}/messages`}
        me={uid}
        verified={verified}
        label="Private chat"
        privateThread
        people={among(people.data, chat.data.uids, uid)}
        host={<p>{chat.data.uids.length === 1 ? '1 person is in this chat.' : `${chat.data.uids.length} people are in this chat.`}</p>}
      />
    </div>
  )
}
