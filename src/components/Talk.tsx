import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useEffect, useRef, type ReactNode } from 'react'
import { db } from '../lib/firebase'
import { useLiveContent } from '../lib/live'
import type { Message } from '../lib/types'
import { Arrivals } from './Arrivals'
import { Composer, type Mentionable } from './Composer'
import { ConfirmEmail } from './ConfirmEmail'
import { HostNote } from './HostNote'
import { Item } from './Item'
import { MentionText } from './MentionText'

interface TalkProps {
  // A messages collection: groups/g/messages or chats/c/messages
  path: string
  me: string
  verified: boolean
  label?: string
  empty?: string
  // Shown in place of the one-line empty note, with a way into the composer
  host?: ReactNode
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
  host,
  privateThread = false,
  people,
}: TalkProps) => {
  const messages = useLiveContent<Message>(path, me, { direction: 'asc', max: 80 })
  const end = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  // A full window keeps its length as a new message pushes the oldest out, so the newest counts too
  const newest = messages.data.at(-1)?.id

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.data.length, newest])

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
      {/* Not live: it opens with its whole history. Arrivals says what's new */}
      <div className="chat" role="region" aria-label={label}>
        {messages.data.length === 0 && !messages.loading &&
          (host ? (
            <HostNote
              action={verified ? { label: 'Write the first note', onClick: () => field.current?.focus() } : undefined}
            >
              {host}
            </HostNote>
          ) : (
            <p className="empty">{empty}</p>
          ))}
        {messages.data.map((m) => (
          <Item key={m.id} item={m} me={me} blotSize={36} variant="bubble" privateThread={privateThread}>
            <MentionText text={m.text} mentioned={m.mentioned} me={me} />
          </Item>
        ))}
        <div ref={end} />
      </div>
      <Arrivals items={messages.data} opening={!messages.synced} me={me} />
      {verified ? (
        <Composer
          shape="bar"
          label="Message"
          submitLabel="Send"
          rows={1}
          context={privateThread ? 'private' : 'public'}
          people={people}
          textRef={field}
          onSubmit={send}
        />
      ) : (
        <ConfirmEmail />
      )}
    </div>
  )
}
