import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useEffect, useRef } from 'react'
import { db } from '../lib/firebase'
import { useLiveContent } from '../lib/live'
import type { Message } from '../lib/types'
import { Composer, type Mentionable } from './Composer'
import { ConfirmEmail } from './ConfirmEmail'
import { Item } from './Item'
import { MentionText } from './MentionText'

interface TalkProps {
  // A messages collection: groups/g/messages or chats/c/messages
  path: string
  me: string
  verified: boolean
  label?: string
  empty?: string
  // Private chats deliver crisis messages and show resources to everyone in them
  privateThread?: boolean
  // Who can be pinged with @: the people who can read this talk
  people?: readonly Mentionable[]
}

// Live chat bubbles with the send bar pinned under a full-height list
export const Talk = ({
  path,
  me,
  verified,
  label = 'Group talk',
  empty = 'Nobody has said anything yet. Say hello, or just read.',
  privateThread = false,
  people,
}: TalkProps) => {
  const messages = useLiveContent<Message>(path, me, { direction: 'asc', max: 80 })
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.data.length])

  const send = async (text: string, _title: string | undefined, mentions: string[]) => {
    await addDoc(collection(db, path), {
      authorUid: me,
      text,
      ...(mentions.length > 0 ? { mentions } : {}),
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  }

  return (
    <div className="stage">
      <div className="chat" aria-live="polite" aria-label={label}>
        {messages.data.length === 0 && !messages.loading && <p className="empty">{empty}</p>}
        {messages.data.map((m) => (
          <Item key={m.id} item={m} me={me} blotSize={36} variant="bubble" privateThread={privateThread}>
            <MentionText text={m.text} mentioned={m.mentioned} me={me} />
          </Item>
        ))}
        <div ref={end} />
      </div>
      {verified ? (
        <Composer
          shape="bar"
          label="Message"
          submitLabel="Send"
          rows={1}
          context={privateThread ? 'private' : 'public'}
          people={people}
          onSubmit={send}
        />
      ) : (
        <ConfirmEmail />
      )}
    </div>
  )
}
