import { addDoc, collection, query, serverTimestamp, where } from 'firebase/firestore'
import { useEffect, useRef } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { Arrivals } from '../components/Arrivals'
import { Composer } from '../components/Composer'
import { HostNote } from '../components/HostNote'
import { Item } from '../components/Item'
import { Quiet } from '../components/Quiet'
import { Said, useSaid } from '../components/Said'
import { Who } from '../components/Who'
import { db } from '../lib/firebase'
import { useDocData, useLiveContent, useQueryData } from '../lib/live'
import { findById } from '../lib/lookup'
import { otherInPair } from '../lib/pair'
import { isPairFor } from '../lib/pairFor'
import { hereOf } from '../lib/returnTo'
import type { Connection, Message, Profile } from '../lib/types'

export const Thread = () => {
  const { pairId = '' } = useParams()
  const { uid, claims } = useMe()
  const location = useLocation()
  const participant = isPairFor(pairId, uid)
  const otherUid = otherInPair(pairId, uid)

  const other = useDocData<Profile>(participant ? `users/${otherUid}` : null)
  // Found among my connections, not by its document: that's refused once it's gone
  // (disconnect, unblock), while the thread and its old notices still open here
  const connections = useQueryData<Connection>(participant ? `connections|${uid}` : null, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )
  const connection = findById(connections.data, pairId)
  const open = participant && claims.emailVerified
  const messages = useLiveContent<Message>(open ? `dms/${pairId}/messages` : null, uid, { direction: 'asc', max: 200 })
  const end = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const [said, say] = useSaid(pairId)
  // A full window keeps its length as a new note pushes the oldest out, so the newest counts too
  const newest = messages.data.at(-1)?.id

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.data.length, newest])

  if (!participant) return <Quiet>This conversation isn’t yours to open.</Quiet>
  if (!claims.emailVerified) {
    return (
      <Quiet>
        Confirm your email to open private notes. <Link to="/verify" state={{ from: hereOf(location) }}>Confirm email</Link>
      </Quiet>
    )
  }
  if (other.loading || connections.loading) return <Quiet>Opening…</Quiet>

  // A ban keeps the connection (an unban brings it back), but they can't read a note meanwhile
  const paused = other.data?.banned === true
  const canWrite = connection?.status === 'accepted' && !paused

  const send = async (text: string) => {
    await addDoc(collection(db, `dms/${pairId}/messages`), { authorUid: uid, text, status: 'pending', createdAt: serverTimestamp() })
  }

  return (
    <div className="stage">
      <Link to="/messages" className="code">
        ← Private notes
      </Link>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        {other.data ? <Who person={{ ...other.data, avatarSeed: other.data.avatarSeed || other.data.id }} size={40} /> : <span>Someone</span>}
        <span className="meta">only the two of you can read this</span>
      </header>

      {/* Not live: it opens with its whole history. Arrivals says what's new */}
      <div className="chat" role="region" aria-label="Conversation">
        {messages.data.length === 0 && !messages.loading && canWrite && (
          <HostNote
            action={{
              label: `Write the first note to ${other.data?.penName ?? 'them'}.`,
              onClick: () => field.current?.focus(),
            }}
          />
        )}
        {messages.data.length === 0 && !messages.loading && !canWrite && <p className="empty">Nothing written yet.</p>}
        {messages.data.map((m) => (
          <Item key={m.id} item={m} me={uid} blotSize={36} variant="bubble" privateThread say={say}>
            <p className="voice">{m.text}</p>
          </Item>
        ))}
        <div ref={end} />
      </div>
      <Arrivals items={messages.data} opening={!messages.synced} me={uid} />
      {/* What I did here, as withdrawing: Arrivals says only what they write */}
      <Said said={said} />

      {canWrite ? (
        <Composer shape="bar" label="Message" submitLabel="Send" rows={1} context="private" textRef={field} onSubmit={send} />
      ) : (
        <p className="pencil note">
          {connection?.status === 'blocked'
            ? 'This conversation is closed.'
            : paused
              ? 'This conversation is closed while their account is paused.'
              : 'You can write once you’re connected. Reach out from the constellation, and write here when they accept.'}
        </p>
      )}
    </div>
  )
}
