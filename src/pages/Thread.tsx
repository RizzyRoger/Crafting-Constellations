import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { Composer } from '../components/Composer'
import { Item } from '../components/Item'
import { Quiet } from '../components/Quiet'
import { Who } from '../components/Who'
import { db } from '../lib/firebase'
import { useDocData, useLiveContent } from '../lib/live'
import { otherInPair } from '../lib/pair'
import type { Connection, Message, Profile } from '../lib/types'

export const Thread = () => {
  const { pairId = '' } = useParams()
  const { uid, claims } = useMe()
  const participant = pairId.split('_').length === 2 && pairId.split('_').includes(uid)
  const otherUid = otherInPair(pairId, uid)

  const other = useDocData<Profile>(participant ? `users/${otherUid}` : null)
  const connection = useDocData<Connection>(participant ? `connections/${pairId}` : null)
  const open = participant && claims.emailVerified
  const messages = useLiveContent<Message>(open ? `dms/${pairId}/messages` : null, uid, { direction: 'asc', max: 200 })
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.data.length])

  if (!participant) return <Quiet>This conversation isn’t yours to open.</Quiet>
  if (!claims.emailVerified) {
    return (
      <Quiet>
        Confirm your email to open private notes. <Link to="/verify">Confirm email</Link>
      </Quiet>
    )
  }
  if (other.loading || connection.loading) return <Quiet>Opening…</Quiet>

  const canWrite = connection.data?.status === 'accepted'

  const send = async (text: string) => {
    await addDoc(collection(db, `dms/${pairId}/messages`), { authorUid: uid, text, status: 'pending', createdAt: serverTimestamp() })
  }

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 760 }}>
      <Link to="/messages" className="code">
        ← Private notes
      </Link>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        {other.data ? <Who person={{ ...other.data, avatarSeed: other.data.avatarSeed || other.data.id }} size={40} /> : <span>Someone</span>}
        <span className="meta">only the two of you can read this</span>
      </header>

      <div className="chat" aria-live="polite" aria-label="Conversation">
        {messages.data.length === 0 && !messages.loading && <p className="empty">Nothing written yet.</p>}
        {messages.data.map((m) => (
          <Item key={m.id} item={m} me={uid} blotSize={22} privateThread>
            <p className="voice">{m.text}</p>
          </Item>
        ))}
        <div ref={end} />
      </div>

      {canWrite ? (
        <Composer label="Write privately" submitLabel="Send" rows={2} context="private" onSubmit={send} />
      ) : (
        <p className="pencil note">
          {connection.data?.status === 'blocked'
            ? 'This conversation is closed.'
            : 'You can write once you’re connected. Reach out from the constellation, and write here when they accept.'}
        </p>
      )}
    </div>
  )
}
